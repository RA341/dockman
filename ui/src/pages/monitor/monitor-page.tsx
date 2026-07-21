import {Box, Button, Chip, Divider, Fade, Paper, Tooltip} from '@mui/material';
import {
    ArrowDownward,
    ArrowUpward,
    Delete,
    Pause,
    PlayArrow,
    PlayCircleOutlined,
    RestartAlt,
    SpaceDashboardOutlined,
    Stop,
    UnfoldLess,
    UnfoldMore,
    Update,
} from '@mui/icons-material';
import {useEffect, useMemo, useRef, useState} from 'react';
import {useNavigate} from 'react-router-dom';
import "@xterm/xterm/css/xterm.css";
import PageHeader, {RefreshButton} from '../../components/page-header.tsx';
import useSearch from '../../hooks/search.ts';
import ActionButtons from '../../components/action-buttons.tsx';
import scrollbarStyles from '../../components/scrollbar-style.tsx';
import {useDockerContainers} from '../../hooks/docker-containers.ts';
import {useDockerStats, useHostStats} from '../../hooks/docker-containers-stats.ts';
import {useConfig} from '../../hooks/config.ts';
import {callRPC, useContainerExecWsUrl, useHostClient} from '../../lib/api.ts';
import {useSnackbar} from '../../hooks/snackbar.ts';
import {useHostStore} from '../compose/state/files.ts';
import {DockerService} from '../../gen/docker/v1/docker_pb.ts';
import AggregateStats, {type ContainerStateFilter} from '../compose/components/container-stat-chart.tsx';
import {LogsPanel} from '../compose/components/logs-panel.tsx';
import {useContainerExec, useLogsPanel, useTerminalTabs} from '../compose/state/terminal.tsx';
import {useComposeAction} from '../compose/state/compose.tsx';
import {ContainersLoading} from '../containers/containers-loading.tsx';
import {
    MonitorTable,
    type MonitorRow,
    type MonitorSortField,
    type RedeployOptions,
    type RowAction,
    type StackAction,
    type StackGroup,
    type StackStats,
} from './monitor-table.tsx';
import {statsTheme as t} from '../compose/components/stats-theme.ts';
import ContainerDetailsDialog from './container-details-dialog.tsx';
import ExecLaunchPopover, {type ExecLaunch} from './exec-launch-popover.tsx';

type ContainerActionRpc = 'containerStart' | 'containerStop' | 'containerRestart' | 'containerPause'
    | 'containerUnpause' | 'containerRemove';

// per-host view memory: expand/collapse choices and scroll offset survive
// navigating away and back (module-level on purpose — state resets with the
// component, this must not)
const monitorViewMemory = new Map<string, { expanded: Record<string, boolean>, scroll: number }>();

function viewMemoryFor(host: string) {
    const entry = monitorViewMemory.get(host) ?? {expanded: {}, scroll: 0};
    monitorViewMemory.set(host, entry);
    return entry;
}

// per-row sort key; -Number.MAX_VALUE sinks rows without a usable value.
// 'name' is compared as text in the comparators, not through this function.
function rowSortValue(r: MonitorRow, field: MonitorSortField): number {
    const s = r.stats;
    switch (field) {
        case 'name':
            return 0;
        case 'cpu':
            return s ? Math.max(s.cpuUsage, 0) : -Number.MAX_VALUE;
        case 'mem':
            return s ? Number(s.memoryUsage) : -Number.MAX_VALUE;
        case 'net':
            return s ? Number(s.networkRx) + Number(s.networkTx) : -Number.MAX_VALUE;
        case 'uptime': {
            if (r.info.state !== 'running' || !s?.startedAt) return -Number.MAX_VALUE;
            const start = Date.parse(s.startedAt);
            // older start = longer uptime = bigger value
            return isNaN(start) ? -Number.MAX_VALUE : -start;
        }
    }
}

// stack sort key: aggregate for the metric columns, best member for uptime
function groupSortValue(g: StackGroup, field: MonitorSortField): number {
    switch (field) {
        case 'name':
            return 0;
        case 'cpu':
            return g.stats?.cpu ?? -Number.MAX_VALUE;
        case 'mem':
            return g.stats?.memUsed ?? -Number.MAX_VALUE;
        case 'net':
            return g.stats ? g.stats.netRx + g.stats.netTx : -Number.MAX_VALUE;
        case 'uptime':
            return Math.max(-Number.MAX_VALUE, ...g.rows.map(r => rowSortValue(r, 'uptime')));
    }
}

