import {
    Box,
    Button,
    CircularProgress,
    IconButton,
    Paper,
    Popover,
    Skeleton,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    TableSortLabel,
    Tooltip,
    Typography
} from "@mui/material"
import {Check as CheckIcon, ContentCopy, RestartAlt as RestartIcon} from "@mui/icons-material"
import {useState, useSyncExternalStore} from "react"
import {type ContainerStats, DockerService, ORDER, SORT_FIELD} from "../../../gen/docker/v1/docker_pb"
import {formatBytes, getUsageColor} from "../../../lib/editor.ts";
import scrollbarStyles from "../../../components/scrollbar-style.tsx";
import {useCopyButton} from "../../../hooks/copy.ts";
import {callRPC, useHostClient} from "../../../lib/api.ts";
import {useSnackbar} from "../../../hooks/snackbar.ts";
import {type StatHistory} from "../../../hooks/docker-containers-stats.ts";
import Sparkline from "../../../components/sparkline.tsx";
import {healthColors, stateBadges, statsTheme as t} from "./stats-theme.ts";

interface ContainersTableProps {
    activeSortField: SORT_FIELD
    order: ORDER
    onFieldClick: (field: SORT_FIELD, orderBy: ORDER) => void
    containers: ContainerStats[]
    history: Map<string, StatHistory>
    placeHolders?: number
    loading: boolean
}

export function ContainerStatTable({
                                       containers, history, onFieldClick, activeSortField, order, loading, placeHolders = 5
                                   }: ContainersTableProps) {
    const isEmpty = !loading && containers.length === 0

    const handleSortRequest = (field: SORT_FIELD) => {
        if (loading || isEmpty) return;
        const isAsc = activeSortField === field && order === ORDER.ASC
        onFieldClick(field, activeSortField !== field ? ORDER.DSC : (isAsc ? ORDER.DSC : ORDER.ASC))
    }

    const headerSx = {
        py: 1.2,
        bgcolor: t.header,
        color: t.textDim,
        borderBottom: `1px solid ${t.border}`,
        whiteSpace: 'nowrap' as const,
        zIndex: 2,
    }

    const sortLabelSx = {
        fontWeight: 700,
        fontSize: '0.72rem',
        textTransform: 'uppercase' as const,
        letterSpacing: '0.06em',
        color: `${t.textDim} !important`,
        '&.Mui-active': {color: `${t.text} !important`},
        '& .MuiTableSortLabel-icon': {color: `${t.textDim} !important`},
    }

    const createSortHeader = (field: SORT_FIELD, label: string, align: 'left' | 'center' | 'right' = 'left') => (
        <TableCell align={align} sx={headerSx}>
            <TableSortLabel
                active={activeSortField === field}
                direction={order === ORDER.ASC ? 'asc' : 'desc'}
                onClick={() => handleSortRequest(field)}
                sx={sortLabelSx}
            >
                {label}
            </TableSortLabel>
        </TableCell>
    )

    const plainHeader = (label: string, align: 'left' | 'center' | 'right' = 'left') => (
        <TableCell align={align} sx={headerSx}>
            <Typography component="span" sx={{
                fontWeight: 700,
                fontSize: '0.72rem',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
            }}>
                {label}
            </Typography>
        </TableCell>
    )

    return (
        <TableContainer
            component={Paper}
            variant="outlined"
            sx={{
                flexGrow: 1,
                minHeight: 0,
                height: '100%',
                borderRadius: 2,
                overflow: 'auto',
                position: 'relative',
                bgcolor: t.panel,
                borderColor: t.border,
                ...scrollbarStyles,
            }}
        >
            <Table stickyHeader size="small" sx={{minWidth: 1180}}>
                <TableHead>
                    <TableRow>
                        {createSortHeader(SORT_FIELD.NAME, 'Name')}
                        {plainHeader('State')}
                        {plainHeader('Health', 'center')}
                        {createSortHeader(SORT_FIELD.STARTED, 'Uptime')}
                        {plainHeader('Restarts', 'center')}
                        {createSortHeader(SORT_FIELD.CPU, 'CPU')}
                        {createSortHeader(SORT_FIELD.MEM, 'Memory')}
                        {createSortHeader(SORT_FIELD.NETWORK_RX, 'Net I/O')}
                        {createSortHeader(SORT_FIELD.DISK_W, 'Disk I/O')}
                        {plainHeader('IP')}
                        <TableCell align="right" sx={headerSx}/>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {loading ? (
                        [...Array(placeHolders)].map((_, i) => (
                            <TableRow key={i} sx={{'& td': {borderColor: t.border, bgcolor: t.row}}}>
                                {[...Array(11)].map((_, j) => (
                                    <TableCell key={j}>
                                        <Skeleton variant="text" sx={{bgcolor: 'rgba(139,164,199,0.12)'}}/>
                                    </TableCell>
                                ))}
                            </TableRow>
                        ))
                    ) : isEmpty ? (
                        <TableRow>
                            <TableCell colSpan={11} sx={{height: 200, textAlign: 'center', bgcolor: t.row, borderColor: t.border}}>
                                <Typography variant="body2" sx={{color: t.textDim}}>
                                    No statistics available
                                </Typography>
                            </TableCell>
                        </TableRow>
                    ) : (
                        containers.map((container) => (
                            <StatRow
                                key={container.id}
                                stat={container}
                                hist={history.get(container.name)}
                            />
                        ))
                    )}
                </TableBody>
            </Table>
        </TableContainer>
    )
}

