import {useCallback, useEffect, useRef, useState} from 'react';
import {create} from "@bufbuild/protobuf";
import {callRPC, useHostClient} from '../lib/api.ts';
import {type ContainerStats, ContainerStatsSchema, DockerService, ORDER, SORT_FIELD} from '../gen/docker/v1/docker_pb.ts';
import {useSnackbar} from "./snackbar.ts";
import {useHostStore} from "../pages/compose/state/files.ts";
import {useConfig} from "./config.ts";

// cpuUsage sentinel marking a row seeded from the container list whose
// one-shot metrics response has not arrived yet; the list is immediate.
export const METRICS_PENDING = -1;

// Refresh cadence between two streaming cycles — 5s like Dockhand's stacks
// cards. CPU deltas are calculated server-side between these readings, so
// this interval is also the chart's stable sampling window.
const DEFAULT_REFRESH = 5000;

// Rolling per-container metric history driving the sparklines: 20 points at
// the 5s cadence is ~100s of live history, same window as Dockhand's cards.
export interface StatHistory {
    cpu: number[];
    mem: number[];
}

const HISTORY_CAP = 20;

// Module-level on purpose: history must survive component remounts (a ref
// resets with its component, losing everything between two polls) and is
// shared between the host-wide stats page and per-stack stats tabs, which
// see the same containers.
const statHistories = new Map<string, StatHistory>();
let statHistoriesHost: string | null = null;

// Aggregate header history, one point per COMPLETED cycle, keyed per view
// scope (host page vs each stack tab aggregate different container sets).
const aggHistories = new Map<string, StatHistory>();

// One point per received container stat, Dockhand-style. History is keyed by
// container NAME, not id: names are unique per host and — unlike ids —
// survive a compose recreate, so the chart never restarts because the
// identifier flipped underneath it.
function recordStat(host: string, stat: ContainerStats) {
    if (statHistoriesHost !== host) {
        statHistories.clear();
        aggHistories.clear();
        statHistoriesHost = host;
    }

    // IMMUTABLE append — fresh arrays AND a fresh entry object, exactly like
    // Dockhand's Svelte code rebuilds its history on every point. The UI is
    // compiled with the React Compiler, which memoizes render work by
    // reference equality: pushing into the same array (or mutating the same
    // entry object) leaves identities unchanged, so charts keep serving the
    // geometry cached at their first render and never redraw, no matter how
    // many points accumulate.
    const prev = statHistories.get(stat.name) ?? {cpu: [], mem: []};
    const limit = Number(stat.memoryLimit);
    const h: StatHistory = {
        cpu: [...prev.cpu.slice(-(HISTORY_CAP - 1)), Math.max(stat.cpuUsage, 0)],
        mem: [...prev.mem.slice(-(HISTORY_CAP - 1)), limit > 0 ? (Number(stat.memoryUsage) / limit) * 100 : 0],
    };
    statHistories.set(stat.name, h);
}

// AggregateSnapshot is the header's data: computed once per completed cycle
// from the cycle's final rows, so the totals never mix two cycles' values
// or wobble while results trickle in.
export interface AggregateSnapshot {
    total: number;
    running: number;
    stopped: number;
    paused: number;
    restarting: number;
    unhealthy: number;
    cpu: number;
    memUsed: number;
    memLimit: number;
    netRx: number;
    netTx: number;
    diskR: number;
    diskW: number;
    cpuHistory: number[];
    memHistory: number[];
}

function computeAggregates(scope: string, rows: ContainerStats[]): AggregateSnapshot {
    const t = rows.reduce((acc, curr) => {
        acc.cpu += Math.max(curr.cpuUsage, 0);
        acc.memUsed += Number(curr.memoryUsage);
        // containers without an explicit memory limit report the host's total
        // RAM as their limit: summing would count the host once per container
        // (4 containers on a 32GB host -> "128GB"), the max is the real ceiling
        acc.memLimit = Math.max(acc.memLimit, Number(curr.memoryLimit));
        acc.netRx += Number(curr.networkRx);
        acc.netTx += Number(curr.networkTx);
        acc.diskR += Number(curr.blockRead);
        acc.diskW += Number(curr.blockWrite);
        switch (curr.state) {
            case 'running':
                acc.running++;
                break;
            case 'exited':
            case 'dead':
            case 'created':
                acc.stopped++;
                break;
            case 'paused':
                acc.paused++;
                break;
            case 'restarting':
                acc.restarting++;
                break;
        }
        // healthchecks only run on running containers: a stopped/paused
        // container's health field is the daemon's stale last state, counting
        // it would double-book the container as stopped AND unhealthy
        if (curr.state === 'running' && curr.health === 'unhealthy') acc.unhealthy++;
        return acc;
    }, {
        cpu: 0, memUsed: 0, memLimit: 0, netRx: 0, netTx: 0, diskR: 0, diskW: 0,
        running: 0, stopped: 0, paused: 0, restarting: 0, unhealthy: 0,
    });

    const prev = aggHistories.get(scope) ?? {cpu: [], mem: []};
    const h: StatHistory = {
        cpu: [...prev.cpu.slice(-(HISTORY_CAP - 1)), t.cpu],
        mem: [...prev.mem.slice(-(HISTORY_CAP - 1)), t.memLimit > 0 ? (t.memUsed / t.memLimit) * 100 : 0],
    };
    aggHistories.set(scope, h);

    return {
        total: rows.length,
        ...t,
        cpuHistory: h.cpu,
        memHistory: h.mem,
    };
}