// sums the member containers' live metrics and their history windows;
// sparklines scale to the window's shape, so a summed series keeps the
// aggregate's evolution readable
function aggregateStack(rows: MonitorRow[], history: Map<string, { cpu: number[]; mem: number[] }>): StackStats | null {
    let cpu = 0, memUsed = 0, memLimit = 0, netRx = 0, netTx = 0, seen = 0;
    for (const r of rows) {
        const s = r.stats;
        if (!s) continue;
        seen++;
        cpu += Math.max(s.cpuUsage, 0);
        memUsed += Number(s.memoryUsage);
        // same host-ceiling logic as the aggregate band: unlimited containers
        // report the host total, summing would count it once per container
        memLimit = Math.max(memLimit, Number(s.memoryLimit));
        netRx += Number(s.networkRx);
        netTx += Number(s.networkTx);
    }
    if (seen === 0) return null;

    const cpuSeries: number[][] = [];
    const memSeries: number[][] = [];
    for (const r of rows) {
        const h = history.get(r.info.name);
        if (!h) continue;
        cpuSeries.push(h.cpu);
        memSeries.push(h.mem);
    }

    return {cpu, memUsed, memLimit, netRx, netTx, cpuHist: sumSeries(cpuSeries), memHist: sumSeries(memSeries)};
}

// element-wise sum of series aligned on their most recent points
function sumSeries(series: number[][]): number[] {
    const len = Math.max(0, ...series.map(s => s.length));
    const out: number[] = [];
    for (let k = len; k >= 1; k--) {
        let sum = 0;
        for (const s of series) {
            const v = s[s.length - k];
            if (v !== undefined) sum += v;
        }
        out.push(sum);
    }
    return out;
}

