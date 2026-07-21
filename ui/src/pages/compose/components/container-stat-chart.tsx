import {Box, ButtonBase, Divider, Paper, Stack, Tooltip, Typography} from "@mui/material";
import {
    Dns as ContainerIcon,
    ImportExport as NetworkIcon,
    Memory as MemoryIcon,
    Pause as PauseIcon,
    PlayArrow as PlayArrowIcon,
    RestartAlt as RestartIcon,
    Speed as CpuIcon,
    Stop as StopIcon,
    Storage as StorageIcon,
    WarningAmber as WarningIcon,
} from "@mui/icons-material";
import {formatBytes} from "../../../lib/editor.ts";
import {type ReactNode} from "react";
import {type AggregateSnapshot, type HostStatsView} from "../../../hooks/docker-containers-stats.ts";
import Sparkline from "../../../components/sparkline.tsx";
import {statsTheme as t} from "./stats-theme.ts";

// per-state container counts for the status strip
export interface StateCounts {
    total: number;
    running: number;
    stopped: number;
    paused: number;
    restarting: number;
    unhealthy: number;
}

export type ContainerStateFilter = 'running' | 'stopped' | 'paused' | 'restarting' | 'unhealthy';

interface AggregateStatsProps {
    // computed once per completed refresh cycle — null until the first
    // cycle lands, so the header never renders half-updated totals
    aggregates: AggregateSnapshot | null;
    // when set (general view), CPU and memory show the real host usage
    // Dockhand-style instead of summing container numbers; stack views
    // keep the per-container aggregation
    hostStats?: HostStatsView | null;
    // authoritative state counts (from the event-driven container list);
    // when provided they replace the cycle-based aggregate counts, which
    // refresh more slowly
    states?: StateCounts | null;
    stateFilters?: ContainerStateFilter[];
    onStateFilterChange?: (filter: ContainerStateFilter | null, additive: boolean) => void;
    // render without the outer card (the caller embeds the band in its own
    // frame, e.g. merged with the toolbar)
    bare?: boolean;
}

// load stays default-colored while calm, then warns
const cpuValueColor = (cpu: number) =>
    cpu < 50 ? t.text : cpu < 85 ? '#ffb74d' : '#ef5350';

function AggregateStats({aggregates, hostStats, states, stateFilters = [], onStateFilterChange, bare = false}: AggregateStatsProps) {
    const memPercent = hostStats
        ? (hostStats.memTotal > 0 ? (hostStats.memUsed / hostStats.memTotal) * 100 : 0)
        : (aggregates && aggregates.memLimit > 0 ? (aggregates.memUsed / aggregates.memLimit) * 100 : 0);
    const cpu = hostStats ? hostStats.cpuPercent : (aggregates?.cpu ?? 0);
    const cpuReady = hostStats ? true : aggregates !== null;
    const memUsed = hostStats ? hostStats.memUsed : aggregates?.memUsed;
    const memCeil = hostStats ? hostStats.memTotal : aggregates?.memLimit;

    return (
        <Paper
            variant={bare ? "elevation" : "outlined"}
            elevation={0}
            sx={{
                px: 2,
                py: 1,
                mb: bare ? 0 : 1.5,
                borderRadius: bare ? 0 : 2,
                bgcolor: bare ? 'transparent' : t.panel,
                borderColor: t.border,
                display: 'flex',
                alignItems: 'center'
            }}
        >
            <Stack
                direction="row"
                spacing={2.5}
                divider={<Divider orientation="vertical" flexItem sx={{borderColor: t.border}}/>}
                sx={{width: '100%', alignItems: 'stretch'}}
            >
                {/* per-state breakdown, wraps onto more lines when narrow */}
                <StateTile counts={states ?? aggregates} active={stateFilters} onFilter={onStateFilterChange}/>

                {/* charted tiles: value block + a chart that takes the room */}
                <ChartTile
                    icon={<CpuIcon/>}
                    label={hostStats ? "Host CPU" : "Total CPU"}
                    value={cpuReady ? `${cpu.toFixed(1)}%` : '–'}
                    valueColor={cpuValueColor(cpu)}
                    sub={hostStats && hostStats.cpus > 0 ? `${hostStats.cpus} cores` : ''}
                    data={hostStats ? hostStats.cpuHistory : aggregates?.cpuHistory ?? []}
                    color={t.cpuLine}
                />

                <ChartTile
                    icon={<MemoryIcon/>}
                    label={hostStats ? "Host Memory" : "Memory"}
                    value={memUsed !== undefined ? formatBytes(memUsed) : '–'}
                    sub={memCeil && memCeil > 0
                        ? `${memPercent.toFixed(1)}% of ${formatBytes(memCeil)}`
                        : ''}
                    data={hostStats ? hostStats.memHistory : aggregates?.memHistory ?? []}
                    color={t.memLine}
                />

                <CompactTile
                    icon={<NetworkIcon/>}
                    label="Network I/O"
                    value={aggregates ? `↓ ${formatBytes(aggregates.netRx)}` : '–'}
                    sub={aggregates ? `↑ ${formatBytes(aggregates.netTx)}` : ''}
                    tooltip={aggregates ? `Total ${formatBytes(aggregates.netRx + aggregates.netTx)}` : ''}
                />

                <CompactTile
                    icon={<StorageIcon/>}
                    label="Block I/O"
                    value={aggregates ? `R ${formatBytes(aggregates.diskR)}` : '–'}
                    sub={aggregates ? `W ${formatBytes(aggregates.diskW)}` : ''}
                    tooltip={aggregates ? `Total ${formatBytes(aggregates.diskR + aggregates.diskW)}` : ''}
                />
            </Stack>
        </Paper>
    );
}