// drop history of containers that disappeared — only from a full host cycle:
// a stack-scoped cycle only sees its own containers and must not evict
// everyone else's history
function pruneHistory(seenNames: Set<string>, fullListing: boolean) {
    if (!fullListing) return;
    for (const name of [...statHistories.keys()]) {
        if (!seenNames.has(name)) statHistories.delete(name);
    }
}

// This map remains very useful for clean, client-side sorting.
const sortFieldToKeyMap: Record<SORT_FIELD, keyof ContainerStats> = {
    [SORT_FIELD.NAME]: 'name',
    [SORT_FIELD.CPU]: 'cpuUsage',
    [SORT_FIELD.MEM]: 'memoryUsage',
    [SORT_FIELD.NETWORK_RX]: 'networkRx',
    [SORT_FIELD.NETWORK_TX]: 'networkTx',
    [SORT_FIELD.DISK_R]: 'blockRead',
    [SORT_FIELD.DISK_W]: 'blockWrite',
    [SORT_FIELD.STARTED]: 'startedAt',
};

// Sorting happens client-side on every merge (like Dockhand): the stream
// delivers containers in arrival order.
function sortRows(rows: ContainerStats[], field: SORT_FIELD, order: ORDER): ContainerStats[] {
    const key = sortFieldToKeyMap[field];
    return [...rows].sort((a, b) => {
        const valA = a[key];
        const valB = b[key];
        let comparison = 0;

        if (typeof valA === 'bigint' && typeof valB === 'bigint') {
            if (valA < valB) comparison = -1;
            if (valA > valB) comparison = 1;
        } else if (typeof valA === 'number' && typeof valB === 'number') {
            comparison = valA - valB;
        } else {
            comparison = String(valA).localeCompare(String(valB));
        }

        return order === ORDER.ASC ? comparison : -comparison;
    });
}

// Maps a dockman.yml `stats.sort.field` string to a SORT_FIELD. Accepts the
// column labels and a few obvious aliases, case-insensitively. Falls back to
// MEM, preserving the historical default.
const configFieldToSortField = (field?: string): SORT_FIELD => {
    switch ((field ?? '').trim().toLowerCase()) {
        case 'name':
        case 'container':
            return SORT_FIELD.NAME;
        case 'cpu':
        case 'cpu usage':
            return SORT_FIELD.CPU;
        case 'mem':
        case 'memory':
        case 'memory usage':
            return SORT_FIELD.MEM;
        case 'network_rx':
        case 'rx':
            return SORT_FIELD.NETWORK_RX;
        case 'network_tx':
        case 'tx':
            return SORT_FIELD.NETWORK_TX;
        case 'disk_r':
        case 'disk read':
            return SORT_FIELD.DISK_R;
        case 'disk_w':
        case 'disk write':
            return SORT_FIELD.DISK_W;
        case 'started':
        case 'uptime':
            return SORT_FIELD.STARTED;
        default:
            return SORT_FIELD.MEM;
    }
};

const configOrderToOrder = (order?: string): ORDER =>
    (order ?? '').trim().toLowerCase() === 'asc' ? ORDER.ASC : ORDER.DSC;