// one view to run the host from: real host usage on top, every container
// grouped by stack below it, with per-row, per-stack and bulk controls plus
// the logs/exec bottom panel — no hopping between views. The existing Stats
// and Containers pages are left untouched.
function MonitorPage() {
    const dockerService = useHostClient(DockerService);
    const {containers, loading, fetchContainers} = useDockerContainers();
    const {history, containers: statContainers, aggregates, resetContainerStats} = useDockerStats("");
    const hostStats = useHostStats(true);
    const {showSuccess, showError} = useSnackbar();
    const {search, setSearch, searchInputRef} = useSearch();
    const navigate = useNavigate();
    const host = useHostStore(state => state.host);
    const {dockYaml} = useConfig();
    // dockman.yml → monitor.stackRows: "compact" drops the stack rows' charts
    const compactStacks = (dockYaml?.monitorPage?.stackRows ?? '').trim().toLowerCase() === 'compact';

    // stack and container selections are mutually exclusive; the toolbar
    // switches to whichever kind is active
    const [selectedContainers, setSelectedContainers] = useState<string[]>([]);
    const [selectedStacks, setSelectedStacks] = useState<string[]>([]);
    const [expanded, setExpanded] = useState<Record<string, boolean>>(() => viewMemoryFor(host).expanded);
    const [sortField, setSortField] = useState<MonitorSortField | null>(null);
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
    const [stateFilters, setStateFilters] = useState<ContainerStateFilter[]>([]);
    const [now, setNow] = useState(() => Date.now());
    // container id → lifecycle action in flight: the row's buttons lock and
    // the clicked one spins until the RPC and the list refetch settle
    const [rowBusy, setRowBusy] = useState<Record<string, RowAction>>({});
    const [detailsContainerID, setDetailsContainerID] = useState('');
    // container name → pre-action snapshot: the stats stream keeps serving
    // the pre-action sample for a cycle or two, so these rows render pending
    // metrics ('–') until fresh evidence arrives (see the pruning effect)
    const [staleRows, setStaleRows] = useState<Record<string, {
        action: RowAction,
        before: string,
    }>>({});
    const scrollRef = useRef<HTMLDivElement | null>(null);
    const scrollRestored = useRef(false);

    // remember the expand/collapse choices for this host
    useEffect(() => {
        viewMemoryFor(host).expanded = expanded;
    }, [expanded, host]);

    // uptime column tick; freshness of the values themselves comes from the
    // stats stream
    useEffect(() => {
        const id = setInterval(() => setNow(Date.now()), 10_000);
        return () => clearInterval(id);
    }, []);

    // the bottom panel tabs reference the previous host's containers
    const clearTabs = useTerminalTabs(state => state.clearAll);
    useEffect(() => {
        clearTabs();
        setSelectedContainers([]);
        setSelectedStacks([]);
        setRowBusy({});
        setDetailsContainerID('');
        setStaleRows({});
        setStateFilters([]);
        setExpanded(viewMemoryFor(host).expanded);
        scrollRestored.current = false;
    }, [clearTabs, host]);

    const createExecUrl = useContainerExecWsUrl();
    const execContainer = useContainerExec(state => state.execParams);
    const openLogs = useLogsPanel(state => state.openLogs);
    const runAction = useComposeAction(state => state.runAction);
    const openOutput = useComposeAction(state => state.openOutput);
    // string-valued selector: output appends leave it unchanged, so the page
    // only re-renders when a stack action starts, finishes or flips outcome
    const stackRunKeys = useComposeAction(state =>
        Object.entries(state.runs)
            .map(([f, r]) => `${f}=${r.running ? 'running' : r.failed ? 'failed' : 'done'}`)
            .sort().join('|'));

    // the stats stream and the container list agree on names (leading slash
    // trimmed on both sides), while their id fields differ — join by name
    const statsByName = useMemo(() =>
        new Map(statContainers.map(s => [s.name, s])), [statContainers]);

    const groups: StackGroup[] = useMemo(() => {
        const query = search.trim().toLowerCase();
        const list = (containers?.list ?? []).filter(c => {
            // This search lives in the NAME column, so only values displayed
            // there participate (container/service and stack names).
            const matchesSearch = !query || [c.name, c.stackName, c.serviceName]
                .some(f => f.toLowerCase().includes(query));
            if (!matchesSearch) return false;
            if (stateFilters.length === 0) return true;
            return stateFilters.some(filter => {
                switch (filter) {
                    case 'running': return c.state === 'running';
                    case 'paused': return c.state === 'paused';
                    case 'restarting': return c.state === 'restarting';
                    case 'unhealthy': return c.state === 'running' && c.health === 'unhealthy';
                    case 'stopped': return !['running', 'paused', 'restarting'].includes(c.state);
                }
            });
        });

        const byStack = new Map<string, StackGroup>();
        for (const c of list) {
            const key = c.stackName;
            const group = byStack.get(key) ?? {stack: key, servicePath: '', rows: [], stats: null};
            if (c.servicePath) group.servicePath = c.servicePath;
            // a row frozen by a lifecycle action renders pending metrics
            // instead of the stream's stale pre-action sample
            const exposesMetrics = ['running', 'restarting', 'paused'].includes(c.state);
            group.rows = [...group.rows, {
                info: c,
                stats: staleRows[c.name] || !exposesMetrics ? undefined : statsByName.get(c.name),
            }];
            byStack.set(key, group);
        }

        const dir = sortOrder === 'asc' ? 1 : -1;
        return [...byStack.values()]
            .map(g => {
                const rows = [...g.rows].sort((a, b) => a.info.name.localeCompare(b.info.name));
                if (sortField === 'name') {
                    if (sortOrder === 'desc') rows.reverse();
                } else if (sortField) {
                    // stable metric sub-sort inside each stack (name breaks ties)
                    rows.sort((a, b) => (rowSortValue(a, sortField) - rowSortValue(b, sortField)) * dir);
                }
                return {...g, rows, stats: aggregateStack(g.rows, history)};
            })
            .sort((a, b) => {
                // loose containers first (#standalone), then the sort order
                if (!a.stack) return -1;
                if (!b.stack) return 1;
                if (sortField === 'name') {
                    return a.stack.localeCompare(b.stack) * dir;
                }
                if (sortField) {
                    const diff = (groupSortValue(a, sortField) - groupSortValue(b, sortField)) * dir;
                    if (diff !== 0) return diff;
                }
                return a.stack.localeCompare(b.stack);
            });
    }, [containers, statsByName, history, search, stateFilters, sortField, sortOrder, staleRows]);

    // Resolve the dialog row from the unfiltered container list so an open
    // details view is not accidentally closed by changing the monitor search.
    const detailsRow: MonitorRow | null = useMemo(() => {
        if (!detailsContainerID) return null;
        const info = (containers?.list ?? []).find(c => c.id === detailsContainerID);
        if (!info) return null;
        const exposesMetrics = ['running', 'restarting', 'paused'].includes(info.state);
        return {info, stats: staleRows[info.name] || !exposesMetrics ? undefined : statsByName.get(info.name)};
    }, [detailsContainerID, containers, staleRows, statsByName]);

    // a live search opens every matching stack so the hits are visible;
    // the user's own expand/collapse choices come back once it clears
    const effectiveExpanded = useMemo(() => {
        if (!search.trim() && stateFilters.length === 0) return expanded;
        const all: Record<string, boolean> = {};
        for (const g of groups) all[g.stack] = true;
        return all;
    }, [search, stateFilters, expanded, groups]);

    const total = containers?.list.length ?? 0;

    // authoritative state counts from the (event-refreshed) container list —
    // the band updates within seconds of a start/stop instead of waiting on
    // a full stats cycle
    const stateCounts = useMemo(() => {
        const list = containers?.list ?? [];
        const counts = {total: list.length, running: 0, stopped: 0, paused: 0, restarting: 0, unhealthy: 0};
        for (const c of list) {
            switch (c.state) {
                case 'running':
                    counts.running++;
                    break;
                case 'paused':
                    counts.paused++;
                    break;
                case 'restarting':
                    counts.restarting++;
                    break;
                default:
                    counts.stopped++;
                    break;
            }
            // health only means something while the container runs; stale
            // health on stopped/paused containers must not double-count
            if (c.state === 'running' && c.health === 'unhealthy') counts.unhealthy++;
        }
        return counts;
    }, [containers]);
    useEffect(() => {
        setStateFilters(current => current.filter(filter => stateCounts[filter] > 0));
    }, [stateCounts]);
    const changeStateFilter = (filter: ContainerStateFilter | null, additive = false) => {
        setStateFilters(current => {
            if (filter === null) return [];
            if (!additive) return [filter];
            return current.includes(filter)
                ? current.filter(value => value !== filter)
                : [...current, filter];
        });
        // Never leave hidden rows selected: bulk actions must only target
        // containers the operator can currently see.
        setSelectedContainers([]);
        setSelectedStacks([]);
    };
    // last (or current) action outcome per compose file, for the busy
    // spinner and the last-action output button on stack rows
    const stackRuns = useMemo(() => {
        const map: Record<string, 'running' | 'failed' | 'done'> = {};
        for (const entry of stackRunKeys.split('|')) {
            if (!entry) continue;
            const idx = entry.lastIndexOf('=');
            map[entry.slice(0, idx)] = entry.slice(idx + 1) as 'running' | 'failed' | 'done';
        }
        return map;
    }, [stackRunKeys]);
    const runningStacks = useMemo(() => {
        const map: Record<string, boolean> = {};
        for (const [file, status] of Object.entries(stackRuns)) {
            if (status === 'running') map[file] = true;
        }
        return map;
    }, [stackRuns]);
    // per-container update runs, keyed by container name
    const updateRuns = useMemo(() => {
        const map: Record<string, 'running' | 'failed' | 'done'> = {};
        for (const [key, status] of Object.entries(stackRuns)) {
            if (key.startsWith('update:')) map[key.slice('update:'.length)] = status;
        }
        return map;
    }, [stackRuns]);

    const allExpanded = groups.length > 0 && groups.every(g => effectiveExpanded[g.stack] ?? false);

    // the list is event-driven, so a manual refresh often changes nothing
    // visible: give the button its own spinner so the fetch is observable
    const [refreshing, setRefreshing] = useState(false);
    const handleRefresh = async () => {
        setRefreshing(true);
        try {
            await fetchContainers();
        } finally {
            setRefreshing(false);
        }
    };

    // restore the saved scroll offset once the table is mounted with data
    useEffect(() => {
        if (scrollRestored.current || loading) return;
        const el = scrollRef.current;
        if (!el) return;
        el.scrollTop = viewMemoryFor(host).scroll;
        scrollRestored.current = true;
    }, [loading, groups.length, host]);

    const handleSortChange = (field: MonitorSortField) => {
        if (sortField === field) {
            setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc');
        } else {
            setSortField(field);
            // names read naturally A→Z, metrics hottest-first
            setSortOrder(field === 'name' ? 'asc' : 'desc');
        }
    };

    // ---- container actions -------------------------------------------------

    // drop a frozen row as soon as the UI has fresh evidence of the new
    // state: a moved startedAt for start/restart, the resting state for
    // stop/pause/unpause, or the row vanishing. There is intentionally no
    // timeout: an old uptime must never reappear merely because a refresh is
    // slow; the row stays pending until fresh daemon evidence arrives.
    useEffect(() => {
        const names = Object.keys(staleRows);
        if (names.length === 0) return;
        const byName = new Map((containers?.list ?? []).map(c => [c.name, c]));
        const next = {...staleRows};
        let changed = false;
        for (const name of names) {
            const m = staleRows[name];
            const listed = byName.get(name);
            const sample = statsByName.get(name);
            const settled =
                m.action === 'start' || m.action === 'restart'
                    ? listed?.state === 'running' && sample !== undefined && (sample.startedAt ?? '') !== m.before
                    : m.action === 'stop'
                        ? listed !== undefined && listed.state !== 'running'
                        : m.action === 'pause'
                            ? listed?.state === 'paused'
                            : listed?.state === 'running'; // unpause: startedAt never moves
            if (settled || listed === undefined) {
                delete next[name];
                changed = true;
            }
        }
        if (changed) setStaleRows(next);
    }, [staleRows, containers, statsByName]);

    async function containerAction(action: Exclude<RowAction, 'update'>, rpcName: ContainerActionRpc, message: string, ids: string[]) {
        const named = (containers?.list ?? []).filter(c => ids.includes(c.id));
        setRowBusy(prev => {
            const next = {...prev};
            for (const id of ids) next[id] = action;
            return next;
        });
        // snapshot the pre-action samples so the rows freeze to pending
        // metrics until the stream visibly moves past them
        if (action !== 'remove') {
            setStaleRows(prev => {
                const next = {...prev};
                for (const c of named) {
                    next[c.name] = {action, before: statsByName.get(c.name)?.startedAt ?? ''};
                }
                return next;
            });
        }
        if (action === 'start' || action === 'stop' || action === 'restart') {
            resetContainerStats(named.map(c => c.name));
        }
        try {
            const {err} = await callRPC(() => dockerService[rpcName]({containerIds: ids}));
            if (err) {
                showError(`Failed to ${action} containers: ${err}`);
                // nothing changed on the daemon: unfreeze right away
                setStaleRows(prev => {
                    const next = {...prev};
                    for (const c of named) delete next[c.name];
                    return next;
                });
            } else {
                showSuccess(`Successfully ${message} ${ids.length > 1 ? `${ids.length} containers` : 'container'}`);
            }
            setSelectedContainers(prev => prev.filter(id => !ids.includes(id)));
            await fetchContainers();
        } finally {
            setRowBusy(prev => {
                const next = {...prev};
                for (const id of ids) delete next[id];
                return next;
            });
        }
    }

    const rowRpc: Record<Exclude<RowAction, 'update'>, { rpc: ContainerActionRpc, message: string }> = {
        start: {rpc: 'containerStart', message: 'started'},
        stop: {rpc: 'containerStop', message: 'stopped'},
        restart: {rpc: 'containerRestart', message: 'restarted'},
        pause: {rpc: 'containerPause', message: 'paused'},
        unpause: {rpc: 'containerUnpause', message: 'unpaused'},
        remove: {rpc: 'containerRemove', message: 'removed'},
    };

    // updates stream their progress (pull output, recreate steps) and run in
    // the background like stack actions: one run per container, keyed
    // update:<name>, consultable through the output button
    const startContainerUpdate = (id: string, name: string) => {
        runAction(
            `update:${name}`,
            (_req, callOpts) => dockerService.containerUpdate({containerIds: [id]}, callOpts),
            'update',
            [],
            (error) => {
                if (error) showError(`Update ${name} failed — ${error}`);
                else showSuccess(`Update ${name} finished`);
                void fetchContainers();
            },
        );
    };

    const handleRowAction = (row: MonitorRow, action: RowAction) => {
        if (row.info.servicePath && runningStacks[row.info.servicePath]) {
            showError(`Stack ${row.info.stackName}: wait for the current stack action to finish`);
            return;
        }
        if (action === 'update') {
            startContainerUpdate(row.info.id, row.info.name);
            return;
        }
        void containerAction(action, rowRpc[action].rpc, rowRpc[action].message, [row.info.id]);
    };

    // ---- stack actions -----------------------------------------------------

    const stackRpc: Record<StackAction, { rpc: 'composeUp' | 'composeDown' | 'composeStart' | 'composeStop' | 'composeRestart', message: string }> = {
        up: {rpc: 'composeUp', message: 'up'},
        down: {rpc: 'composeDown', message: 'down'},
        start: {rpc: 'composeStart', message: 'started'},
        stop: {rpc: 'composeStop', message: 'stopped'},
        restart: {rpc: 'composeRestart', message: 'restarted'},
    };

    const runStack = (stackName: string, servicePath: string, action: StackAction) => {
        const {rpc, message} = stackRpc[action];
        // A stack operation owns all its member containers until it settles.
        // Drop any pre-existing container selection so the bulk toolbar cannot
        // issue a conflicting command while Compose is changing the stack.
        const memberIDs = new Set((containers?.list ?? [])
            .filter(c => c.servicePath === servicePath)
            .map(c => c.id));
        setSelectedContainers(prev => prev.filter(id => !memberIDs.has(id)));
        runAction(servicePath, dockerService[rpc], action, [], (error) => {
            if (error) showError(`Stack ${stackName}: ${action} failed — ${error}`);
            else showSuccess(`Stack ${stackName} ${message}`);
            void fetchContainers();
        });
    };

    const handleStackAction = (group: StackGroup, action: StackAction) =>
        runStack(group.stack, group.servicePath, action);

    const handleStackRedeploy = (group: StackGroup, opts: RedeployOptions) => {
        runAction(
            group.servicePath,
            (req, callOpts) => dockerService.composeRedeploy({
                file: {filename: req.filename, selectedServices: req.selectedServices},
                pull: opts.pull,
                build: opts.build,
                recreate: opts.recreate,
            }, callOpts),
            'redeploy',
            [],
            (error) => {
                if (error) showError(`Stack ${group.stack}: redeploy failed — ${error}`);
                else showSuccess(`Stack ${group.stack} redeployed`);
                void fetchContainers();
            },
        );
    };

    // async to satisfy the shared ActionButtons handler contract; the stack
    // runs themselves are fire-and-forget background actions
    const bulkStackAction = async (action: StackAction) => {
        for (const stackName of selectedStacks) {
            const group = groups.find(g => g.stack === stackName);
            if (group?.servicePath) runStack(group.stack, group.servicePath, action);
        }
        setSelectedStacks([]);
    };

    // ---- panel openers -----------------------------------------------------

    const handleRowLogs = (row: MonitorRow) =>
        openLogs(`logs:${host}/monitor#${row.info.id}`,
            row.info.stackName ? `${row.info.stackName}/${row.info.name}` : row.info.name,
            [{id: row.info.id, name: row.info.name}]);

    const handleStackLogs = (group: StackGroup) =>
        openLogs(`logs:${host}/monitor#stack:${group.stack || 'standalone'}`,
            `${group.stack || 'standalone'}: stack logs`,
            group.rows.map(r => ({id: r.info.id, name: r.info.name})));

    const [execLaunch, setExecLaunch] = useState<ExecLaunch | null>(null);
    const handleRowExec = (row: MonitorRow, anchor: HTMLElement) => setExecLaunch({row, anchor});
    const connectRowExec = (row: MonitorRow, shell: string, user: string) => {
        execContainer(`exec:${host}/monitor#${row.info.id}`,
            `${row.info.stackName ? `${row.info.stackName}/` : ''}${row.info.name} (exec)`,
            createExecUrl(row.info.id, shell, undefined, user),
            true,
            {containerID: row.info.id, shell, user});
        setExecLaunch(null);
    };

    // ?tab=0 pins the EDITOR tab regardless of the compose.defaultTab setting
    const handleStackEdit = (group: StackGroup) =>
        navigate(`/${host}/files/${group.servicePath}?tab=0`);

    // ---- selection + toolbar ----------------------------------------------

    const toggleContainers = (ids: string[], on: boolean) => {
        setSelectedStacks([]);
        setSelectedContainers(prev =>
            on ? [...new Set([...prev, ...ids])] : prev.filter(id => !ids.includes(id)));
    };

    const toggleStack = (stack: string, on: boolean) => {
        setSelectedContainers([]);
        setSelectedStacks(prev =>
            on ? [...new Set([...prev, stack])] : prev.filter(s => s !== stack));
    };

    const toggleAllStacks = (stacks: string[], on: boolean) => {
        setSelectedContainers([]);
        setSelectedStacks(on ? stacks : []);
    };

    const stacksMode = selectedStacks.length > 0;
    const selectedContainersBlocked = (containers?.list ?? []).some(c =>
        selectedContainers.includes(c.id) && c.servicePath !== '' && runningStacks[c.servicePath]);

    const containerBulkActions = [
        {
            action: 'start', buttonText: 'Start', icon: <PlayArrow/>,
            disabled: selectedContainers.length === 0 || selectedContainersBlocked,
            handler: () => containerAction('start', 'containerStart', 'started', selectedContainers),
            tooltip: '',
        },
        {
            action: 'stop', buttonText: 'Stop', icon: <Stop/>,
            disabled: selectedContainers.length === 0 || selectedContainersBlocked,
            handler: () => containerAction('stop', 'containerStop', 'stopped', selectedContainers),
            tooltip: '',
        },
        {
            action: 'restart', buttonText: 'Restart', icon: <RestartAlt/>,
            disabled: selectedContainers.length === 0 || selectedContainersBlocked,
            handler: () => containerAction('restart', 'containerRestart', 'restarted', selectedContainers),
            tooltip: '',
        },
        {
            action: 'pause', buttonText: 'Pause', icon: <Pause/>,
            disabled: selectedContainers.length === 0 || selectedContainersBlocked,
            handler: () => containerAction('pause', 'containerPause', 'paused', selectedContainers),
            tooltip: '',
        },
        {
            action: 'unpause', buttonText: 'Unpause', icon: <PlayCircleOutlined/>,
            disabled: selectedContainers.length === 0 || selectedContainersBlocked,
            handler: () => containerAction('unpause', 'containerUnpause', 'unpaused', selectedContainers),
            tooltip: '',
        },
        {
            action: 'update', buttonText: 'Update', icon: <Update/>,
            disabled: selectedContainers.length === 0 || selectedContainersBlocked,
            handler: async () => {
                const list = containers?.list ?? [];
                for (const id of selectedContainers) {
                    const c = list.find(x => x.id === id);
                    if (c) startContainerUpdate(c.id, c.name);
                }
                setSelectedContainers([]);
            },
            tooltip: 'Pull the image and recreate when a newer one exists',
        },
        {
            action: 'remove', buttonText: 'Remove', icon: <Delete/>,
            disabled: selectedContainers.length === 0 || selectedContainersBlocked,
            handler: () => containerAction('remove', 'containerRemove', 'removed', selectedContainers),
            tooltip: '',
            confirm: `Remove ${selectedContainers.length} selected container${selectedContainers.length > 1 ? 's' : ''}?`,
        },
    ];

    const stackBulkActions = [
        {
            action: 'up', buttonText: 'Up', icon: <ArrowUpward/>,
            disabled: false, handler: () => bulkStackAction('up'), tooltip: '',
        },
        {
            action: 'down', buttonText: 'Down', icon: <ArrowDownward/>,
            disabled: false, handler: () => bulkStackAction('down'), tooltip: '',
        },
        {
            action: 'start', buttonText: 'Start', icon: <PlayArrow/>,
            disabled: false, handler: () => bulkStackAction('start'), tooltip: '',
        },
        {
            action: 'stop', buttonText: 'Stop', icon: <Stop/>,
            disabled: false, handler: () => bulkStackAction('stop'), tooltip: '',
        },
        {
            action: 'restart', buttonText: 'Restart', icon: <RestartAlt/>,
            disabled: false, handler: () => bulkStackAction('restart'), tooltip: '',
        },
    ];

    return (
        <Box sx={{
            display: 'flex',
            flexDirection: 'column',
            height: '100vh',
            overflow: 'hidden',
        }}>
            <Box sx={{
                display: 'flex',
                flexDirection: 'column',
                flexGrow: 1,
                minHeight: 0,
                // longhand paddings on purpose: a responsive `p` shorthand is
                // emitted inside media queries that MUI sorts after plain
                // props, so a flat `pb: 0` loses and the table keeps a dead
                // band above the bottom panel
                pt: {xs: 1, md: 3},
                px: {xs: 1, md: 3},
                overflow: 'hidden',
                ...scrollbarStyles
            }}>
                <PageHeader
                    icon={<SpaceDashboardOutlined/>}
                    title="Monitor"
                    count={total}
                    host={host}
                    compact
                />

                {/* host band and toolbar share one frame, split by an inner rule */}
                <Paper
                    variant="outlined"
                    sx={{
                        mb: 1,
                        borderRadius: 2,
                        bgcolor: t.panel,
                        borderColor: t.border,
                        flexShrink: 0,
                        overflow: 'hidden',
                    }}
                >
                    <AggregateStats aggregates={aggregates} hostStats={hostStats}
                                    states={containers ? stateCounts : null}
                                    stateFilters={stateFilters}
                                    onStateFilterChange={changeStateFilter}
                                    bare/>

                    <Divider sx={{borderColor: t.border}}/>

                    <Box sx={{px: 1.5, py: 0.75, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1}}>
                        <ActionButtons iconOnly actions={stacksMode ? stackBulkActions : containerBulkActions}/>

                        {stateFilters.map(filter => <Chip
                            key={filter}
                            size="small"
                            variant="outlined"
                            label={`${filter[0].toUpperCase()}${filter.slice(1)} · ${stateCounts[filter]}`}
                            onDelete={() => changeStateFilter(filter, true)}
                            sx={{height: 27, color: t.text, borderColor: t.border, fontWeight: 700, textTransform: 'none'}}
                        />)}

                        <RefreshButton iconOnly onClick={handleRefresh} loading={refreshing}/>
                        <Tooltip title={allExpanded ? 'Collapse all' : 'Expand all'}>
                            <Button
                                variant="outlined"
                                size="small"
                                onClick={() => setExpanded(allExpanded
                                    ? {}
                                    : Object.fromEntries(groups.map(g => [g.stack, true])))}
                                sx={{
                                    px: 0.5,
                                    minWidth: 34,
                                    borderColor: 'divider',
                                    color: 'text.secondary',
                                    '&:hover': {borderColor: 'primary.main', color: 'primary.main', bgcolor: 'action.hover'},
                                    '& svg': {fontSize: 17},
                                }}
                            >
                                {allExpanded ? <UnfoldLess/> : <UnfoldMore/>}
                            </Button>
                        </Tooltip>
                        {(stacksMode || selectedContainers.length > 0) && (
                            <>
                                <Divider orientation="vertical" flexItem sx={{mx: 0.5, borderColor: t.border}}/>
                                <Chip
                                    size="small"
                                    variant="outlined"
                                    color="primary"
                                    label={stacksMode
                                        ? `${selectedStacks.length} stack${selectedStacks.length > 1 ? 's' : ''} selected`
                                        : `${selectedContainers.length} container${selectedContainers.length > 1 ? 's' : ''} selected`}
                                    sx={{fontWeight: 700}}
                                />
                            </>
                        )}
                    </Box>
                </Paper>

                <Paper
                    variant="outlined"
                    sx={{
                        flexGrow: 1,
                        minHeight: 0,
                        borderRadius: 2,
                        overflow: 'hidden',
                        display: 'flex',
                        flexDirection: 'column',
                        bgcolor: t.panel,
                        borderColor: t.border,
                    }}
                >
                    {loading ? (
                        <ContainersLoading/>
                    ) : (
                        <Fade in={!loading}>
                            <Box sx={{height: '100%', overflow: 'hidden'}}>
                                <MonitorTable
                                    groups={groups}
                                    history={history}
                                    selectedContainers={selectedContainers}
                                    selectedStacks={selectedStacks}
                                    onToggleContainers={toggleContainers}
                                    onToggleStack={toggleStack}
                                    onToggleAllStacks={toggleAllStacks}
                                    expanded={effectiveExpanded}
                                    onToggleExpand={(stack) => setExpanded(prev =>
                                        ({...prev, [stack]: !(prev[stack] ?? false)}))}
                                    sortField={sortField}
                                    sortOrder={sortOrder}
                                    onSortChange={handleSortChange}
                                    nameSearch={search}
                                    onNameSearchChange={setSearch}
                                    nameSearchInputRef={searchInputRef}
                                    scrollRef={scrollRef}
                                    onScroll={(top) => {
                                        viewMemoryFor(host).scroll = top;
                                    }}
                                    now={now}
                                    stackRowsCompact={compactStacks}
                                    runningStacks={runningStacks}
                                    stackRuns={stackRuns}
                                    onStackOutput={(group) => openOutput(group.servicePath)}
                                    updateRuns={updateRuns}
                                    onUpdateOutput={(row) => openOutput(`update:${row.info.name}`)}
                                    onRowAction={handleRowAction}
                                    rowBusy={rowBusy}
                                    onRowLogs={handleRowLogs}
                                    onRowExec={handleRowExec}
                                    onRowDetails={(row) => setDetailsContainerID(row.info.id)}
                                    onStackAction={handleStackAction}
                                    onStackRedeploy={handleStackRedeploy}
                                    onStackLogs={handleStackLogs}
                                    onStackEdit={handleStackEdit}
                                />
                            </Box>
                        </Fade>
                    )}
                </Paper>
            </Box>

            <ContainerDetailsDialog
                open={detailsContainerID !== ''}
                row={detailsRow}
                containers={containers?.list ?? []}
                history={detailsRow ? history.get(detailsRow.info.name) : undefined}
                busy={detailsRow ? rowBusy[detailsRow.info.id] : undefined}
                stackBusy={!!(detailsRow?.info.servicePath && runningStacks[detailsRow.info.servicePath])}
                updateRun={detailsRow ? updateRuns[detailsRow.info.name] : undefined}
                onClose={() => setDetailsContainerID('')}
                onAction={handleRowAction}
            />

            <ExecLaunchPopover
                launch={execLaunch}
                onClose={() => setExecLaunch(null)}
                onConnect={connectRowExec}
            />

            <LogsPanel/>
        </Box>
    );
}

export default MonitorPage;
