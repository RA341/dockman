// Minimal ANSI SGR parser: turns a raw log line into styled segments that can
// be rendered as plain React spans (no innerHTML). Non-SGR escape sequences
// (cursor movement, OSC titles...) are stripped.
//
// The 16 base colors are kept as palette indexes so the viewer can resolve
// them against its dark or light palette at render time; 256-color and
// truecolor sequences resolve to concrete values.

export interface AnsiSegment {
    text: string;
    // 0-15 palette index, resolved by the active theme at render time
    colorIdx?: number;
    backgroundIdx?: number;
    // concrete css color (256-color cube / truecolor)
    color?: string;
    background?: string;
    bold?: boolean;
    dim?: boolean;
    italic?: boolean;
    underline?: boolean;
}

// the VS Code terminal palette: what `docker logs` looks like in a real
// terminal, and what the previous xterm-based viewer rendered
export const ANSI_PALETTE_DARK = [
    '#3f3f3f', '#cd3131', '#0dbc79', '#e5e510',
    '#2472c8', '#bc3fbc', '#11a8cd', '#e5e5e5',
    '#666666', '#f14c4c', '#23d18b', '#f5f543',
    '#3b8eea', '#d670d6', '#29b8db', '#ffffff',
];

// same hues, darkened to stay readable on a light background
export const ANSI_PALETTE_LIGHT = [
    '#424242', '#c62828', '#2e7d32', '#9e7c00',
    '#1565c0', '#7b1fa2', '#00838f', '#616161',
    '#757575', '#e53935', '#43a047', '#b8860b',
    '#1e88e5', '#8e24aa', '#00acc1', '#212121',
];

function xterm256Color(n: number): string | undefined {
    if (n < 16 || n > 255) return undefined;
    if (n < 232) {
        // 6x6x6 color cube
        const v = n - 16;
        const steps = [0, 95, 135, 175, 215, 255];
        const r = steps[Math.floor(v / 36) % 6];
        const g = steps[Math.floor(v / 6) % 6];
        const b = steps[v % 6];
        return `rgb(${r},${g},${b})`;
    }
    // grayscale ramp
    const gray = 8 + (n - 232) * 10;
    return `rgb(${gray},${gray},${gray})`;
}

// SGR state carried across lines: a real terminal keeps the current color
// until a reset, even across newlines (multi-line banners are colored once)
export interface AnsiState {
    colorIdx?: number;
    backgroundIdx?: number;
    color?: string;
    background?: string;
    bold?: boolean;
    dim?: boolean;
    italic?: boolean;
    underline?: boolean;
}

type SgrState = AnsiState;

const hasState = (s: SgrState) => Object.keys(s).length > 0;

function setFg(state: SgrState, idx?: number, concrete?: string) {
    delete state.colorIdx;
    delete state.color;
    if (idx !== undefined) state.colorIdx = idx;
    if (concrete !== undefined) state.color = concrete;
}

function setBg(state: SgrState, idx?: number, concrete?: string) {
    delete state.backgroundIdx;
    delete state.background;
    if (idx !== undefined) state.backgroundIdx = idx;
    if (concrete !== undefined) state.background = concrete;
}

function applySgr(state: SgrState, params: number[]): SgrState {
    let next = {...state};
    for (let i = 0; i < params.length; i++) {
        const p = params[i];
        if (p === 0) next = {};
        else if (p === 1) next.bold = true;
        else if (p === 2) next.dim = true;
        else if (p === 3) next.italic = true;
        else if (p === 4) next.underline = true;
        else if (p === 22) { delete next.bold; delete next.dim; }
        else if (p === 23) delete next.italic;
        else if (p === 24) delete next.underline;
        else if (p >= 30 && p <= 37) setFg(next, p - 30);
        else if (p === 39) setFg(next);
        else if (p >= 40 && p <= 47) setBg(next, p - 40);
        else if (p === 49) setBg(next);
        else if (p >= 90 && p <= 97) setFg(next, p - 90 + 8);
        else if (p >= 100 && p <= 107) setBg(next, p - 100 + 8);
        else if (p === 38 || p === 48) {
            // extended color: 38;5;n or 38;2;r;g;b
            const set = p === 38 ? setFg : setBg;
            if (params[i + 1] === 5) {
                const n = params[i + 2] ?? -1;
                if (n >= 0 && n < 16) set(next, n);
                else {
                    const c = xterm256Color(n);
                    if (c) set(next, undefined, c);
                }
                i += 2;
            } else if (params[i + 1] === 2) {
                const [r, g, b] = [params[i + 2] ?? 0, params[i + 3] ?? 0, params[i + 4] ?? 0];
                set(next, undefined, `rgb(${r},${g},${b})`);
                i += 4;
            }
        }
    }
    return next;
}

const ESC = '\x1b';

export interface ParsedLine {
    segments: AnsiSegment[];
    // state left active at the end of the line, to seed the next one
    end: AnsiState;
}

export function parseAnsi(line: string, initial: AnsiState = {}): ParsedLine {
    if (!line.includes(ESC)) {
        const segments: AnsiSegment[] = line
            ? [hasState(initial) ? {text: line, ...initial} : {text: line}]
            : [];
        return {segments, end: initial};
    }

    const segments: AnsiSegment[] = [];
    let state: SgrState = {...initial};
    let plain = '';

    const push = () => {
        if (plain) {
            segments.push({text: plain, ...state});
            plain = '';
        }
    };

    let i = 0;
    while (i < line.length) {
        const ch = line[i];
        if (ch !== ESC) {
            plain += ch;
            i++;
            continue;
        }

        const kind = line[i + 1];
        if (kind === '[') {
            // CSI sequence: params, then one final byte in @-~
            let j = i + 2;
            while (j < line.length && !(line[j] >= '@' && line[j] <= '~')) j++;
            if (j >= line.length) break; // truncated sequence, drop the rest
            if (line[j] === 'm') {
                push();
                const raw = line.slice(i + 2, j);
                const params = raw === '' ? [0] : raw.split(';').map(s => Number(s) || 0);
                state = applySgr(state, params);
            }
            i = j + 1;
        } else if (kind === ']') {
            // OSC sequence: ends with BEL or ESC-backslash
            let j = i + 2;
            while (j < line.length && line[j] !== '\x07' && !(line[j] === ESC && line[j + 1] === '\\')) j++;
            i = line[j] === ESC ? j + 2 : j + 1;
        } else {
            // two-byte escape (ESC c, ESC 7...), skip it
            i += 2;
        }
    }
    push();
    return {segments, end: state};
}

// stateful line parser: keeps the running SGR state per source key
// (container|stream) so colors opened on one line carry to the next
export function createAnsiTracker() {
    const states = new Map<string, AnsiState>();
    return (key: string, rawText: string): AnsiSegment[] => {
        const {segments, end} = parseAnsi(rawText, states.get(key));
        states.set(key, end);
        return segments;
    };
}