export default AggregateStats;

// Dockhand-style status strip over two fixed rows: totals and the common
// states first (total / running / stopped), the exceptional states below
// (paused / restarting / unhealthy).
function StateTile({counts, active, onFilter}: {
    counts: StateCounts | null,
    active: ContainerStateFilter[],
    onFilter?: (filter: ContainerStateFilter | null, additive: boolean) => void,
}) {
    const rows: { icon: ReactNode, count: number, color: string, title: string, filter: ContainerStateFilter | null }[][] = counts ? [
        [
            {icon: <ContainerIcon/>, count: counts.total, color: t.text, title: 'All containers', filter: null},
            {icon: <PlayArrowIcon/>, count: counts.running, color: '#66bb6a', title: 'Running', filter: 'running'},
            {icon: <StopIcon/>, count: counts.stopped, color: '#9e9e9e', title: 'Stopped', filter: 'stopped'},
        ],
        [
            {icon: <PauseIcon/>, count: counts.paused, color: '#ffb74d', title: 'Paused', filter: 'paused'},
            {icon: <RestartIcon/>, count: counts.restarting, color: '#4db6ac', title: 'Restarting', filter: 'restarting'},
            {icon: <WarningIcon/>, count: counts.unhealthy, color: '#ef5350', title: 'Unhealthy', filter: 'unhealthy'},
        ],
    ] : [];

    return (
        <Box sx={{flex: '0 1 auto', minWidth: 108, maxWidth: 175, alignSelf: 'center'}}>
            {counts ? (
                <Stack spacing={0.75}>
                    {rows.map((row, i) => (
                        <Stack key={i} direction="row" spacing={1.5} sx={{
                            alignItems: "center"
                        }}>
                            {row.map(e => (
                                <Tooltip key={e.title} title={e.title} arrow placement="top">
                                    <ButtonBase
                                        aria-label={`${e.title}: ${e.count}`}
                                        disabled={!onFilter || (e.filter !== null && e.count === 0)}
                                        onClick={event => onFilter?.(e.filter, event.ctrlKey || event.metaKey)}
                                        sx={{
                                            display: 'flex',
                                            gap: 0.25,
                                            alignItems: 'center',
                                            color: e.color,
                                            px: 0.35,
                                            py: 0.25,
                                            mx: -0.35,
                                            my: -0.25,
                                            borderRadius: 0.75,
                                            outline: e.filter !== null && active.includes(e.filter) ? `1px solid ${e.color}` : 'none',
                                            bgcolor: e.filter !== null && active.includes(e.filter) ? 'rgba(255,255,255,0.08)' : 'transparent',
                                            cursor: onFilter && (e.filter === null || e.count > 0) ? 'pointer' : 'default',
                                            '&:hover': onFilter ? {bgcolor: 'rgba(255,255,255,0.1)'} : {},
                                            '&.Mui-disabled': {color: e.color, opacity: 0.38},
                                        }}>
                                        <Box sx={{display: 'flex', '& svg': {fontSize: 15}}}>{e.icon}</Box>
                                        <Typography sx={{fontFamily: t.mono, fontWeight: 700, fontSize: '0.85rem', lineHeight: 1}}>
                                            {e.count}
                                        </Typography>
                                    </ButtonBase>
                                </Tooltip>
                            ))}
                        </Stack>
                    ))}
                </Stack>
            ) : (
                <>
                    <TileLabel icon={<ContainerIcon/>} label="Containers"/>
                    <Typography sx={{fontFamily: t.mono, fontWeight: 700, fontSize: '0.95rem', color: t.text}}>
                        –
                    </Typography>
                </>
            )}
        </Box>
    );
}