// Rows redraw on every poll tick — they are text and a ~40-point SVG, cheap
// at a 2.5s cadence, and skipping renders froze the charts.
function StatRow({stat, hist}: {
    stat: ContainerStats,
    hist?: StatHistory,
}) {
    const running = stat.state === 'running';
    // row seeded from the container list, metrics not read yet
    const pending = stat.cpuUsage < 0;
    const memLimit = Number(stat.memoryLimit);
    const memUsage = Number(stat.memoryUsage);
    const memPercent = memLimit > 0 ? (memUsage / memLimit) * 100 : 0;

    const cellSx = {
        py: 1,
        borderBottom: `1px solid ${t.border}`,
        color: t.text,
    };

    return (
        <TableRow
            hover
            sx={{
                bgcolor: t.row,
                '&:hover': {bgcolor: `${t.rowHover} !important`},
                '& td': cellSx,
                opacity: running ? 1 : 0.65,
            }}
        >
            <TableCell>
                <NameCell stat={stat}/>
            </TableCell>
            <TableCell>
                <StateBadge state={stat.state}/>
            </TableCell>
            <TableCell align="center">
                <HealthCell health={stat.health}/>
            </TableCell>
            <TableCell>
                <UptimeCell startedAt={running ? stat.startedAt : ''}/>
            </TableCell>
            <TableCell align="center">
                <Typography variant="caption" sx={{
                    fontFamily: t.mono,
                    color: stat.restartCount > 0 ? t.diskWrite : t.textDim,
                    fontWeight: stat.restartCount > 0 ? 700 : 400,
                }}>
                    {stat.restartCount > 0 ? stat.restartCount : '–'}
                </Typography>
            </TableCell>
            <TableCell>
                <MetricCell
                    text={pending ? '…' : `${stat.cpuUsage.toFixed(1)}%`}
                    textColor={pending ? t.textDim : getUsageColor(stat.cpuUsage)}
                    data={pending ? [] : hist?.cpu}
                    lineColor={t.cpuLine}
                />
            </TableCell>
            <TableCell>
                <MetricCell
                    text={pending ? '…' : formatBytes(memUsage)}
                    subText={!pending && memLimit > 0 ? `/ ${formatBytes(memLimit)}` : ''}
                    textColor={pending ? t.textDim : getUsageColor(memPercent)}
                    data={pending ? [] : hist?.mem}
                    lineColor={t.memLine}
                />
            </TableCell>
            <TableCell>
                {pending ? (
                    <Typography variant="caption" sx={{color: t.textDim}}>…</Typography>
                ) : (
                    <PairCell
                        aLabel="↓" aValue={Number(stat.networkRx)} aColor={t.netDown}
                        bLabel="↑" bValue={Number(stat.networkTx)} bColor={t.netUp}
                    />
                )}
            </TableCell>
            <TableCell>
                {pending ? (
                    <Typography variant="caption" sx={{color: t.textDim}}>…</Typography>
                ) : (
                    <PairCell
                        aLabel="r" aValue={Number(stat.blockRead)} aColor={t.diskRead}
                        bLabel="w" bValue={Number(stat.blockWrite)} bColor={t.diskWrite}
                    />
                )}
            </TableCell>
            <TableCell>
                <IPCell ips={stat.ipAddress}/>
            </TableCell>
            <TableCell align="right">
                <RestartButton containerId={stat.id} name={stat.name}/>
            </TableCell>
        </TableRow>
    );
}