export function useDockerStats(selectedPage?: string) {
    const dockerService = useHostClient(DockerService)
    const {showError} = useSnackbar();
    const selectedHost = useHostStore(state => state.host)
    const {dockYaml} = useConfig();

    const [rawContainers, setRawContainers] = useState<ContainerStats[]>([]);
    const [loading, setLoading] = useState(true);
    // header totals, refreshed once per completed cycle
    const [aggregates, setAggregates] = useState<AggregateSnapshot | null>(null);
    const gotStats = useRef(false);
    // mirror of rawContainers so the stream can merge into the visible rows
    // without depending on state identity
    const rowsRef = useRef<ContainerStats[]>([]);

    const [sortField, setSortField] = useState(SORT_FIELD.MEM);
    const [sortOrder, setSortOrder] = useState(ORDER.DSC);
    const [refreshInterval, setRefreshInterval] = useState(DEFAULT_REFRESH);
    const isInitialLoad = useRef(true);
    const loadingRef = useRef(true);
    // sort settings exposed to the streaming loop without restarting it
    const sortRef = useRef({field: sortField, order: sortOrder});
    sortRef.current = {field: sortField, order: sortOrder};
    // Once the user sorts by hand we stop applying the dockman.yml default so a
    // late-arriving (or per-host) config never clobbers their choice.
    const userSorted = useRef(false)

    const applyRows = useCallback((rows: ContainerStats[]) => {
        rowsRef.current = rows;
        setRawContainers(rows);
    }, []);

    // Seed the sort from dockman.yml (stats.sort) until the user sorts manually.
    useEffect(() => {
        if (userSorted.current) return;
        const cfg = dockYaml?.statsPage?.sort;
        if (!cfg) return;
        setSortField(configFieldToSortField(cfg.sortField));
        setSortOrder(configOrderToOrder(cfg.sortOrder));
    }, [dockYaml]);

    // re-sort the visible rows whenever the sort changes; the stream itself
    // is sort-agnostic so this never restarts a cycle
    useEffect(() => {
        applyRows(sortRows(rowsRef.current, sortField, sortOrder));
    }, [applyRows, sortField, sortOrder]);

    useEffect(() => {
        let isCancelled = false;
        let timer: ReturnType<typeof setTimeout> | null = null;
        // sort settings are read through a ref so a sort change doesn't tear
        // down the streaming cycle
        // Coalesced paints: the stream delivers one message per container
        // (identity wave + one per completed read), and sorting + re-rendering
        // per message costs real CPU and allocation churn on busy hosts. A
        // short flush window keeps the progressive-paint feel while cutting
        // the render count by an order of magnitude.
        let flushTimer: ReturnType<typeof setTimeout> | null = null;

        const tick = async () => {
            const cycleStart = Date.now();

            const merged = new Map<string, ContainerStats>();

            const flush = () => {
                flushTimer = null;
                if (isCancelled) return;
                applyRows(sortRows([...merged.values()], sortRef.current.field, sortRef.current.order));
                if (loadingRef.current) {
                    setLoading(false);
                    loadingRef.current = false;
                }
            };
            const scheduleFlush = () => {
                if (flushTimer === null) {
                    flushTimer = setTimeout(flush, 200);
                }
            };

            try {
                for (const c of rowsRef.current) {
                    merged.set(c.id, c);
                }
                const seen = new Set<string>();
                const seenNames = new Set<string>();

                for await (const stat of dockerService.containerStatsStream({
                    host: selectedHost,
                    file: selectedPage ? {filename: selectedPage} : undefined,
                })) {
                    if (isCancelled) return;

                    // identity-only row streamed ahead of its metrics reading so
                    // the view paints fast: never overwrite a row that
                    // already has real values, never record it as history
                    if (stat.cpuUsage < 0) {
                        if (!merged.has(stat.id)) {
                            merged.set(stat.id, stat);
                            scheduleFlush();
                        }
                        continue;
                    }

                    merged.set(stat.id, stat);
                    seen.add(stat.id);
                    seenNames.add(stat.name);
                    recordStat(selectedHost, stat);
                    scheduleFlush();
                }

                if (isCancelled) return;
                if (flushTimer !== null) {
                    clearTimeout(flushTimer);
                    flushTimer = null;
                }

                // cycle complete: drop containers that no longer exist, then
                // refresh the header totals in one go — computing them from
                // the cycle's final rows keeps them coherent instead of
                // wobbling through mixed old/new values while results trickle
                gotStats.current = true;
                pruneHistory(seenNames, !selectedPage);
                const finalRows = sortRows(
                    [...merged.values()].filter(c => seen.has(c.id)),
                    sortRef.current.field, sortRef.current.order,
                );
                applyRows(finalRows);
                setAggregates(computeAggregates(`${selectedHost}|${selectedPage || '*'}`, finalRows));
            } catch (e) {
                if (!isCancelled) {
                    showError(String(e));
                }
            } finally {
                if (isInitialLoad.current) {
                    setLoading(false);
                    isInitialLoad.current = false;
                }
                if (!isCancelled) {
                    // fixed cadence between cycle starts, never overlapping
                    const elapsed = Date.now() - cycleStart;
                    timer = setTimeout(tick, Math.max(1000, refreshInterval - elapsed));
                }
            }
        };

        tick();

        return () => {
            isCancelled = true;
            if (timer !== null) clearTimeout(timer);
            if (flushTimer !== null) clearTimeout(flushTimer);
        };
    }, [applyRows, selectedHost, dockerService, selectedPage, refreshInterval, showError]);

    useEffect(() => {
        // clear containers on host change (history clears itself, keyed by host)
        applyRows([])
        setLoading(true)
        loadingRef.current = true;
        isInitialLoad.current = true;
        gotStats.current = false;
        // re-apply the configured default for the newly selected host
        userSorted.current = false;
    }, [applyRows, selectedHost]);

    // Instant first paint: seed the rows from the (immediate) container list
    // while the first stats reads sample in the daemon; metrics cells render
    // as pending and fill in as each container's stats arrive. Stack tabs are
    // matched by the compose project name — conventionally the compose file's
    // directory name; when the project was renamed the match finds nothing
    // and the stream's identity wave paints the rows instead.
    useEffect(() => {
        let cancelled = false;

        const seed = async () => {
            const {val} = await callRPC(() => dockerService.containerList({}));
            // never overwrite real stats with placeholders
            if (cancelled || gotStats.current || !val) return;

            const project = selectedPage
                ? (selectedPage.split('/').slice(-2, -1)[0] ?? '').toLowerCase()
                : '';

            const rows = val.list
                .filter(c => !selectedPage || c.stackName.toLowerCase() === project)
                .map(c => create(ContainerStatsSchema, {
                    id: c.id.substring(0, 12),
                    name: c.name,
                    image: c.imageName,
                    state: c.state,
                    health: c.health,
                    ipAddress: c.IPAddress,
                    cpuUsage: METRICS_PENDING,
                }))
                .sort((a, b) => a.name.localeCompare(b.name));
            if (rows.length === 0) return;

            // merge under any stats that already trickled in
            const byId = new Map(rows.map(r => [r.id, r]));
            for (const existing of rowsRef.current) {
                byId.set(existing.id, existing);
            }
            applyRows([...byId.values()]);
            setLoading(false);
            loadingRef.current = false;
        };

        seed();
        return () => {
            cancelled = true;
        };
    }, [applyRows, selectedHost, dockerService, selectedPage]);

    const handleSortChange = useCallback((newField: SORT_FIELD, newOrderBy: ORDER) => {
        userSorted.current = true
        setSortField(newField)
        setSortOrder(newOrderBy)
    }, []);

    const resetContainerStats = useCallback((names: string[]) => {
        if (names.length === 0) return;
        const reset = new Set(names);
        for (const name of reset) statHistories.delete(name);
        // Remove the old samples immediately. The streaming loop will seed a
        // pending identity row, then replace it only with a fresh daemon read.
        applyRows(rowsRef.current.filter(row => !reset.has(row.name)));
        // The aggregate snapshot was computed from the same old samples. Do not
        // display it as current while the next complete cycle is still pending.
        setAggregates(null);
    }, [applyRows]);

    return {
        containers: rawContainers,
        // fresh Map identity on every render: the module-level map mutates in
        // place, and the React Compiler memoizes lookups like history.get(name)
        // by reference — served the map itself, charts would freeze on their
        // first geometry forever
        history: new Map(statHistories),
        aggregates,
        loading,
        sortField,
        sortOrder,
        handleSortChange,
        resetContainerStats,
        setRefreshInterval,
        refreshInterval,
    };
}

