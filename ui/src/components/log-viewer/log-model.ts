import type {LogLine} from "../../gen/docker/v1/docker_pb.ts";
import type {AnsiSegment} from "./ansi.ts";

export interface LogEntry {
    id: number;
    // plain text with ANSI codes stripped: what search, copy and download see
    text: string;
    // styled segments parsed once on arrival, with cross-line SGR continuity
    segments: AnsiSegment[];
    timeNano: bigint; // 0n when the line had no parsable daemon timestamp
    // chronological ordering key: the daemon timestamp, or for lines without
    // one the newest timestamp seen at arrival so they keep their position
    sortKey: bigint;
    stream: number; // 0 = dockman-internal notice, 1 = stdout, 2 = stderr
    containerId: string;
    containerName: string;
}

// lines dockman itself injects (stream failures) — not container output
export const STREAM_INTERNAL = 0;

// soft cap: the buffer may grow to 2x before being compacted back, so steady
// streaming does not reslice the whole array on every batch
const LOG_BUFFER_CAP = 2000;

let nextEntryId = 1;

// an empty frame is the server keepalive, not a log line
export const isKeepAlive = (line: LogLine) =>
    line.containerId === "" && line.text === "" && line.timeNano === 0n;

export function toLogEntry(line: LogLine, segments: AnsiSegment[], sortKey: bigint): LogEntry {
    return {
        id: nextEntryId++,
        text: segments.map(s => s.text).join(""),
        segments,
        timeNano: line.timeNano,
        sortKey,
        stream: line.stream,
        containerId: line.containerId,
        containerName: line.containerName,
    };
}

// merges a batch into the buffer keeping it sorted by sortKey: the containers
// of a merged view replay their history concurrently, so lines arrive
// interleaved by reader speed — display must follow the timestamps instead
const bySortKey = (a: LogEntry, b: LogEntry) =>
    a.sortKey < b.sortKey ? -1 : a.sortKey > b.sortKey ? 1 : 0;

export function appendEntries(buffer: LogEntry[], batch: LogEntry[]): LogEntry[] {
    if (batch.length === 0) return buffer;
    // stable sort: equal timestamps keep their arrival order
    let sorted = [...batch].sort(bySortKey);
    // an oversized batch alone can exceed the cap, pre-trim it
    if (sorted.length > LOG_BUFFER_CAP) sorted = sorted.slice(-LOG_BUFFER_CAP);

    let next: LogEntry[];
    if (buffer.length === 0 || sorted[0].sortKey >= buffer[buffer.length - 1].sortKey) {
        // fast path: the whole batch belongs at the end
        next = [...buffer, ...sorted];
    } else {
        // merge two sorted arrays; buffer entries win ties to stay stable
        next = new Array<LogEntry>(buffer.length + sorted.length);
        let i = 0, j = 0, k = 0;
        while (i < buffer.length && j < sorted.length) {
            next[k++] = buffer[i].sortKey <= sorted[j].sortKey ? buffer[i++] : sorted[j++];
        }
        while (i < buffer.length) next[k++] = buffer[i++];
        while (j < sorted.length) next[k++] = sorted[j++];
    }

    if (next.length > LOG_BUFFER_CAP * 2) {
        return next.slice(-LOG_BUFFER_CAP);
    }
    return next;
}

// merged-view container prefix palette, assigned by position in the request
const CONTAINER_COLORS = [
    '#64b5f6', '#81c784', '#ffb74d', '#e57373', '#ba68c8',
    '#f06292', '#4db6ac', '#fff176', '#a1887f', '#90a4ae',
];

export const containerColor = (index: number) =>
    CONTAINER_COLORS[((index % CONTAINER_COLORS.length) + CONTAINER_COLORS.length) % CONTAINER_COLORS.length];

export function formatLogTime(timeNano: bigint): string {
    if (timeNano === 0n) return "";
    const date = new Date(Number(timeNano / 1000000n));
    const pad = (n: number, w = 2) => String(n).padStart(w, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} `
        + `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`;
}

// case-insensitive matching via regex on the original text: unlike a
// toLowerCase+indexOf scan, offsets always align (case folding can change
// string length, e.g. İ), and there is no per-line lowered copy to allocate
export interface LogQuery {
    // non-global, for boolean tests
    test: RegExp;
    // global twin, for highlight scanning
    scan: RegExp;
}

export function compileQuery(raw: string): LogQuery | null {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return {test: new RegExp(escaped, 'i'), scan: new RegExp(escaped, 'gi')};
}

export const matchesQuery = (entry: LogEntry, query: LogQuery) =>
    query.test.test(entry.text) || query.test.test(entry.containerName);

// plain-text export used by copy and download
export function logsToText(entries: LogEntry[], withTimestamps: boolean, withNames: boolean): string {
    return entries.map(e => {
        let line = "";
        if (withTimestamps && e.timeNano !== 0n) line += `${formatLogTime(e.timeNano)} `;
        if (withNames && e.containerName) line += `[${e.containerName}] `;
        return line + e.text;
    }).join("\n");
}

// splits ANSI segments around query matches so the matching parts can be
// wrapped in <mark> without disturbing the styling
export interface HighlightedPiece {
    segment: AnsiSegment;
    isMatch: boolean;
}

export function highlightSegments(segments: AnsiSegment[], query: LogQuery): HighlightedPiece[] {
    const pieces: HighlightedPiece[] = [];
    for (const segment of segments) {
        const text = segment.text;
        let from = 0;
        query.scan.lastIndex = 0;
        for (let m = query.scan.exec(text); m !== null; m = query.scan.exec(text)) {
            if (m.index > from) {
                pieces.push({segment: {...segment, text: text.slice(from, m.index)}, isMatch: false});
            }
            if (m[0] !== "") {
                pieces.push({segment: {...segment, text: m[0]}, isMatch: true});
                from = m.index + m[0].length;
            }
            // never spin on a zero-length match
            if (m[0] === "") query.scan.lastIndex++;
        }
        if (from < text.length) {
            pieces.push({segment: {...segment, text: text.slice(from)}, isMatch: false});
        }
    }
    return pieces;
}