function NameCell({stat}: { stat: ContainerStats }) {
    const {copiedId, handleCopy} = useCopyButton()
    return (
        <Box sx={{minWidth: 0, maxWidth: 260}}>
            <Typography variant="body2" sx={{fontWeight: 600, color: t.text}} noWrap>
                {stat.name}
            </Typography>
            <Stack direction="row" spacing={0.5} sx={{
                alignItems: "center"
            }}>
                <Typography variant="caption" sx={{fontFamily: t.mono, color: t.textDim}}>
                    {stat.id.substring(0, 12)}
                </Typography>
                <IconButton size="small" onClick={() => handleCopy(stat.id)} sx={{p: 0.2, color: t.textDim}}>
                    {copiedId === stat.id ?
                        <CheckIcon sx={{fontSize: 12, color: t.diskRead}}/> :
                        <ContentCopy sx={{fontSize: 12}}/>}
                </IconButton>
                {stat.image && (
                    <Tooltip title={stat.image} arrow>
                        <Typography variant="caption" sx={{color: t.textDim, minWidth: 0}} noWrap>
                            {stat.image}
                        </Typography>
                    </Tooltip>
                )}
            </Stack>
        </Box>
    );
}

function StateBadge({state}: { state: string }) {
    const badge = stateBadges[state] ?? {bg: 'rgba(71,85,105,0.55)', fg: '#cbd5e1', label: state || 'unknown'};
    return (
        <Box component="span" sx={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 0.6,
            px: 1.1,
            py: 0.35,
            borderRadius: 1,
            bgcolor: badge.bg,
            color: badge.fg,
            fontSize: '0.72rem',
            fontWeight: 700,
            fontFamily: t.mono,
            lineHeight: 1,
            whiteSpace: 'nowrap',
        }}>
            {state === 'running' ? '▶' : '■'} {badge.label}
        </Box>
    );
}

// health is a colored dot only (like the stack list), with the status text in
// a tooltip — the column stays narrow
function HealthCell({health}: { health: string }) {
    if (!health) {
        return <Typography variant="caption" sx={{color: t.textDim}}>–</Typography>;
    }
    const color = healthColors[health] ?? t.textDim;
    return (
        <Tooltip title={health} arrow>
            <Box sx={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                bgcolor: color,
                display: 'inline-block',
                verticalAlign: 'middle',
            }}/>
        </Tooltip>
    );
}

// MetricCell shows the live value above a small sparkline of its history,
// scaled like the Dockhand cards (zero-based, window max): a 3% CPU wiggle
// fills the chart, a container at 99% of its memory limit draws along the top.
function MetricCell({text, subText, textColor, data, lineColor}: {
    text: string;
    subText?: string;
    textColor: string;
    data?: number[];
    lineColor: string;
}) {
    return (
        <Box sx={{width: 150}}>
            <Typography variant="caption" component="div"
                        sx={{fontFamily: t.mono, whiteSpace: 'nowrap', lineHeight: 1.4, mb: 0.4}}>
                <Box component="span" sx={{fontWeight: 700, color: textColor}}>{text}</Box>
                {subText && (
                    <Box component="span" sx={{color: t.textDim, fontSize: '0.65rem'}}>
                        {' '}{subText}
                    </Box>
                )}
            </Typography>
            <Sparkline data={data ?? []} color={lineColor} height={26}/>
        </Box>
    );
}

function PairCell({aLabel, aValue, aColor, bLabel, bValue, bColor}: {
    aLabel: string; aValue: number; aColor: string;
    bLabel: string; bValue: number; bColor: string;
}) {
    return (
        <Stack spacing={0.3} sx={{minWidth: 90}}>
            <Typography variant="caption" sx={{fontFamily: t.mono, whiteSpace: 'nowrap', color: t.text}}>
                <Box component="span" sx={{color: aColor, fontWeight: 700}}>{aLabel}</Box>
                {' '}{formatBytes(aValue)}
            </Typography>
            <Typography variant="caption" sx={{fontFamily: t.mono, whiteSpace: 'nowrap', color: t.text}}>
                <Box component="span" sx={{color: bColor, fontWeight: 700}}>{bLabel}</Box>
                {' '}{formatBytes(bValue)}
            </Typography>
        </Stack>
    );
}

