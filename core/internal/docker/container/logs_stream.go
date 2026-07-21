package container

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/moby/moby/api/pkg/stdcopy"
	"github.com/moby/moby/client"
	"github.com/rs/zerolog/log"
)

const (
	// defaultStreamTail bounds the history replayed per container when the
	// client does not ask for a specific amount
	defaultStreamTail = 1000

	// mergedTailFloor is the per-container minimum when a merged request
	// splits its tail budget across containers
	mergedTailFloor = 50

	// maxPartialLine force-flushes a line that never sees a newline
	// (\r-only progress output) so the carry buffer stays bounded
	maxPartialLine = 64 * 1024

	// StreamInternal tags lines dockman itself injects (stream failures);
	// they carry no daemon timestamp and are not container output
	StreamInternal int32 = 0
	StreamStdout   int32 = 1
	StreamStderr   int32 = 2
)

// LogsStreamOptions mirrors the ContainerLogsStream request
type LogsStreamOptions struct {
	Tail   int32
	Since  int64 // unix seconds, 0 = unbounded
	Until  int64
	Follow bool
}

// LogLine is one demuxed container log line; TimeNano is 0 when the daemon
// line carried no parsable timestamp
type LogLine struct {
	ContainerID   string
	ContainerName string
	Text          string
	TimeNano      int64
	Stream        int32
}

// LogsStream reads the logs of every requested container concurrently and
// calls emit for each line until all readers finish (follow=false) or ctx is
// canceled. emit may be called from multiple goroutines.
func (s *Service) LogsStream(ctx context.Context, containerIDs []string, opts LogsStreamOptions, emit func(LogLine)) error {
	if len(containerIDs) == 0 {
		return fmt.Errorf("at least one container id is required")
	}

	tail := opts.Tail
	if tail <= 0 {
		tail = defaultStreamTail
	}
	// merged view: treat tail as a global budget so N containers do not each
	// replay the full amount (the client caps its buffer anyway)
	if n := int32(len(containerIDs)); n > 1 {
		perContainer := tail / n
		if perContainer < mergedTailFloor {
			perContainer = mergedTailFloor
		}
		if perContainer < tail {
			tail = perContainer
		}
	}

	logOpts := client.ContainerLogsOptions{
		ShowStdout: true,
		ShowStderr: true,
		// always ask the daemon for timestamps: they are stripped from the
		// text and carried separately so the client can toggle them
		Timestamps: true,
		Follow:     opts.Follow,
		Tail:       strconv.Itoa(int(tail)),
	}
	if opts.Since > 0 {
		logOpts.Since = strconv.FormatInt(opts.Since, 10)
	}
	if opts.Until > 0 {
		logOpts.Until = strconv.FormatInt(opts.Until, 10)
	}

	streamCtx, cancel := context.WithCancel(ctx)
	defer cancel()

	var wg sync.WaitGroup
	for _, id := range containerIDs {
		wg.Add(1)
		go func(containerID string) {
			defer wg.Done()
			err := s.streamContainerLogs(streamCtx, containerID, logOpts, emit)
			if err != nil && streamCtx.Err() == nil {
				log.Warn().Err(err).Str("container", containerID).Msg("container log stream failed")
				// surface the failure in the viewer instead of dying silently;
				// StreamInternal + no timestamp keeps it out of the client's
				// replay watermark and reconnect pacing
				emit(LogLine{
					ContainerID:   containerID,
					ContainerName: containerID,
					Text:          "dockman: log stream error: " + err.Error(),
					Stream:        StreamInternal,
				})
			}
		}(id)
	}
	wg.Wait()
	return nil
}

// streamContainerLogs keeps a container's logs flowing for as long as the
// request lives. The daemon ends a follow stream every time the container
// stops, so in follow mode the reader is reopened, resuming with nanosecond
// precision right after the last delivered line — a restarted container keeps
// logging into the same stream instead of going silent.
func (s *Service) streamContainerLogs(ctx context.Context, containerID string, logOpts client.ContainerLogsOptions, emit func(LogLine)) error {
	var lastNano int64
	emitTracked := func(l LogLine) {
		if l.TimeNano > lastNano {
			lastNano = l.TimeNano
		}
		emit(l)
	}

	opts := logOpts
	reopenDelay := time.Second
	for {
		emittedBefore := lastNano
		err := s.openContainerLogsOnce(ctx, containerID, opts, emitTracked)
		if err != nil || !opts.Follow || ctx.Err() != nil {
			return err
		}

		// resume just past the last delivered line; Tail switches to "all" so
		// nothing inside the resume window is skipped
		if lastNano > 0 {
			opts.Since = time.Unix(0, lastNano+1).UTC().Format(time.RFC3339Nano)
			opts.Tail = "all"
		}

		// a container that stays down should not be polled aggressively
		if lastNano > emittedBefore {
			reopenDelay = time.Second
		} else {
			reopenDelay = min(reopenDelay*2, 10*time.Second)
		}
		select {
		case <-ctx.Done():
			return nil
		case <-time.After(reopenDelay):
		}
	}
}

