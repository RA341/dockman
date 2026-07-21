import {useCallback, useEffect, useRef, useState} from "react";
import {useHostClient} from "../../lib/api.ts";
import {DockerService} from "../../gen/docker/v1/docker_pb.ts";
import {createAnsiTracker} from "./ansi.ts";
import {appendEntries, isKeepAlive, type LogEntry, STREAM_INTERNAL, toLogEntry} from "./log-model.ts";

export type LogStreamStatus = 'idle' | 'connecting' | 'live' | 'reconnecting' | 'paused' | 'ended';

export interface LogsStreamParams {
    containerIds: string[];
    tail: number;
    since?: number; // unix seconds, undefined = from the tail only
    until?: number;
    follow: boolean;
    // pausing (or suspending a hidden tab) closes the stream, keeps the buffer
    paused: boolean;
    // bump to drop the buffer and reload the stream from scratch
    reloadKey?: number;
}

const FLUSH_DELAY_MS = 80;
const RETRY_MIN_MS = 1000;
const RETRY_MAX_MS = 30000;

// Streams the requested containers' logs into an immutable, capped LogEntry
// buffer. Resuming (after a pause or a silent reconnection) replays from the
// last seen timestamp and drops only the overlap it already has — never live
// lines: the replay filter compares against a snapshot taken at connect time,
// so distinct live lines sharing one timestamp all pass.
export function useLogsStream(params: LogsStreamParams) {
    const client = useHostClient(DockerService);
    const [entries, setEntries] = useState<LogEntry[]>([]);
    const [status, setStatus] = useState<LogStreamStatus>('idle');
    const [lastError, setLastError] = useState("");

    const idsKey = params.containerIds.join(',');
    const {tail, since, until, follow, paused, reloadKey = 0} = params;

    // newest daemon timestamp seen per container, used to bound resumes
    const lastNanoRef = useRef<Map<string, bigint>>(new Map());
    // newest timestamp seen overall: lines without one inherit it as their
    // ordering key so they keep their arrival position in the sorted buffer
    const sortKeyRef = useRef(0n);

    const clear = useCallback(() => {
        setEntries([]);
    }, []);

    // changing what is being streamed starts a fresh buffer; pausing does not
    useEffect(() => {
        setEntries([]);
        lastNanoRef.current = new Map();
        sortKeyRef.current = 0n;
    }, [client, idsKey, tail, since, until, follow, reloadKey]);

    useEffect(() => {
        if (!idsKey) {
            setStatus('idle');
            return;
        }
        if (paused) {
            setStatus('paused');
            return;
        }

        const abort = new AbortController();
        let closed = false;
        let pending: LogEntry[] = [];
        let flushTimer: ReturnType<typeof setTimeout> | null = null;

        const flush = () => {
            flushTimer = null;
            if (pending.length === 0) return;
            const batch = pending;
            pending = [];
            setEntries(prev => appendEntries(prev, batch));
        };
        const scheduleFlush = () => {
            if (flushTimer === null) {
                flushTimer = setTimeout(flush, FLUSH_DELAY_MS);
            }
        };

        const containerIds = idsKey.split(',');

        // colors opened on one line carry to the next (banners are colored
        // once for a whole block); state survives silent reconnections
        const ansiTracker = createAnsiTracker();

        // resume/reconnect from just before the oldest "last seen" timestamp;
        // the replay snapshot below drops the overlap
        const resumeSince = (): number => {
            const seen = containerIds
                .map(id => lastNanoRef.current.get(id) ?? 0n)
                .filter(n => n !== 0n);
            if (seen.length === 0) return since ?? 0;
            const oldest = seen.reduce((a, b) => (a < b ? a : b));
            return Number(oldest / 1000000000n);
        };

        const run = async () => {
            let attempt = 0;
            let backoff = RETRY_MIN_MS;
            while (!closed) {
                setStatus(attempt === 0 ? 'connecting' : 'reconnecting');
                attempt++;
                let live = false;
                // fixed snapshot: only lines at or before these timestamps are
                // replayed history; everything past them is live and never dropped
                const replayBar = new Map(lastNanoRef.current);
                try {
                    const stream = client.containerLogsStream({
                        containerIds,
                        tail,
                        since: BigInt(resumeSince()),
                        until: BigInt(until ?? 0),
                        follow,
                    }, {signal: abort.signal});

                    for await (const line of stream) {
                        if (isKeepAlive(line)) {
                            // the server is reachable even if no lines flow
                            if (!live) {
                                live = true;
                                backoff = RETRY_MIN_MS;
                                setStatus('live');
                                setLastError("");
                            }
                            continue;
                        }

                        // dockman-injected failure notices: show them, but they
                        // are not container output — no watermark, no pacing reset
                        if (line.stream !== STREAM_INTERNAL) {
                            if (!live) {
                                live = true;
                                backoff = RETRY_MIN_MS;
                                setStatus('live');
                                setLastError("");
                            }
                            if (line.timeNano !== 0n) {
                                const bar = replayBar.get(line.containerId);
                                if (bar !== undefined && line.timeNano <= bar) continue; // replayed overlap
                                const seen = lastNanoRef.current.get(line.containerId) ?? 0n;
                                if (line.timeNano > seen) {
                                    lastNanoRef.current.set(line.containerId, line.timeNano);
                                }
                            }
                        }

                        const segments = ansiTracker(`${line.containerId}|${line.stream}`, line.text);
                        if (line.timeNano > sortKeyRef.current) {
                            sortKeyRef.current = line.timeNano;
                        }
                        const sortKey = line.timeNano !== 0n ? line.timeNano : sortKeyRef.current;
                        pending.push(toLogEntry(line, segments, sortKey));
                        scheduleFlush();
                    }

                    if (!follow) {
                        // bounded query: the stream ending is the happy path
                        flush();
                        setStatus('ended');
                        return;
                    }
                    // follow stream ended without an abort: server went away
                } catch (err) {
                    if (closed || abort.signal.aborted) return;
                    setLastError(err instanceof Error ? err.message : String(err));
                }

                flush();
                setStatus('reconnecting');
                await new Promise(resolve => setTimeout(resolve, backoff));
                backoff = Math.min(backoff * 2, RETRY_MAX_MS);
            }
        };
        void run();

        return () => {
            closed = true;
            abort.abort();
            if (flushTimer !== null) clearTimeout(flushTimer);
        };
    }, [client, idsKey, tail, since, until, follow, paused, reloadKey]);

    return {entries, status, lastError, clear};
}