function TileLabel({icon, label}: { icon: ReactNode, label: string }) {
    return (
        <Stack
            direction="row"
            spacing={0.75}
            sx={{
                alignItems: "center",
                mb: 0.25,
                color: t.textDim
            }}>
            <Box sx={{display: 'flex', '& svg': {fontSize: 14}}}>{icon}</Box>
            <Typography variant="overline" noWrap
                        sx={{fontWeight: 700, lineHeight: 1, letterSpacing: '0.08em', fontSize: '0.62rem'}}>
                {label}
            </Typography>
        </Stack>
    );
}

// label + a single value line (optional dim inline detail); used for the
// counters that need no chart, kept narrow so charted tiles get the room
function CompactTile({icon, label, value, sub, tooltip, grow = true}: {
    icon: ReactNode,
    label: string,
    value: string,
    sub?: string,
    tooltip?: string,
    grow?: boolean,
}) {
    const body = (
        <Box sx={{flex: grow ? '1 1 0' : '0 0 auto', minWidth: 0, alignSelf: 'center', width: grow ? undefined : 'auto'}}>
            <TileLabel icon={icon} label={label}/>
            <Stack
                direction="row"
                spacing={1}
                sx={{
                    alignItems: "baseline",
                    minWidth: 0
                }}>
                <Typography noWrap sx={{
                    fontFamily: t.mono,
                    fontWeight: 700,
                    fontSize: '0.95rem',
                    lineHeight: 1.3,
                    color: t.text,
                    flexShrink: 0,
                }}>
                    {value}
                </Typography>
                {sub && (
                    <Typography variant="caption" noWrap sx={{color: t.textDim, fontFamily: t.mono, minWidth: 0}}>
                        {sub}
                    </Typography>
                )}
            </Stack>
        </Box>
    );

    return tooltip ? <Tooltip title={tooltip} arrow placement="top">{body}</Tooltip> : body;
}

// label + value (and detail below it) with a chart filling the tile's
// remaining width — CPU and memory read at a glance, same size for both.
// The value block has a fixed width so both sparklines end up the same
// length regardless of how wide the numbers are.
function ChartTile({icon, label, value, valueColor, sub, data, color}: {
    icon: ReactNode,
    label: string,
    value: string,
    valueColor?: string,
    sub: string,
    data: number[],
    color: string,
}) {
    return (
        <Box sx={{flex: '1.5 1 0', minWidth: 0}}>
            <TileLabel icon={icon} label={label}/>
            <Stack
                direction="row"
                spacing={1.5}
                sx={{
                    alignItems: "center",
                    minWidth: 0
                }}>
                <Box sx={{flexShrink: 0, width: 134, overflow: 'hidden'}}>
                    <Typography noWrap sx={{
                        fontFamily: t.mono,
                        fontWeight: 700,
                        fontSize: '1.05rem',
                        lineHeight: 1.2,
                        color: valueColor ?? t.text,
                    }}>
                        {value}
                    </Typography>
                    <Typography variant="caption" noWrap sx={{
                        color: t.textDim,
                        fontFamily: t.mono,
                        display: 'block',
                        minHeight: '1.1em',
                    }}>
                        {sub}
                    </Typography>
                </Box>
                <Box sx={{flexGrow: 1, minWidth: 60}}>
                    <Sparkline data={data} color={color} height={32}/>
                </Box>
            </Stack>
        </Box>
    );
}