func (s *Service) openContainerLogsOnce(ctx context.Context, containerID string, logOpts client.ContainerLogsOptions, emit func(LogLine)) error {
	inspect, err := s.Client.ContainerInspect(ctx, containerID, client.ContainerInspectOptions{})
	if err != nil {
		return fmt.Errorf("unable to inspect container: %w", err)
	}
	name := strings.TrimPrefix(inspect.Container.Name, "/")

	reader, err := s.Client.ContainerLogs(ctx, containerID, logOpts)
	if err != nil {
		return fmt.Errorf("unable to open container logs: %w", err)
	}
	defer func() { _ = reader.Close() }()

	// the demux loop below blocks on reader.Reader; closing the reader when
	// the client goes away is what unblocks it. openCtx scopes the closer
	// goroutine to this open, so reopen cycles do not accumulate goroutines.
	openCtx, openCancel := context.WithCancel(ctx)
	defer openCancel()
	go func() {
		<-openCtx.Done()
		_ = reader.Close()
	}()

	stdout := &logLineWriter{id: containerID, name: name, stream: StreamStdout, emit: emit}
	stderr := &logLineWriter{id: containerID, name: name, stream: StreamStderr, emit: emit}
	defer stdout.Flush()
	defer stderr.Flush()

	if inspect.Container.Config.Tty {
		// tty streams have no multiplex framing, everything is stdout
		_, err = io.Copy(stdout, reader)
	} else {
		_, err = stdcopy.StdCopy(stdout, stderr, reader)
	}
	if err != nil && ctx.Err() == nil {
		return err
	}
	return nil
}

// logLineWriter splits a raw log byte stream into lines, keeping the trailing
// partial line between writes until its newline (or Flush) arrives; the carry
// buffer is reused across writes and force-flushed if it grows pathological
type logLineWriter struct {
	id      string
	name    string
	stream  int32
	emit    func(LogLine)
	partial []byte
}

func (w *logLineWriter) Write(p []byte) (int, error) {
	w.partial = append(w.partial, p...)

	start := 0
	for {
		idx := bytes.IndexByte(w.partial[start:], '\n')
		if idx < 0 {
			break
		}
		w.emitLine(w.partial[start : start+idx])
		start += idx + 1
	}
	if start > 0 {
		kept := copy(w.partial, w.partial[start:])
		w.partial = w.partial[:kept]
	}

	// \r-only progress output never produces a newline: flush a bounded
	// snapshot instead of growing forever
	if len(w.partial) > maxPartialLine {
		w.emitLine(w.partial)
		w.partial = w.partial[:0]
	}
	return len(p), nil
}

// Flush emits the pending partial line, if any; call it when the stream ends
func (w *logLineWriter) Flush() {
	if len(w.partial) > 0 {
		w.emitLine(w.partial)
		w.partial = w.partial[:0]
	}
}

func (w *logLineWriter) emitLine(line []byte) {
	text := strings.TrimSuffix(string(line), "\r")
	// the daemon timestamp sits at the start of the line: take it off before
	// collapsing any carriage-return overwrites
	timeNano, text := splitLogTimestamp(text)
	// carriage-return overwrites (progress bars): a terminal only shows what
	// was written after the last \r, so keep exactly that
	if idx := strings.LastIndexByte(text, '\r'); idx >= 0 {
		text = text[idx+1:]
	}
	w.emit(LogLine{
		ContainerID:   w.id,
		ContainerName: w.name,
		Text:          text,
		TimeNano:      timeNano,
		Stream:        w.stream,
	})
}

// splitLogTimestamp strips the RFC3339Nano prefix the daemon adds when logs
// are requested with Timestamps: true; lines without one pass through as-is
func splitLogTimestamp(line string) (int64, string) {
	idx := strings.IndexByte(line, ' ')
	if idx <= 0 {
		return 0, line
	}
	// cheap shape check before the (comparatively) expensive time.Parse:
	// daemon timestamps always look like 2006-01-02T15:04:05...
	head := line[:idx]
	if len(head) < 20 || head[4] != '-' || head[7] != '-' || head[10] != 'T' {
		return 0, line
	}
	ts, err := time.Parse(time.RFC3339Nano, head)
	if err != nil {
		return 0, line
	}
	return ts.UnixNano(), line[idx+1:]
}
