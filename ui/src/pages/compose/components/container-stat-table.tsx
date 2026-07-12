import {
    Box,
    Button,
    CircularProgress,
    Divider,
    Fade,
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
import {
    Article as ReadIcon,
    Check as CheckIcon,
    ContentCopy,
    Edit as WriteIcon,
    GetApp as DownloadIcon,
    Publish as UploadIcon,
    RestartAlt as RestartIcon,
    Terminal as TerminalIcon
} from "@mui/icons-material"
import {useState, useSyncExternalStore} from "react"
import {type ContainerStats, DockerService, ORDER, SORT_FIELD} from "../../../gen/docker/v1/docker_pb"
import {formatBytes, getUsageColor} from "../../../lib/editor.ts";
import scrollbarStyles from "../../../components/scrollbar-style.tsx";
import {useCopyButton} from "../../../hooks/copy.ts";
import {callRPC, useHostClient} from "../../../lib/api.ts";
import {useSnackbar} from "../../../hooks/snackbar.ts";

interface ContainersTableProps {
    activeSortField: SORT_FIELD
    order: ORDER
    onFieldClick: (field: SORT_FIELD, orderBy: ORDER) => void
    containers: ContainerStats[]
    placeHolders?: number
    loading: boolean
}

export function ContainerStatTable({
                                       containers, onFieldClick, activeSortField, order, loading, placeHolders = 5
                                   }: ContainersTableProps) {
    const {copiedId, handleCopy} = useCopyButton()
    const isEmpty = !loading && containers.length === 0

    const handleSortRequest = (field: SORT_FIELD) => {
        if (loading || isEmpty) return;
        const isAsc = activeSortField === field && order === ORDER.ASC
        onFieldClick(field, activeSortField !== field ? ORDER.DSC : (isAsc ? ORDER.DSC : ORDER.ASC))
    }

    const createSortHeader = (field: SORT_FIELD, label: string, align: 'left' | 'center' | 'right' = 'left') => (
        <TableCell
            align={align}
            sx={{
                py: 1.5,
                bgcolor: 'background.paper',
                zIndex: 2
            }}
        >
            <TableSortLabel
                active={activeSortField === field}
                direction={order === ORDER.ASC ? 'asc' : 'desc'}
                onClick={() => handleSortRequest(field)}
                sx={{
                    fontWeight: 700,
                    fontSize: '0.75rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em'
                }}
            >
                {label}
            </TableSortLabel>
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
                ...scrollbarStyles,
            }}
        >
            <Table stickyHeader size="small">
                <TableHead>
                    <TableRow>
                        {createSortHeader(SORT_FIELD.NAME, 'Container')}
                        {createSortHeader(SORT_FIELD.CPU, 'CPU Usage', 'center')}
                        {createSortHeader(SORT_FIELD.MEM, 'Memory')}
                        {createSortHeader(SORT_FIELD.STARTED, 'Started')}
                        <TableCell sx={{
                            fontWeight: 700,
                            fontSize: '0.75rem',
                            bgcolor: 'background.paper',
                            zIndex: 2
                        }}>
                            <Stack direction="row" spacing={2}>
                                <span>NETWORK (RX/TX)</span>
                                <span>DISK (W/R)</span>
                            </Stack>
                        </TableCell>
                        <TableCell align="right" sx={{
                            bgcolor: 'background.paper',
                            zIndex: 2
                        }}/>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {loading ? (
                        [...Array(placeHolders)].map((_, i) => (
                            <TableRow key={i}>
                                <TableCell><Skeleton variant="text" width="80%"/></TableCell>
                                <TableCell align="center"><Skeleton variant="circular" width={32} height={32}
                                                                    sx={{mx: 'auto'}}/></TableCell>
                                <TableCell><Skeleton variant="rounded" height={24}/></TableCell>
                                <TableCell><Skeleton variant="text" width={60}/></TableCell>
                                <TableCell><Skeleton variant="rounded" height={24}/></TableCell>
                                <TableCell align="right"><Skeleton variant="circular" width={24} height={24}
                                                                   sx={{ml: 'auto'}}/></TableCell>
                            </TableRow>
                        ))
                    ) : isEmpty ? (
                        <TableRow>
                            <TableCell colSpan={6} sx={{height: 200, textAlign: 'center'}}>
                                <Typography variant="body2" color="text.secondary">No statistics available</Typography>
                            </TableCell>
                        </TableRow>
                    ) : (
                        containers.map((container) => (
                            <Fade in key={container.id}>
                                <TableRow hover sx={{
                                    '& td': {
                                        py: 1.5,
                                        borderBottom: '1px solid',
                                        borderColor: 'action.hover'
                                    }
                                }}>
                                    <TableCell>
                                        <Stack direction="row" spacing={1} alignItems="center">
                                            <TerminalIcon sx={{fontSize: 18, color: 'text.disabled'}}/>
                                            <Box sx={{minWidth: 0}}>
                                                <Typography variant="body2" fontWeight={600}>
                                                    {container.name}
                                                </Typography>
                                                <Stack direction="row" spacing={0.5} alignItems="center">
                                                    <Typography variant="caption"
                                                                sx={{fontFamily: 'monospace', color: 'text.disabled'}}>
                                                        {container.id.substring(0, 12)}
                                                    </Typography>
                                                    <IconButton size="small" onClick={() => handleCopy(container.id)}
                                                                sx={{p: 0.2}}>
                                                        {copiedId === container.id ?
                                                            <CheckIcon sx={{fontSize: 12, color: 'success.main'}}/> :
                                                            <ContentCopy sx={{fontSize: 12}}/>}
                                                    </IconButton>
                                                </Stack>
                                            </Box>
                                        </Stack>
                                    </TableCell>
                                    <TableCell align="center"><CPUStat value={container.cpuUsage}/></TableCell>
                                    <TableCell>
                                        <UsageBar usage={Number(container.memoryUsage)}
                                                  limit={Number(container.memoryLimit)}/>
                                    </TableCell>
                                    <TableCell><StartedCell startedAt={container.startedAt}/></TableCell>
                                    <TableCell>
                                        <Stack direction="row" spacing={4}
                                               divider={<Divider orientation="vertical" flexItem/>}>
                                            <RWData up={Number(container.networkTx)}
                                                    down={Number(container.networkRx)} type="net"/>
                                            <RWData up={Number(container.blockRead)}
                                                    down={Number(container.blockWrite)} type="disk"/>
                                        </Stack>
                                    </TableCell>
                                    <TableCell align="right">
                                        <RestartButton containerId={container.id} name={container.name}/>
                                    </TableCell>
                                </TableRow>
                            </Fade>
                        ))
                    )}
                </TableBody>
            </Table>
        </TableContainer>
    )
}

