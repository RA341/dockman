import {useEffect, useSyncExternalStore} from 'react';
import {DockerService} from '../gen/docker/v1/docker_pb.ts';
import {useHostClient} from '../lib/api.ts';
import {useHostStore} from '../pages/compose/state/files.ts';

// Minimal structural view of the connect client so the module-level stream
// runner doesn't depend on generated client types.
interface EventsClient {
    containerEvents(
        req: { host?: string },
        options?: { signal?: AbortSignal },
    ): AsyncIterable<{ action: string }>;
}

// Module-level shared stream: however many views listen, a single events
// stream runs for the selected host (the server side already multiplexes one
// daemon subscription per host). Module scope survives component remounts.
let seq = 0;
const listeners = new Set<() => void>();
let currentHost: string | null = null;
let abort: AbortController | null = null;
let notifyTimer: ReturnType<typeof setTimeout> | null = null;

// coalesce bursts (a compose up emits one event per container) into a single
// refresh tick
function notify() {
    if (notifyTimer !== null) return;
    notifyTimer = setTimeout(() => {
        notifyTimer = null;
        seq++;
        listeners.forEach(listener => listener());
    }, 300);
}

async function run(client: EventsClient, host: string, signal: AbortSignal) {
    let backoff = 1000;
    while (!signal.aborted) {
        try {
            for await (const ev of client.containerEvents({host}, {signal})) {
                if (signal.aborted) return;
                backoff = 1000;
                if (!ev.action) continue; // keepalive frame
                notify();
            }
        } catch {
            // dropped stream: fall through to the backoff and resubscribe
        }
        if (signal.aborted) return;
        await new Promise(resolve => setTimeout(resolve, backoff));
        backoff = Math.min(backoff * 2, 30000);
    }
}

function ensureStream(client: EventsClient, host: string) {
    if (currentHost === host && abort !== null) return;
    abort?.abort();
    abort = new AbortController();
    currentHost = host;
    void run(client, host, abort.signal);
}

function subscribe(callback: () => void): () => void {
    listeners.add(callback);
    return () => {
        listeners.delete(callback);
        if (listeners.size === 0) {
            abort?.abort();
            abort = null;
            currentHost = null;
        }
    };
}

/**
 * Returns a counter bumped whenever a container lifecycle event (start, stop,
 * die, health transition...) happens on the selected host, bursts coalesced.
 * Add it to a fetch effect's dependencies to refetch reactively — and keep a
 * slow polling interval as a safety net, not as the primary refresh.
 */
export function useDockerEvents(): number {
    const client = useHostClient(DockerService);
    const host = useHostStore(state => state.host);

    const bump = useSyncExternalStore(subscribe, () => seq);

    useEffect(() => {
        ensureStream(client, host);
    }, [client, host]);

    return bump;
}
