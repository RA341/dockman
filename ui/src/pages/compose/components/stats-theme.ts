// Shared palette for the stats view. Kept on the app's original dark tones
// for now; only the metric line/badge accents are opinionated.
export const statsTheme = {
    page: 'transparent',
    panel: '#1e1e1e',
    header: '#252525',
    row: 'transparent',
    rowHover: 'rgba(255,255,255,0.06)',
    border: 'rgba(255,255,255,0.12)',
    text: '#e6e6e6',
    textDim: '#9aa0a6',
    mono: '"JetBrains Mono", "Roboto Mono", "SFMono-Regular", Consolas, monospace',

    cpuLine: '#60a5fa',
    memLine: '#a78bfa',
    netDown: '#4ade80',
    netUp: '#38bdf8',
    diskRead: '#34d399',
    diskWrite: '#fbbf24',
} as const;

// State badge colors, Dockhand-style.
export const stateBadges: Record<string, { bg: string; fg: string; label: string }> = {
    running: {bg: 'rgba(16,124,73,0.9)', fg: '#d7f8e7', label: 'running'},
    exited: {bg: 'rgba(71,85,105,0.55)', fg: '#cbd5e1', label: 'exited'},
    created: {bg: 'rgba(51,88,138,0.55)', fg: '#cfe2f8', label: 'created'},
    paused: {bg: 'rgba(161,120,17,0.55)', fg: '#fde9b8', label: 'paused'},
    restarting: {bg: 'rgba(180,90,26,0.6)', fg: '#ffe1c7', label: 'restarting'},
    removing: {bg: 'rgba(148,68,68,0.55)', fg: '#ffd9d9', label: 'removing'},
    dead: {bg: 'rgba(153,27,45,0.7)', fg: '#ffd4dc', label: 'dead'},
};

export const healthColors: Record<string, string> = {
    healthy: '#34d399',
    unhealthy: '#f87171',
    starting: '#fbbf24',
};