// real host-level usage for the general stats view (Dockhand-style): the
// backend reads /proc through the host's runner, so ssh hosts work too
export interface HostStatsView {
    cpuPercent: number;
    memUsed: number;
    memTotal: number;
    cpus: number;
    cpuHistory: number[];
    memHistory: number[];
}

// survives remounts, keyed per host like the container histories
const hostHistories = new Map<string, StatHistory>();

export function useHostStats(enabled: boolean): HostStatsView | null {
    const dockerService = useHostClient(DockerService);
    const selectedHost = useHostStore(state => state.host);
    const [stats, setStats] = useState<HostStatsView | null>(null);

    useEffect(() => {
        if (!enabled) {
            setStats(null);
            return;
        }

        let cancelled = false;
        const fetchStats = async () => {
            const {val} = await callRPC(() => dockerService.hostStats({}));
            if (cancelled || !val || val.memTotal === 0n) return;

            const memUsed = Number(val.memUsed);
            const memTotal = Number(val.memTotal);
            const prev = hostHistories.get(selectedHost) ?? {cpu: [], mem: []};
            const h: StatHistory = {
                cpu: [...prev.cpu.slice(-(HISTORY_CAP - 1)), val.cpuPercent],
                mem: [...prev.mem.slice(-(HISTORY_CAP - 1)), memTotal > 0 ? (memUsed / memTotal) * 100 : 0],
            };
            hostHistories.set(selectedHost, h);

            setStats({
                cpuPercent: val.cpuPercent,
                memUsed,
                memTotal,
                cpus: val.cpus,
                cpuHistory: h.cpu,
                memHistory: h.mem,
            });
        };

        void fetchStats();
        const id = setInterval(fetchStats, DEFAULT_REFRESH);
        return () => {
            cancelled = true;
            clearInterval(id);
        };
    }, [enabled, dockerService, selectedHost]);

    return stats;
}
