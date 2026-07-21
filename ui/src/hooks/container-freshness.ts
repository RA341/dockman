// Shared cadence policy for container list views: while something is
// settling (starting, health checks pending, just created or restarted),
// poll fast so the view tracks it second by second; once everything is
// stable the slow safety net is enough — docker events cover the rest.

const TRANSITIONAL_STATES = new Set(['created', 'restarting', 'removing']);

// a container that started less than this ago still gets the fast cadence,
// so its uptime/created column visibly counts up right after an action
const FRESH_WINDOW_MS = 60_000;

export const FAST_POLL_MS = 3000;
export const IDLE_POLL_MS = 30000;

export function isSettling(state: string, health: string, created: string): boolean {
    if (TRANSITIONAL_STATES.has(state.toLowerCase())) return true;
    if (health.toLowerCase() === 'starting') return true;
    const createdMs = new Date(created).getTime();
    return Number.isFinite(createdMs) && Date.now() - createdMs < FRESH_WINDOW_MS;
}