function CPUStat({value}: { value: number }) {
    const color = getUsageColor(value);
    const circleSize = 48;
    return (
        <Box sx={{position: 'relative', display: 'inline-flex'}}>
            <CircularProgress variant="determinate" value={100} size={circleSize} thickness={4} sx={{color: 'grey'}}/>
            <CircularProgress
                variant="determinate"
                value={Math.min(value, 100)}
                size={circleSize}
                thickness={4}
                sx={{color, position: 'absolute', left: 0, strokeLinecap: 'round'}}
            />
            <Box sx={{inset: 0, position: 'absolute', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
                <Typography variant="caption" sx={{fontWeight: 700, fontSize: '0.65rem', color}}>
                    {value.toFixed(0)}%
                </Typography>
            </Box>
        </Box>
    )
}

export function UsageBar({usage, limit}: { usage: number, limit: number }) {
    const percent = limit > 0 ? (usage / limit) * 100 : 0
    const color = getUsageColor(percent)

    return (
        <Box sx={{width: 160}}>
            <Stack direction="row" justifyContent="space-between" sx={{mb: 0.5}}>
                <Typography variant="caption" sx={{fontWeight: 700, color}}>
                    {percent.toFixed(1)}%
                </Typography>
                <Typography variant="caption" sx={{fontFamily: 'monospace', color: 'text.secondary'}}>
                    {formatBytes(usage)}
                </Typography>
            </Stack>
            <Box sx={{height: 6, width: '100%', bgcolor: 'grey', borderRadius: 3, overflow: 'hidden'}}>
                <Box sx={{width: `${percent}%`, height: '100%', bgcolor: color, transition: 'width 0.5s ease'}}/>
            </Box>
        </Box>
    )
}

const RWData = ({up, down, type}: { up: number; down: number, type: 'net' | 'disk' }) => {
    const UpIcon = type === 'net' ? UploadIcon : ReadIcon;
    const DownIcon = type === 'net' ? DownloadIcon : WriteIcon;

    return (
        <Stack spacing={0.5}>
            <Stack direction="row" spacing={1} alignItems="center">
                <DownIcon sx={{fontSize: 14, color: 'text.disabled'}}/>
                <Typography variant="caption" sx={{fontFamily: 'monospace', minWidth: 60}}>
                    {formatBytes(down)}
                </Typography>
            </Stack>
            <Stack direction="row" spacing={1} alignItems="center">
                <UpIcon sx={{fontSize: 14, color: 'text.disabled'}}/>
                <Typography variant="caption" sx={{fontFamily: 'monospace', minWidth: 60}}>
                    {formatBytes(up)}
                </Typography>
            </Stack>
        </Stack>
    )
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

function StartedCell({startedAt}: { startedAt: string }) {
    const now = useNow();
    const running = Boolean(startedAt) && !startedAt.startsWith('0001');
    const absolute = running ? new Date(startedAt).toLocaleString() : 'not running';
    return (
        <Tooltip title={absolute} arrow>
            <Typography variant="caption"
                        sx={{fontFamily: 'monospace', color: 'text.secondary', whiteSpace: 'nowrap'}}>
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
                    <Stack direction="row" spacing={1} justifyContent="flex-end">
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
