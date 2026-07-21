package container

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func collectLines(w *logLineWriter) *[]LogLine {
	var got []LogLine
	w.emit = func(l LogLine) { got = append(got, l) }
	return &got
}

func TestLogLineWriterSplitsLines(t *testing.T) {
	w := &logLineWriter{id: "abc", name: "web", stream: StreamStdout}
	got := collectLines(w)

	_, err := w.Write([]byte("first line\nsecond line\n"))
	require.NoError(t, err)

	require.Len(t, *got, 2)
	require.Equal(t, "first line", (*got)[0].Text)
	require.Equal(t, "second line", (*got)[1].Text)
	require.Equal(t, "abc", (*got)[0].ContainerID)
	require.Equal(t, "web", (*got)[0].ContainerName)
	require.Equal(t, StreamStdout, (*got)[0].Stream)
}

func TestLogLineWriterCarryoverBetweenWrites(t *testing.T) {
	w := &logLineWriter{stream: StreamStderr}
	got := collectLines(w)

	_, _ = w.Write([]byte("split in "))
	require.Empty(t, *got, "no newline yet, nothing should be emitted")

	_, _ = w.Write([]byte("the middle\nnext"))
	require.Len(t, *got, 1)
	require.Equal(t, "split in the middle", (*got)[0].Text)
	require.Equal(t, StreamStderr, (*got)[0].Stream)

	// stream ends without a trailing newline: Flush emits the leftover
	w.Flush()
	require.Len(t, *got, 2)
	require.Equal(t, "next", (*got)[1].Text)

	// flushing twice must not duplicate the line
	w.Flush()
	require.Len(t, *got, 2)
}

func TestLogLineWriterTrimsCarriageReturn(t *testing.T) {
	w := &logLineWriter{}
	got := collectLines(w)

	_, _ = w.Write([]byte("windows style\r\n"))
	require.Len(t, *got, 1)
	require.Equal(t, "windows style", (*got)[0].Text)
}

func TestLogLineWriterCollapsesProgressOverwrites(t *testing.T) {
	w := &logLineWriter{}
	got := collectLines(w)

	// a terminal shows only what was written after the last \r
	_, _ = w.Write([]byte("Downloading 10%\rDownloading 60%\rDone\n"))
	require.Len(t, *got, 1)
	require.Equal(t, "Done", (*got)[0].Text)

	// the daemon timestamp sits before the overwrites and must survive
	stamp := "2026-07-17T10:11:12.123456789Z"
	_, _ = w.Write([]byte(stamp + " 10%\r20%\n"))
	require.Len(t, *got, 2)
	require.Equal(t, "20%", (*got)[1].Text)
	require.NotZero(t, (*got)[1].TimeNano)
}

func TestLogLineWriterBoundsPartialBuffer(t *testing.T) {
	w := &logLineWriter{}
	got := collectLines(w)

	// \r-only output never produces a newline: the carry buffer must
	// force-flush instead of growing forever
	chunk := make([]byte, maxPartialLine+16)
	for i := range chunk {
		chunk[i] = 'x'
	}
	_, _ = w.Write(chunk)
	require.Len(t, *got, 1)
	require.LessOrEqual(t, len(w.partial), maxPartialLine)
}

func TestSplitLogTimestamp(t *testing.T) {
	stamp := "2026-07-17T10:11:12.123456789Z"
	nano, text := splitLogTimestamp(stamp + " hello world")
	expected, err := time.Parse(time.RFC3339Nano, stamp)
	require.NoError(t, err)
	require.Equal(t, expected.UnixNano(), nano)
	require.Equal(t, "hello world", text)

	// no timestamp prefix: line passes through untouched
	nano, text = splitLogTimestamp("plain text line")
	require.Zero(t, nano)
	require.Equal(t, "plain text line", text)

	// empty and spaceless lines
	nano, text = splitLogTimestamp("")
	require.Zero(t, nano)
	require.Equal(t, "", text)

	nano, text = splitLogTimestamp("nospace")
	require.Zero(t, nano)
	require.Equal(t, "nospace", text)

	// timestamped empty line (blank log line from the daemon)
	nano, text = splitLogTimestamp(stamp + " ")
	require.Equal(t, expected.UnixNano(), nano)
	require.Equal(t, "", text)
}

func TestLogLineWriterKeepsDaemonTimestamps(t *testing.T) {
	w := &logLineWriter{id: "abc", name: "web", stream: StreamStdout}
	got := collectLines(w)

	_, _ = w.Write([]byte("2026-07-17T08:00:00.000000000Z app started\n"))
	require.Len(t, *got, 1)
	require.Equal(t, "app started", (*got)[0].Text)
	require.NotZero(t, (*got)[0].TimeNano)
}