function IPCell({ips}: { ips: string[] }) {
    if (!ips || ips.length === 0) {
        return <Typography variant="caption" sx={{color: t.textDim}}>–</Typography>;
    }
    const [first, ...rest] = ips;
    return (
        <Tooltip title={ips.join(', ')} arrow disableHoverListener={rest.length === 0}>
            <Typography variant="caption" sx={{fontFamily: t.mono, color: t.text, whiteSpace: 'nowrap'}}>
                {first}{rest.length > 0 ? ` +${rest.length}` : ''}
            </Typography>
        </Tooltip>
    );
}

// formatUptime renders how long ago a container started, from an RFC3339 string:
// "3d 4h", "5h 12m", "8m", "42s". Empty / zero-time (never started) -> "—".
// `now` is passed in so the value can tick live (see useNow).
function formatUptime(startedAt: string, now: number): string {
    if (!startedAt || startedAt.startsWith('0001')) return '—';
    const start = Date.parse(startedAt);
    if (isNaN(start)) return '—';
    let secs = Math.floor((now - start) / 1000);
    if (secs < 0) secs = 0;
    const d = Math.floor(secs / 86400);
    const h = Math.floor((secs % 86400) / 3600);
    const m = Math.floor((secs % 3600) / 60);
    if (d > 0) return `${d}d ${h}h`;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m`;
    return `${secs}s`;
}

// A single shared 1s ticker drives every uptime cell so they count up live,
// without re-rendering the rest of the table (only cells calling useNow update).
// The interval only runs while at least one cell is mounted.
let tickNow = Date.now();
const tickListeners = new Set<() => void>();
let tickTimer: ReturnType<typeof setInterval> | null = null;

function subscribeTick(cb: () => void): () => void {
    tickListeners.add(cb);
    if (tickTimer === null) {
        tickTimer = setInterval(() => {
            tickNow = Date.now();
            tickListeners.forEach((l) => l());
        }, 1000);
    }
    return () => {
        tickListeners.delete(cb);
        if (tickListeners.size === 0 && tickTimer !== null) {
            clearInterval(tickTimer);
            tickTimer = null;
        }
    };
}

function useNow(): number {
    return useSyncExternalStore(subscribeTick, () => tickNow);
}

function UptimeCell({startedAt}: { startedAt: string }) {
    const now = useNow();
    const running = Boolean(startedAt) && !startedAt.startsWith('0001');
    const absolute = running ? new Date(startedAt).toLocaleString() : 'not running';
    return (
        <Tooltip title={absolute} arrow>
            <Typography variant="caption"
                        sx={{fontFamily: t.mono, color: t.textDim, whiteSpace: 'nowrap'}}>
                {formatUptime(startedAt, now)}
            </Typography>
        </Tooltip>
    );
}

// RestartButton restarts a single container, gated behind a small confirm popover
// so it can't fire on an accidental click while scanning the table.
function RestartButton({containerId, name}: { containerId: string; name: string }) {
    const dockerService = useHostClient(DockerService);
    const {showSuccess, showError} = useSnackbar();
    const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
    const [busy, setBusy] = useState(false);

    const doRestart = async () => {
        setAnchorEl(null);
        setBusy(true);
        const {err} = await callRPC(() => dockerService.containerRestart({containerIds: [containerId]}));
        setBusy(false);
        if (err) {
            showError(`Failed to restart ${name}: ${err}`);
        } else {
            showSuccess(`Restarting ${name}`);
        }
    };

    return (
        <>
            <Tooltip title="Restart container" arrow>
                <span>
                    <IconButton size="small" color="warning" disabled={busy}
                                onClick={(e) => setAnchorEl(e.currentTarget)}>
                        {busy ? <CircularProgress size={16}/> : <RestartIcon sx={{fontSize: 18}}/>}
                    </IconButton>
                </span>
            </Tooltip>
            <Popover
                open={Boolean(anchorEl)}
                anchorEl={anchorEl}
                onClose={() => setAnchorEl(null)}
                anchorOrigin={{vertical: 'bottom', horizontal: 'right'}}
                transformOrigin={{vertical: 'top', horizontal: 'right'}}
            >
                <Box sx={{p: 1.5, maxWidth: 240}}>
                    <Typography variant="body2" sx={{mb: 1.5}}>
                        Restart <b>{name}</b>?
                    </Typography>
                    <Stack direction="row" spacing={1} sx={{
                        justifyContent: "flex-end"
                    }}>
                        <Button size="small" onClick={() => setAnchorEl(null)}>Cancel</Button>
                        <Button size="small" variant="contained" color="warning" onClick={doRestart}>
                            Restart
                        </Button>
                    </Stack>
                </Box>
            </Popover>
        </>
    );
}
