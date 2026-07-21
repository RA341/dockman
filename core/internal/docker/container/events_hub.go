package container

import (
	"context"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/RA341/dockman/pkg/syncmap"
	"github.com/moby/moby/api/types/events"
	"github.com/moby/moby/client"
	"github.com/rs/zerolog/log"
)

// Event is a filtered daemon event relevant to container state, ready for
// the UI to react to (and for the activity log to persist later).
type Event struct {
	// base action: create/start/stop/die/kill/restart/pause/unpause/destroy/
	// rename/update/oom/health_status
	Action string
	// health_status only: healthy / unhealthy / ...
	Status   string
	ID       string // 12-char container id
	Name     string
	Image    string
	TimeNano int64
}

// allowedActions lists the container actions worth reacting to; everything
// else (exec_*, attach, top, archive...) is noise for state-driven views.
var allowedActions = map[string]struct{}{
	"create": {}, "start": {}, "stop": {}, "die": {}, "kill": {},
	"restart": {}, "pause": {}, "unpause": {}, "destroy": {},
	"rename": {}, "update": {}, "oom": {}, "health_status": {},
}

// eventsHub fans a single daemon /events subscription out to every listener
// of a host. It lives package-wide keyed by the moby client — one per
// connected host — because the request-scoped services are rebuilt on every
// RPC. The daemon subscription starts with the first listener, reconnects
// with backoff when the daemon drops it, and stops with the last listener.
type eventsHub struct {
	mu          sync.Mutex
	subscribers map[chan Event]struct{}
	stop        context.CancelFunc

	// the daemon repeats health_status on every probe; only transitions are
	// interesting
	lastHealth map[string]string
	// transport-level dedup, Dockhand-style: the same (container, action,
	// timestamp) delivered twice is dropped, distinct events never are
	recent map[string]int64
}

var eventHubs syncmap.Map[*client.Client, *eventsHub]

func hubFor(cli *client.Client) *eventsHub {
	hub, _ := eventHubs.LoadOrStore(cli, &eventsHub{
		subscribers: make(map[chan Event]struct{}),
		lastHealth:  make(map[string]string),
		recent:      make(map[string]int64),
	})
	return hub
}

// SubscribeEvents delivers this host's filtered container events until the
// returned cancel function is called. A slow consumer drops events rather
// than blocking the other listeners.
func (s *Service) SubscribeEvents() (<-chan Event, func()) {
	hub := hubFor(s.Client)

	ch := make(chan Event, 16)
	hub.mu.Lock()
	hub.subscribers[ch] = struct{}{}
	if hub.stop == nil {
		runCtx, cancel := context.WithCancel(context.Background())
		hub.stop = cancel
		go hub.run(runCtx, s.Client)
	}
	hub.mu.Unlock()

	var once sync.Once
	unsubscribe := func() {
		once.Do(func() {
			hub.mu.Lock()
			delete(hub.subscribers, ch)
			if len(hub.subscribers) == 0 && hub.stop != nil {
				hub.stop()
				hub.stop = nil
			}
			hub.mu.Unlock()
		})
	}
	return ch, unsubscribe
}

func (h *eventsHub) run(ctx context.Context, cli *client.Client) {
	filters := client.Filters{}
	filters.Add("type", string(events.ContainerEventType))

	backoff := time.Second
	for {
		res := cli.Events(ctx, client.EventsListOptions{Filters: filters})

	stream:
		for {
			select {
			case <-ctx.Done():
				return
			case msg := <-res.Messages:
				backoff = time.Second
				if ev, ok := h.filter(msg); ok {
					h.broadcast(ev)
				}
			case err := <-res.Err:
				if ctx.Err() != nil {
					return
				}
				log.Warn().Err(err).Msg("docker events stream interrupted, reconnecting")
				break stream
			}
		}

		// the client does not reopen the stream itself; back off and resubscribe
		select {
		case <-ctx.Done():
			return
		case <-time.After(backoff):
		}
		if backoff < 30*time.Second {
			backoff *= 2
		}
	}
}

func (h *eventsHub) broadcast(ev Event) {
	h.mu.Lock()
	defer h.mu.Unlock()
	for ch := range h.subscribers {
		select {
		case ch <- ev:
		default: // slow consumer: drop rather than block the hub
		}
	}
}

func (h *eventsHub) filter(msg events.Message) (Event, bool) {
	if msg.Type != events.ContainerEventType {
		return Event{}, false
	}

	// health arrives as "health_status: healthy"
	action, status, _ := strings.Cut(string(msg.Action), ": ")
	if _, ok := allowedActions[action]; !ok {
		return Event{}, false
	}

	id := msg.Actor.ID
	if len(id) > 12 {
		id = id[:12]
	}

	h.mu.Lock()
	defer h.mu.Unlock()

	if action == "health_status" {
		if h.lastHealth[id] == status {
			return Event{}, false
		}
		h.lastHealth[id] = status
	}
	if action == "destroy" {
		delete(h.lastHealth, id)
	}

	key := id + "|" + string(msg.Action) + "|" + strconv.FormatInt(msg.TimeNano, 10)
	now := time.Now().UnixNano()
	if last, ok := h.recent[key]; ok && now-last < 5*int64(time.Second) {
		return Event{}, false
	}
	h.recent[key] = now
	if len(h.recent) > 512 {
		for k, ts := range h.recent {
			if now-ts > 10*int64(time.Second) {
				delete(h.recent, k)
			}
		}
	}

	return Event{
		Action:   action,
		Status:   status,
		ID:       id,
		Name:     msg.Actor.Attributes["name"],
		Image:    msg.Actor.Attributes["image"],
		TimeNano: msg.TimeNano,
	}, true
}
