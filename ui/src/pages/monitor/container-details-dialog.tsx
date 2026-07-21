import {
    Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent,
    DialogTitle, Divider, IconButton, Paper, Popover, Stack, Tab, Table, TableBody, TableCell,
    TableContainer, TableHead, TableRow, Tabs, TextField, Tooltip, Typography,
} from '@mui/material';
import {
    Check, Close, Code, ContentCopy, Delete, DeleteSweep, Dns, FavoriteBorder, InfoOutlined, LabelOutlined, Lan,
    Memory, Pause, PlayArrow, Refresh, RestartAlt, Security as SecurityIcon, Stop, Storage,
    Subject, Terminal, Tune, Update, Visibility, VisibilityOff, PlayCircleOutlined, FolderOpenOutlined,
} from '@mui/icons-material';
import {type ReactElement, type ReactNode, useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {FitAddon} from '@xterm/addon-fit';
import type {Terminal as XTerm} from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import {DockerService, type ContainerList, type Network} from '../../gen/docker/v1/docker_pb.ts';
import {callRPC, useContainerExecOptionsUrl, useContainerExecWsUrl, useHostClient} from '../../lib/api.ts';
import {useSnackbar} from '../../hooks/snackbar.ts';
import {useCopyButton} from '../../hooks/copy.ts';
import LogsViewer from '../../components/log-viewer/logs-viewer.tsx';
import Sparkline from '../../components/sparkline.tsx';
import {formatBytes} from '../../lib/editor.ts';
import scrollbarStyles from '../../components/scrollbar-style.tsx';
import {statsTheme as t} from '../compose/components/stats-theme.ts';
import AppTerminal from '../compose/components/logs-terminal.tsx';
import {createTab} from '../compose/state/terminal.tsx';
import type {MonitorRow, RowAction} from './monitor-table.tsx';
import ContainerFileBrowser from '../../components/container-file-browser.tsx';

type JsonObject = Record<string, unknown>;
type TabID = 'overview' | 'logs' | 'exec' | 'processes' | 'networks' | 'mounts' | 'environment'
    | 'labels' | 'security' | 'resources' | 'health' | 'files' | 'inspect';

interface Props {
    open: boolean;
    row: MonitorRow | null;
    containers: ContainerList[];
    history?: {cpu: number[]; mem: number[]};
    busy?: RowAction;
    stackBusy: boolean;
    updateRun?: 'running' | 'failed' | 'done';
    onClose: () => void;
    onAction: (row: MonitorRow, action: RowAction) => void;
}

const tabs: {id: TabID, label: string, icon: ReactElement}[] = [
    {id: 'overview', label: 'Overview', icon: <InfoOutlined/>}, {id: 'logs', label: 'Logs', icon: <Subject/>},
    {id: 'exec', label: 'Exec', icon: <Terminal/>},
    {id: 'processes', label: 'Processes', icon: <Terminal/>}, {id: 'networks', label: 'Networks', icon: <Lan/>},
    {id: 'mounts', label: 'Mounts', icon: <Storage/>}, {id: 'environment', label: 'Environment', icon: <Tune/>},
    {id: 'files', label: 'Files', icon: <FolderOpenOutlined/>},
    {id: 'labels', label: 'Labels', icon: <LabelOutlined/>}, {id: 'security', label: 'Security', icon: <SecurityIcon/>},
    {id: 'resources', label: 'Resources', icon: <Memory/>}, {id: 'health', label: 'Health', icon: <FavoriteBorder/>},
    {id: 'inspect', label: 'Inspect JSON', icon: <Code/>},
];

const asObject = (value: unknown): JsonObject => value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonObject : {};
const asArray = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const text = (value: unknown, fallback = '–'): string => {
    if (value === null || value === undefined || value === '') return fallback;
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
};
const field = (object: unknown, key: string): unknown => asObject(object)[key];
const list = (value: unknown): string[] => asArray(value).map(v => text(v, ''));
const fmtDate = (value: unknown) => {
    const raw = text(value, '');
    if (!raw || raw.startsWith('0001-')) return '–';
    const date = new Date(raw);
    return Number.isNaN(date.getTime()) ? raw : date.toLocaleString();
};
const fmtLimit = (value: unknown) => {
    const n = Number(value ?? 0);
    return n > 0 ? formatBytes(n) : 'Unlimited / default';
};
const fmtDuration = (value: unknown) => {
    const ns = Number(value ?? 0);
    if (!Number.isFinite(ns) || ns <= 0) return 'Default';
    if (ns >= 1e9) return `${ns / 1e9}s`;
    if (ns >= 1e6) return `${ns / 1e6}ms`;
    if (ns >= 1e3) return `${ns / 1e3}µs`;
    return `${ns}ns`;
};

function Section({title, children, fill = false}: {title: string, children: ReactNode, fill?: boolean}) {
    return <Paper variant="outlined" sx={{p: 1.35, borderColor: t.border, bgcolor: t.panel, borderRadius: 1.5,
        ...(fill ? {height: '100%', minHeight: 0, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', overflow: 'hidden'} : {})}}>
        <Typography sx={{fontWeight: 800, mb: 0.85, fontSize: '0.82rem', letterSpacing: '0.02em', flexShrink: 0}}>{title}</Typography>{children}
    </Paper>;
}

function Details({rows}: {rows: [string, unknown][]}) {
    return <Box sx={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 285px), 1fr))', columnGap: 2, rowGap: 0.25}}>
        {rows.map(([label, value]) => <Box key={label} sx={{display: 'grid', gridTemplateColumns: 'minmax(96px, 0.42fr) minmax(0, 1fr)', gap: 1, minWidth: 0, py: 0.35}}>
            <Typography sx={{color: t.textDim, fontSize: '0.72rem'}}>{label}</Typography>
            <Typography sx={{fontFamily: t.mono, fontSize: '0.73rem', overflowWrap: 'anywhere', userSelect: 'text', cursor: 'text'}}>{text(value)}</Typography>
        </Box>)}
    </Box>;
}

function StringChips({values, empty = 'None'}: {values: string[], empty?: string}) {
    if (values.length === 0) return <Typography color="text.secondary">{empty}</Typography>;
    return <Stack direction="row" useFlexGap spacing={0.75} sx={{flexWrap: 'wrap'}}>
        {values.map((v, i) => <Chip key={`${v}-${i}`} label={v} size="small" sx={{fontFamily: t.mono}}/>)}
    </Stack>;
}

function KeyValueTable({value, maskSecrets = false, scrollable = false}: {value: unknown, maskSecrets?: boolean, scrollable?: boolean}) {
    const [revealed, setRevealed] = useState(false);
    const entries = useMemo(() => {
        if (Array.isArray(value)) return value.map(v => {
            const raw = text(v, ''); const idx = raw.indexOf('=');
            return idx < 0 ? [raw, ''] : [raw.slice(0, idx), raw.slice(idx + 1)];
        });
        return Object.entries(asObject(value)).sort(([a], [b]) => a.localeCompare(b));
    }, [value]);
    const sensitive = (key: string) => /pass|token|secret|credential|private|api.?key|cookie|auth/i.test(key);
    return <Stack spacing={1} sx={scrollable ? {flex: 1, minHeight: 0, overflow: 'hidden'} : undefined}>
        {maskSecrets && <Box><Button size="small" startIcon={revealed ? <VisibilityOff/> : <Visibility/>}
            onClick={() => setRevealed(v => !v)}>{revealed ? 'Mask sensitive values' : 'Reveal sensitive values'}</Button></Box>}
        <TableContainer sx={scrollable ? {flex: 1, minHeight: 0, overflow: 'auto', ...scrollbarStyles} : undefined}><Table size="small" stickyHeader={scrollable} sx={{'& .MuiTableCell-root': {py: 0.55, px: 1, fontSize: '0.73rem'}}}><TableHead><TableRow><TableCell>Name</TableCell><TableCell>Value</TableCell></TableRow></TableHead>
            <TableBody>{entries.map(([key, val]) => <TableRow key={String(key)} hover>
                <TableCell sx={{fontFamily: t.mono, width: '32%', overflowWrap: 'anywhere'}}>{String(key)}</TableCell>
                <TableCell sx={{fontFamily: t.mono, overflowWrap: 'anywhere'}}>
                    {maskSecrets && sensitive(String(key)) && !revealed ? '••••••••' : text(val, '')}
                </TableCell>
            </TableRow>)}</TableBody></Table></TableContainer>
        {entries.length === 0 && <Typography color="text.secondary">None</Typography>}
    </Stack>;
}

function MetricCard({label, value, sub, data, color}: {label: string, value: string, sub?: string, data?: number[], color: string}) {
    return <Box sx={{display: 'grid', gridTemplateColumns: data ? '92px minmax(80px, 1fr)' : '1fr', alignItems: 'center', gap: 1.25, minWidth: data ? 210 : 120, flex: data ? '1 1 240px' : '0 1 auto'}}>
        <Box><Typography sx={{color: t.textDim, fontSize: '0.68rem'}}>{label}</Typography>
            <Typography sx={{fontFamily: t.mono, fontWeight: 800, fontSize: '0.82rem'}}>{value}</Typography>
            {sub && <Typography sx={{color: t.textDim, fontSize: '0.64rem'}}>{sub}</Typography>}</Box>
        {data && <Sparkline data={data} color={color} height={34}/>}
    </Box>;
}

function traefikEndpoints(labels: JsonObject, addresses: string[]): string[] {
    const endpoints = new Set(addresses
        .map(value => value.trim().toLowerCase())
        .filter(value => /[a-z]/i.test(value) && value.includes('.') && !value.includes(':')));
    const explicitlyDisabled = Object.entries(labels).some(([key, value]) =>
        key.toLowerCase() === 'traefik.enable' && text(value, '').trim().toLowerCase() === 'false');
    if (explicitlyDisabled) return [...endpoints].sort((a, b) => a.localeCompare(b));
    const hostFunction = /\bHost(?:SNI(?:Regexp)?|Regexp)?\s*\(([^)]*)\)/gi;
    const quotedValue = /[`"']([^`"']+)[`"']/g;
    for (const [key, raw] of Object.entries(labels)) {
        if (!/^traefik\.(?:http|tcp|udp)\.routers\..+\.rule$/i.test(key)) continue;
        for (const call of text(raw, '').matchAll(hostFunction)) {
            for (const match of call[1].matchAll(quotedValue)) {
                const endpoint = match[1].trim().replace(/\.$/, '').toLowerCase();
                if (endpoint && endpoint !== '*') endpoints.add(endpoint);
            }
        }
    }
    return [...endpoints].sort((a, b) => a.localeCompare(b));
}

function Dependencies({raw}: {raw: unknown}) {
    const dependencies = text(raw, '').split(',').map(value => value.trim()).filter(Boolean).map(value => {
        const parts = value.split(':');
        return {
            service: parts[0] || value,
            condition: parts[1]?.replace(/^service_/, '').replaceAll('_', ' ') || 'started',
            restart: parts[2] === 'true',
        };
    });
    if (dependencies.length === 0) return <Typography color="text.secondary" sx={{fontSize: '0.73rem'}}>None</Typography>;
    return <Stack direction="row" useFlexGap spacing={0.65} sx={{flexWrap: 'wrap'}}>
        {dependencies.map(dep => <Chip key={`${dep.service}:${dep.condition}:${dep.restart}`} size="small"
            label={`${dep.service} · ${dep.condition} · restart propagation: ${dep.restart ? 'yes' : 'no'}`}
            color={dep.restart ? 'info' : 'default'} sx={{fontFamily: t.mono, fontSize: '0.68rem'}}/>)}
    </Stack>;
}

function PortsView({value}: {value: unknown}) {
    const ports = Object.entries(asObject(value)).sort(([a], [b]) => a.localeCompare(b, undefined, {numeric: true}));
    if (ports.length === 0) return <Typography color="text.secondary" sx={{fontSize: '0.73rem'}}>None</Typography>;
    return <TableContainer><Table size="small" sx={{'& .MuiTableCell-root': {py: 0.45, px: 0.8, fontSize: '0.72rem'}}}>
        <TableHead><TableRow><TableCell>Container port</TableCell><TableCell>Published on host</TableCell></TableRow></TableHead>
        <TableBody>{ports.map(([containerPort, raw]) => {
            const bindings = asArray(raw).map(asObject);
            return <TableRow key={containerPort} hover>
                <TableCell sx={{width: '30%', fontFamily: t.mono, fontWeight: 700}}>{containerPort}</TableCell>
                <TableCell><Stack direction="row" useFlexGap spacing={0.55} sx={{flexWrap: 'wrap'}}>
                    {bindings.length === 0
                        ? <Chip size="small" label="Exposed only" variant="outlined" sx={{height: 22, fontSize: '0.66rem'}}/>
                        : bindings.map((binding, index) => {
                            const ip = text(binding.HostIp, '') || 'all interfaces';
                            const port = text(binding.HostPort, 'dynamic');
                            return <Chip key={`${ip}:${port}:${index}`} size="small" label={`${ip}:${port}`}
                                sx={{height: 22, fontFamily: t.mono, fontSize: '0.66rem'}}/>;
                        })}
                </Stack></TableCell>
            </TableRow>;
        })}</TableBody>
    </Table></TableContainer>;
}

function Overview({row, inspect, history, processCount, onUpdate, updateRun}: {
    row: MonitorRow, inspect: JsonObject, history?: {cpu: number[]; mem: number[]}, processCount: number | null,
    onUpdate: () => void, updateRun?: 'running' | 'failed' | 'done',
}) {
    const state = asObject(inspect.State); const config = asObject(inspect.Config);
    const host = asObject(inspect.HostConfig); const network = asObject(inspect.NetworkSettings);
    const endpoints = asObject(network.Networks); const stats = row.stats;
    const restartPolicy = asObject(host.RestartPolicy);
    const labels = asObject(config.Labels);
    const portBindings = asObject(host.PortBindings);
    const dns = traefikEndpoints(labels, row.info.IPAddress);
    return <Stack spacing={1.25}>
        <Paper variant="outlined" sx={{px: 1.5, py: 1, borderColor: t.border, bgcolor: t.panel, borderRadius: 1.5}}>
            <Stack direction="row" useFlexGap spacing={1.5} divider={<Divider orientation="vertical" flexItem sx={{borderColor: t.border}}/>}
                sx={{alignItems: 'stretch', flexWrap: 'wrap'}}>
                <MetricCard label="CPU" value={stats ? `${stats.cpuUsage.toFixed(2)}%` : '–'} data={history?.cpu} color={t.cpuLine}/>
                <MetricCard label="RAM" value={stats ? formatBytes(Number(stats.memoryUsage)) : '–'}
                    sub={stats ? `/ ${formatBytes(Number(stats.memoryLimit))}` : undefined} data={history?.mem} color={t.memLine}/>
                <MetricCard label="Network I/O" value={stats ? `↓ ${formatBytes(Number(stats.networkRx))}` : '–'}
                    sub={stats ? `↑ ${formatBytes(Number(stats.networkTx))}` : undefined} color="#64b5f6"/>
                <MetricCard label="Disk I/O" value={stats ? `R ${formatBytes(Number(stats.blockRead))}` : '–'}
                    sub={stats ? `W ${formatBytes(Number(stats.blockWrite))}` : undefined} color="#ba68c8"/>
                <MetricCard label="Processes" value={processCount === null ? '–' : String(processCount)} color="#81c784"/>
            </Stack>
        </Paper>
        <Box sx={{display: 'grid', gridTemplateColumns: {xs: '1fr', lg: '1fr 1fr'}, gap: 1.25}}>
            <Section title="Container">
                <Details rows={[
                    ['State', state.Status ?? row.info.state], ['Running / paused / restarting', `${text(state.Running)} / ${text(state.Paused)} / ${text(state.Restarting)}`],
                    ['Health', field(state.Health, 'Status') ?? row.info.health], ['OOM killed', state.OOMKilled], ['State error', state.Error],
                    ['Stack', row.info.stackName || 'Standalone'], ['Restart policy', `${text(restartPolicy.Name, 'no')} (${text(restartPolicy.MaximumRetryCount, '0')})`],
                    ['ID', inspect.Id ?? row.info.id], ['Created', fmtDate(inspect.Created)], ['Started', fmtDate(state.StartedAt)],
                    ['Platform', inspect.Platform], ['Exit code', state.ExitCode], ['Restart count', inspect.RestartCount ?? stats?.restartCount],
                ]}/>
            </Section>
            <Section title="Runtime">
                <Details rows={[
                    ['Image', config.Image ?? row.info.imageName], ['Image SHA', inspect.Image], ['Command', list(config.Cmd).join(' ')],
                    ['Entrypoint', list(config.Entrypoint).join(' ')], ['Path / args', `${text(inspect.Path, '')} ${list(inspect.Args).join(' ')}`.trim()],
                    ['Working directory', config.WorkingDir], ['Processes', processCount],
                ]}/>
                <Typography sx={{color: t.textDim, fontSize: '0.72rem', mt: 0.65, mb: 0.4}}>Depends on</Typography>
                <Dependencies raw={field(labels, 'com.docker.compose.depends_on')}/>
                <Stack direction="row" spacing={1} sx={{mt: 0.8, alignItems: 'center'}}>
                    <Chip size="small" color={row.info.updateAvailable ? 'warning' : 'success'}
                        label={row.info.updateAvailable ? `Update available: ${row.info.updateAvailable}` : 'Image up to date'}/>
                    <Button size="small" variant="outlined" startIcon={updateRun === 'running' ? <CircularProgress size={14}/> : <Update/>}
                        disabled={updateRun === 'running'} onClick={onUpdate}>Update</Button>
                </Stack>
            </Section>
        </Box>
        <Box sx={{display: 'grid', gridTemplateColumns: {xs: '1fr', lg: '1fr 1fr'}, gap: 1.25}}>
            <Section title="Addresses & endpoints">
                {dns.length > 0 && <Stack direction="row" useFlexGap spacing={0.65} sx={{flexWrap: 'wrap', mb: 0.8}}>
                    {dns.map(domain => <Chip key={domain} size="small" icon={<Dns/>} label={domain}
                        sx={{fontFamily: t.mono, userSelect: 'text'}}/>)}
                </Stack>}
                <Details rows={Object.entries(endpoints).flatMap(([name, raw]) => {
                    const ep = asObject(raw); return [
                        [`${name} IP`, ep.IPAddress], [`${name} endpoint`, ep.EndpointID], [`${name} gateway`, ep.Gateway],
                    ] as [string, unknown][];
                }).concat([["Traefik endpoints", dns.join(', ')]])}/>
            </Section>
            <Section title="Ports"><PortsView value={Object.keys(portBindings).length ? portBindings : network.Ports}/></Section>
        </Box>
    </Stack>;
}

function Processes({active, containerID, onCount}: {active: boolean, containerID: string, onCount: (n: number | null) => void}) {
    const client = useHostClient(DockerService); const [loading, setLoading] = useState(false);
    const [error, setError] = useState(''); const [titles, setTitles] = useState<string[]>([]); const [rows, setRows] = useState<string[][]>([]);
    const refresh = useCallback(async () => {
        setLoading(true); const {val, err} = await callRPC(() => client.containerTop({containerId: containerID}));
        setLoading(false); setError(err ?? '');
        const top = val?.top; const next = top?.proc.map(p => p.Processes) ?? [];
        setTitles(top?.Titles ?? []); setRows(next); onCount(err ? null : next.length);
    }, [client, containerID, onCount]);
    useEffect(() => { if (!active) return; void refresh(); const id = setInterval(refresh, 5000); return () => clearInterval(id); }, [active, refresh]);
    return <Section title="Running processes" fill>
        <Box sx={{display: 'flex', justifyContent: 'space-between', mb: 1, flexShrink: 0}}><Chip size="small" label={`${rows.length} active`}/>
            <Button size="small" startIcon={loading ? <CircularProgress size={14}/> : <Refresh/>} onClick={refresh} disabled={loading}>Refresh</Button></Box>
        {error && <Alert severity="error">{error}</Alert>}
        <TableContainer sx={{flex: 1, minHeight: 0, overflow: 'auto', ...scrollbarStyles}}><Table size="small" stickyHeader sx={{'& .MuiTableCell-root': {py: 0.55, px: 1, fontSize: '0.72rem'}}}><TableHead><TableRow>{titles.map(v => <TableCell key={v}>{v}</TableCell>)}</TableRow></TableHead>
            <TableBody>{rows.map((r, i) => <TableRow key={i} hover>{r.map((v, j) => <TableCell key={j} sx={{fontFamily: t.mono, whiteSpace: 'nowrap'}}>{v}</TableCell>)}</TableRow>)}</TableBody>
        </Table></TableContainer>
    </Section>;
}

function friendlyNetworkMode(value: unknown, containers: ContainerList[]): string {
    const mode = text(value, '');
    const match = /^container:(.+)$/.exec(mode);
    if (!match) return mode || '–';

    const reference = match[1];
    const target = containers.find(container =>
        container.id === reference || container.id.startsWith(reference) || reference.startsWith(container.id));
    return target ? `container:${target.name}` : mode;
}

function Networks({containerID, containers, inspect, onChanged}: {
    containerID: string, containers: ContainerList[], inspect: JsonObject, onChanged: () => void,
}) {
    const client = useHostClient(DockerService); const {showError, showSuccess} = useSnackbar();
    const [networks, setNetworks] = useState<Network[]>([]); const [busy, setBusy] = useState('');
    const [confirm, setConfirm] = useState<{network: Network, action: 'connect' | 'disconnect'} | null>(null);
    const load = useCallback(async () => { const {val, err} = await callRPC(() => client.networkList({})); if (err) showError(err); else setNetworks(val?.networks ?? []); }, [client, showError]);
    useEffect(() => { void load(); }, [load]);
    const settings = asObject(inspect.NetworkSettings); const mounted = asObject(settings.Networks); const host = asObject(inspect.HostConfig);
    const run = async () => {
        if (!confirm) return; const key = `${confirm.action}:${confirm.network.id}`; setBusy(key);
        const request = {networkId: confirm.network.id, containerId: containerID};
        const result = confirm.action === 'connect'
            ? await callRPC(() => client.networkConnectContainer(request))
            : await callRPC(() => client.networkDisconnectContainer(request));
        const {err} = result;
        setBusy(''); setConfirm(null);
        if (err) showError(`Network ${confirm.action} failed: ${err}`); else {showSuccess(`Network ${confirm.action}ed`); await load(); onChanged();}
    };
    return <Stack spacing={1.25}>
        <Section title="Network configuration"><Details rows={[
            ['Mode', friendlyNetworkMode(host.NetworkMode, containers)], ['DNS', list(host.Dns).join(', ')], ['DNS search', list(host.DnsSearch).join(', ')],
            ['DNS options', list(host.DnsOptions).join(', ')], ['Sandbox ID', settings.SandboxID], ['Sandbox key', settings.SandboxKey],
        ]}/></Section>
        <Section title="Mounted networks"><Stack spacing={0.75}>
            {Object.entries(mounted).map(([name, raw]) => { const ep = asObject(raw); const network = networks.find(n => n.name === name);
                return <Paper key={name} variant="outlined" sx={{px: 1.1, py: 0.8}}><Stack direction={{xs: 'column', md: 'row'}} sx={{justifyContent: 'space-between', gap: 1}}>
                    <Box><Typography sx={{fontWeight: 800}}>{name}</Typography><Typography sx={{fontFamily: t.mono, fontSize: '0.75rem', color: t.textDim}}>
                        IP {text(ep.IPAddress)} · gateway {text(ep.Gateway)} · MAC {text(ep.MacAddress)}<br/>
                        endpoint {text(ep.EndpointID)} · aliases {list(ep.Aliases).join(', ') || '–'}</Typography></Box>
                    {network && <Button size="small" color="error" disabled={!!busy} onClick={() => setConfirm({network, action: 'disconnect'})}>Disconnect</Button>}
                </Stack></Paper>;
            })}{Object.keys(mounted).length === 0 && <Typography color="text.secondary">No mounted network</Typography>}
        </Stack></Section>
        <Section title="Available networks"><Stack direction="row" useFlexGap spacing={0.6} sx={{flexWrap: 'wrap'}}>
            {networks.filter(n => !(n.name in mounted)).sort((a, b) => a.name.localeCompare(b.name)).map(n =>
                <Tooltip key={n.id} title={`${n.driver} driver`} arrow><span><Button variant="outlined" size="small"
                    disabled={!!busy || n.name === 'host' || n.name === 'none'} onClick={() => setConfirm({network: n, action: 'connect'})}
                    sx={{minHeight: 25, px: 0.8, py: 0.15, borderRadius: 1, textTransform: 'none', fontFamily: t.mono, fontSize: '0.68rem'}}>
                    {n.name}<Typography component="span" sx={{ml: 0.55, color: t.textDim, fontSize: '0.62rem'}}>· {n.driver}</Typography>
                </Button></span></Tooltip>)}
        </Stack></Section>
        <Section title="Mapped & exposed ports"><PortsView value={settings.Ports ?? host.PortBindings}/></Section>
        <Dialog open={confirm !== null} onClose={() => setConfirm(null)}><DialogTitle>{confirm?.action === 'connect' ? 'Connect network?' : 'Disconnect network?'}</DialogTitle>
            <DialogContent><Typography>{confirm?.network.name} · {confirm?.network.driver}</Typography></DialogContent>
            <DialogActions><Button onClick={() => setConfirm(null)}>Cancel</Button><Button variant="contained" color={confirm?.action === 'disconnect' ? 'error' : 'primary'} onClick={run}>Confirm</Button></DialogActions>
        </Dialog>
    </Stack>;
}

function ExecTerminal({active, containerID, running}: {active: boolean, containerID: string, running: boolean}) {
    const createExecUrl = useContainerExecWsUrl();
    const createOptionsUrl = useContainerExecOptionsUrl();
    const fitAddon = useRef(new FitAddon());
    const xterm = useRef<XTerm | null>(null);
    const [shells, setShells] = useState<string[] | null>(null);
    const [shellError, setShellError] = useState('');
    const [shell, setShell] = useState('');
    const [userChoice, setUserChoice] = useState('context');
    const [otherUser, setOtherUser] = useState('');
    const [fontSize, setFontSize] = useState(() => Number(localStorage.getItem('dockman-exec-fontsize')) || 12);
    const [connected, setConnected] = useState(false);
    const {handleCopy, copiedId} = useCopyButton();
    useEffect(() => {setConnected(false); setShells(null); setShell(''); setShellError('');}, [containerID]);
    useEffect(() => {
        if (!active || !running) return;
        const controller = new AbortController();
        setShells(null); setShellError('');
        fetch(createOptionsUrl(containerID), {signal: controller.signal})
            .then(async response => {
                if (!response.ok) throw new Error(await response.text() || `HTTP ${response.status}`);
                return response.json() as Promise<{shells?: string[]}>;
            })
            .then(result => {
                const available = result.shells ?? [];
                setShells(available);
                setShell(current => available.includes(current) ? current : available[0] ?? '');
            })
            .catch(error => {if (error instanceof Error && error.name !== 'AbortError') {setShellError(error.message); setShells([]);}});
        return () => controller.abort();
    }, [active, containerID, createOptionsUrl, running]);
    const execUser = userChoice === 'context' ? '' : userChoice === 'other' ? otherUser.trim() : userChoice;
    const terminal = useMemo(() => connected
        ? createTab(createExecUrl(containerID, shell, undefined, execUser), `Exec: ${containerID.slice(0, 12)}`, true)
        : null, [connected, containerID, createExecUrl, execUser, shell]);
    const controlledTerminal = useMemo(() => terminal ? {
        ...terminal,
        onTerminal: (term: XTerm) => {xterm.current = term; terminal.onTerminal(term);},
        onClose: () => {xterm.current = null; terminal.onClose();},
    } : null, [terminal]);
    const copyTerminal = () => {
        const term = xterm.current;
        if (!term) return;
        const selected = term.getSelection();
        const lines: string[] = [];
        if (!selected) {
            const buffer = term.buffer.active;
            for (let i = 0; i < buffer.length; i++) lines.push(buffer.getLine(i)?.translateToString(true) ?? '');
        }
        handleCopy(selected || lines.join('\n').replace(/\n+$/, ''));
    };
    const changeFontSize = (value: number) => {localStorage.setItem('dockman-exec-fontsize', String(value)); setFontSize(value);};
    if (!running) return <Alert severity="info">Start or unpause the container to open an interactive terminal.</Alert>;
    return <Paper variant="outlined" sx={{height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', bgcolor: '#09090b', borderColor: t.border}}>
        <Stack direction="row" useFlexGap spacing={0.65} sx={{px: 1, py: 0.6, alignItems: 'center', flexWrap: 'wrap', flexShrink: 0, borderBottom: `1px solid ${t.border}`, bgcolor: '#111318'}}>
            <Terminal sx={{fontSize: 17, color: '#7dd3fc'}}/>
            <Typography sx={{fontSize: '0.73rem', fontWeight: 800, whiteSpace: 'nowrap'}}>{containerID.slice(0, 12)}</Typography>
            {shells === null ? <CircularProgress size={16}/> : shells.length > 0 && <TextField select size="small" value={shell} disabled={connected}
                onChange={event => setShell(event.target.value)} aria-label="Shell" slotProps={{select: {native: true}}}
                sx={{width: 135, '& .MuiInputBase-root': {height: 28, fontFamily: t.mono, fontSize: '0.68rem'}}}>
                {shells.map(value => <option key={value} value={value}>{value}</option>)}
            </TextField>}
            <TextField select size="small" value={userChoice} disabled={connected} onChange={event => setUserChoice(event.target.value)}
                aria-label="Exec user" slotProps={{select: {native: true}}}
                sx={{width: 145, '& .MuiInputBase-root': {height: 28, fontSize: '0.68rem'}}}>
                <option value="context">Container context</option><option value="root">root</option>
                <option value="nobody">nobody</option><option value="other">Other…</option>
            </TextField>
            {userChoice === 'other' && <TextField size="small" value={otherUser} disabled={connected} onChange={event => setOtherUser(event.target.value)}
                aria-label="Custom exec user" placeholder="UID or user" sx={{width: 115, '& .MuiInputBase-root': {height: 28, fontFamily: t.mono, fontSize: '0.68rem'}}}/>}
            <TextField select size="small" value={fontSize} onChange={event => changeFontSize(Number(event.target.value))}
                aria-label="Terminal font size" slotProps={{select: {native: true}}}
                sx={{width: 70, '& .MuiInputBase-root': {height: 28, fontSize: '0.68rem'}}}>
                {[10, 12, 14, 16].map(value => <option key={value} value={value}>{value}px</option>)}
            </TextField>
            <Button size="small" variant={connected ? 'outlined' : 'contained'} color={connected ? 'error' : 'primary'}
                disabled={!connected && (!shell || (userChoice === 'other' && !otherUser.trim()))}
                onClick={() => setConnected(value => !value)} sx={{minHeight: 27, py: 0, textTransform: 'none'}}>
                {connected ? 'Disconnect' : 'Connect'}
            </Button>
            <Tooltip title="Clear terminal"><span><IconButton size="small" disabled={!connected} onClick={() => xterm.current?.clear()}><DeleteSweep sx={{fontSize: 18}}/></IconButton></span></Tooltip>
            <Tooltip title={copiedId ? 'Copied!' : 'Copy selection or terminal'}><span><IconButton size="small" disabled={!connected} onClick={copyTerminal}>
                {copiedId ? <Check sx={{fontSize: 18, color: '#66bb6a'}}/> : <ContentCopy sx={{fontSize: 18}}/>}
            </IconButton></span></Tooltip>
            <Typography sx={{ml: 'auto !important', color: connected ? '#81c784' : t.textDim, fontSize: '0.66rem'}}>
                {connected ? 'Interactive session' : 'Disconnected'}
            </Typography>
        </Stack>
        {shellError && <Alert severity="error" sx={{borderRadius: 0, py: 0}}>{shellError}</Alert>}
        {shells?.length === 0 && !shellError && <Alert severity="warning" sx={{borderRadius: 0}}>Exec is unavailable: no supported shell was found in this container.</Alert>}
        <Box sx={{flex: 1, minHeight: 0, overflow: 'hidden'}}>
            {controlledTerminal ? <AppTerminal {...controlledTerminal} isActive={active} fit={fitAddon} fontSize={fontSize}/>
                : <Box sx={{height: '100%', display: 'grid', placeItems: 'center'}}><Typography sx={{color: t.textDim, fontSize: '0.75rem'}}>Choose a shell and connect.</Typography></Box>}
        </Box>
    </Paper>;
}

function Mounts({inspect}: {inspect: JsonObject}) {
    const mounts = asArray(inspect.Mounts).map(asObject);
    return <Section title="Bind mounts, volumes & tmpfs" fill><TableContainer sx={{flex: 1, minHeight: 0, overflow: 'auto', ...scrollbarStyles}}><Table size="small" stickyHeader sx={{'& .MuiTableCell-root': {py: 0.55, px: 0.8, fontSize: '0.7rem'}}}><TableHead><TableRow>
        {['Type', 'Name', 'Source', 'Destination', 'Driver', 'Mode', 'RW', 'Propagation'].map(v => <TableCell key={v}>{v}</TableCell>)}
    </TableRow></TableHead><TableBody>{mounts.map((m, i) => <TableRow key={i} hover>
        {[m.Type, m.Name, m.Source, m.Destination, m.Driver, m.Mode, m.RW, m.Propagation].map((v, j) => <TableCell key={j} sx={{fontFamily: t.mono, overflowWrap: 'anywhere'}}>{text(v)}</TableCell>)}
    </TableRow>)}</TableBody></Table></TableContainer>{mounts.length === 0 && <Typography color="text.secondary">None</Typography>}</Section>;
}

function Security({inspect}: {inspect: JsonObject}) {
    const config = asObject(inspect.Config); const host = asObject(inspect.HostConfig);
    return <Stack spacing={1.25}><Section title="Isolation"><Details rows={[
        ['Privileged', host.Privileged], ['Read-only root filesystem', host.ReadonlyRootfs], ['User', config.User || 'root (default)'],
        ['PID namespace', host.PidMode], ['IPC namespace', host.IpcMode], ['UTS namespace', host.UTSMode],
        ['User namespace', host.UsernsMode], ['Cgroup namespace', host.CgroupnsMode], ['Runtime', host.Runtime],
        ['AppArmor profile', inspect.AppArmorProfile], ['Process label', inspect.ProcessLabel], ['Mount label', inspect.MountLabel],
        ['No-new-privileges', list(host.SecurityOpt).some(v => v.includes('no-new-privileges'))],
    ]}/></Section>
        <Section title="Security options"><StringChips values={list(host.SecurityOpt)}/></Section>
        <Box sx={{display: 'grid', gridTemplateColumns: {xs: '1fr', md: '1fr 1fr'}, gap: 1.25}}>
            <Section title="Capabilities added"><StringChips values={list(host.CapAdd)}/></Section>
            <Section title="Capabilities dropped"><StringChips values={list(host.CapDrop)}/></Section>
        </Box>
        <Section title="Filesystem confinement"><Details rows={[
            ['Masked paths', list(host.MaskedPaths).join(', ')], ['Read-only paths', list(host.ReadonlyPaths).join(', ')],
            ['Devices', host.Devices], ['Device cgroup rules', list(host.DeviceCgroupRules).join(', ')], ['Sysctls', host.Sysctls],
        ]}/></Section>
    </Stack>;
}

function Resources({inspect}: {inspect: JsonObject}) {
    const h = asObject(inspect.HostConfig); const nano = Number(h.NanoCpus ?? 0);
    return <Box sx={{display: 'grid', gridTemplateColumns: {xs: '1fr', xl: 'repeat(3, minmax(0, 1fr))'}, gap: 1.25}}><Section title="CPU"><Details rows={[
        ['Nano CPUs', nano > 0 ? `${nano / 1e9} CPU` : 'Unlimited / default'], ['CPU shares', h.CpuShares],
        ['CPU quota / period', `${text(h.CpuQuota)} / ${text(h.CpuPeriod)}`], ['CPU set', h.CpusetCpus], ['NUMA memory nodes', h.CpusetMems],
    ]}/></Section><Section title="Memory & OOM"><Details rows={[
        ['Memory limit', fmtLimit(h.Memory)], ['Reservation', fmtLimit(h.MemoryReservation)], ['Memory + swap', fmtLimit(h.MemorySwap)],
        ['Swappiness', h.MemorySwappiness], ['OOM killer disabled', h.OomKillDisable], ['OOM score adjustment', h.OomScoreAdj],
        ['PIDs limit', Number(h.PidsLimit ?? 0) > 0 ? h.PidsLimit : 'Unlimited / default'],
    ]}/></Section><Section title="Cgroups & I/O"><Details rows={[
        ['Cgroup parent', h.CgroupParent], ['Cgroup', h.Cgroup], ['Cgroup namespace', h.CgroupnsMode],
        ['Block I/O weight', h.BlkioWeight], ['Shared memory', fmtLimit(h.ShmSize)], ['Ulimits', h.Ulimits],
    ]}/></Section></Box>;
}

function Health({inspect}: {inspect: JsonObject}) {
    const config = asObject(inspect.Config); const healthConfig = asObject(config.Healthcheck);
    const health = asObject(field(inspect.State, 'Health')); const logs = asArray(health.Log).map(asObject);
    return <Stack spacing={1.25}><Section title="Healthcheck configuration"><Details rows={[
        ['Command', list(healthConfig.Test).join(' ')], ['Interval', fmtDuration(healthConfig.Interval)],
        ['Timeout', fmtDuration(healthConfig.Timeout)], ['Start period', fmtDuration(healthConfig.StartPeriod)],
        ['Start interval', fmtDuration(healthConfig.StartInterval)], ['Retries', healthConfig.Retries],
        ['Status', health.Status], ['Failing streak', health.FailingStreak],
    ]}/></Section><Section title="Healthcheck log"><Stack spacing={1}>{logs.map((log, i) => <Paper key={i} variant="outlined" sx={{p: 1.25}}>
        <Details rows={[[`Run ${i + 1}`, `${fmtDate(log.Start)} → ${fmtDate(log.End)}`], ['Exit code', log.ExitCode], ['Output', log.Output]]}/>
    </Paper>)}{logs.length === 0 && <Typography color="text.secondary">No healthcheck log</Typography>}</Stack></Section></Stack>;
}

function highlightJsonLine(line: string): ReactNode[] {
    const tokens: ReactNode[] = [];
    const pattern = /("(?:\\.|[^"\\])*")(\s*:)?|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|\b(true|false|null)\b/g;
    let cursor = 0;
    let key = 0;
    for (const match of line.matchAll(pattern)) {
        const start = match.index ?? 0;
        if (start > cursor) tokens.push(line.slice(cursor, start));
        if (match[1]) {
            tokens.push(<span key={key++} style={{color: match[2] ? '#7dd3fc' : '#a5d6a7'}}>{match[1]}</span>);
            if (match[2]) tokens.push(<span key={key++} style={{color: '#94a3b8'}}>{match[2]}</span>);
        } else if (match[3]) {
            tokens.push(<span key={key++} style={{color: '#fbbf24'}}>{match[3]}</span>);
        } else {
            tokens.push(<span key={key++} style={{color: match[4] === 'null' ? '#f87171' : '#c4b5fd'}}>{match[4]}</span>);
        }
        cursor = start + match[0].length;
    }
    if (cursor < line.length) tokens.push(line.slice(cursor));
    return tokens;
}

function JsonInspect({raw}: {raw: string}) {
    const {handleCopy, copiedId} = useCopyButton();
    const formatted = useMemo(() => {
        try { return JSON.stringify(JSON.parse(raw), null, 2); } catch { return raw; }
    }, [raw]);
    const lines = useMemo(() => formatted.split('\n'), [formatted]);
    return <Paper variant="outlined" sx={{height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', bgcolor: '#09090b', borderColor: t.border}}>
        <Stack direction="row" spacing={1} sx={{px: 1.25, py: 0.7, alignItems: 'center', flexShrink: 0, borderBottom: `1px solid ${t.border}`, bgcolor: '#111318'}}>
            <Code sx={{fontSize: 17, color: '#7dd3fc'}}/><Typography sx={{fontSize: '0.75rem', fontWeight: 800}}>Docker inspect</Typography>
            <Chip label="JSON" size="small" sx={{height: 20, fontFamily: t.mono, fontSize: '0.62rem'}}/>
            <Typography sx={{ml: 'auto !important', color: t.textDim, fontSize: '0.66rem'}}>{lines.length} lines</Typography>
            <Button size="small" onClick={() => handleCopy(formatted)}
                startIcon={copiedId === formatted ? <Check sx={{fontSize: 15}}/> : <ContentCopy sx={{fontSize: 15}}/>}
                color={copiedId === formatted ? 'success' : 'inherit'} sx={{minHeight: 26, py: 0, fontSize: '0.68rem', textTransform: 'none'}}>
                {copiedId === formatted ? 'Copied' : 'Copy'}
            </Button>
        </Stack>
        <Box sx={{flex: 1, minHeight: 0, overflow: 'auto', py: 0.65, fontFamily: t.mono, fontSize: '0.72rem', lineHeight: 1.55,
            color: '#cbd5e1', userSelect: 'text', WebkitUserSelect: 'text', cursor: 'text', ...scrollbarStyles}}>
            {lines.map((line, index) => <Box key={index} sx={{display: 'grid', gridTemplateColumns: '48px minmax(max-content, 1fr)', minHeight: '1.55em',
                '&:hover': {bgcolor: 'rgba(255,255,255,0.035)'}}}>
                <Box component="span" sx={{pr: 1.2, textAlign: 'right', color: '#4b5563', borderRight: '1px solid rgba(255,255,255,0.08)',
                    userSelect: 'none', WebkitUserSelect: 'none'}}>{index + 1}</Box>
                <Box component="code" sx={{pl: 1.25, pr: 2, whiteSpace: 'pre', font: 'inherit', color: 'inherit'}}>{highlightJsonLine(line)}</Box>
            </Box>)}
        </Box>
    </Paper>;
}

export default function ContainerDetailsDialog({open, row, containers, history, busy, stackBusy, updateRun, onClose, onAction}: Props) {
    const client = useHostClient(DockerService); const [tab, setTab] = useState<TabID>('overview');
    const [raw, setRaw] = useState(''); const [inspect, setInspect] = useState<JsonObject>({});
    const [loading, setLoading] = useState(false); const [error, setError] = useState(''); const [processCount, setProcessCount] = useState<number | null>(null);
    const [removeAnchor, setRemoveAnchor] = useState<HTMLElement | null>(null);
    const containerID = row?.info.id ?? '';
    const containerState = row?.info.state ?? '';
    const load = useCallback(async () => {
        if (!containerID) return; setLoading(true); const {val, err} = await callRPC(() => client.containerInspect({containerID})); setLoading(false);
        if (err || !val) {setError(err || 'Empty inspect response'); return;} setError(''); setRaw(val.rawJson);
        try {setInspect(asObject(JSON.parse(val.rawJson)));} catch {setError('The daemon returned invalid inspect JSON');}
        if (['running', 'restarting', 'paused'].includes(containerState)) {
            const top = await callRPC(() => client.containerTop({containerId: containerID}));
            setProcessCount(top.err ? null : top.val?.top?.proc.length ?? 0);
        } else {
            setProcessCount(0);
        }
    }, [client, containerID, containerState]);
    useEffect(() => { if (open) {setTab('overview'); setProcessCount(null); void load();} }, [open, load]);
    useEffect(() => { if (open && !row) onClose(); }, [open, row, onClose]);
    if (!row) return null;
    const state = row.info.state; const active = ['running', 'restarting', 'paused'].includes(state); const paused = state === 'paused';
    const processAvailable = state === 'running' || state === 'paused';
    const locked = !!busy || stackBusy;
    const fixedContent = ['logs', 'exec', 'processes', 'mounts', 'environment', 'labels', 'files'].includes(tab);
    return <Dialog open={open} onClose={onClose} maxWidth={false} fullWidth
        slotProps={{
            backdrop: {sx: {bgcolor: 'rgba(0,0,0,0.68)', backdropFilter: 'blur(4px)'}},
            paper: {sx: {
                width: 'min(88vw, 1320px)', height: 'min(86vh, 860px)', maxWidth: 'none', maxHeight: 'none', m: 2,
                bgcolor: '#17191c', border: `1px solid ${t.border}`, borderRadius: 2.5, overflow: 'hidden',
                boxShadow: '0 28px 90px rgba(0,0,0,0.65)', userSelect: 'text', WebkitUserSelect: 'text',
                '& .MuiTypography-root, & .MuiTableCell-root, & .MuiChip-label, & pre': {userSelect: 'text', WebkitUserSelect: 'text'},
            }},
        }}>
        <Box sx={{display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0}}>
        <Box sx={{flexShrink: 0, bgcolor: t.header, borderBottom: `1px solid ${t.border}`}}>
            <Stack direction="row" sx={{px: 1.75, py: 1, alignItems: 'center', justifyContent: 'space-between', gap: 1.5}}>
                <Box sx={{minWidth: 0}}><Typography variant="h6" noWrap sx={{fontWeight: 900}}>{row.info.name}</Typography>
                    <Typography noWrap sx={{fontFamily: t.mono, color: t.textDim, fontSize: '0.68rem', userSelect: 'text', cursor: 'text'}}>{row.info.id}</Typography></Box>
                <Stack direction="row" spacing={0.5} sx={{alignItems: 'center'}}>
                    <Tooltip title={active ? 'Stop' : 'Start'}><span><IconButton disabled={locked} onClick={() => onAction(row, active ? 'stop' : 'start')}>
                        {busy === 'start' || busy === 'stop' ? <CircularProgress size={18}/> : active ? <Stop/> : <PlayArrow/>}</IconButton></span></Tooltip>
                    <Tooltip title="Restart"><span><IconButton disabled={locked} onClick={() => onAction(row, 'restart')}>{busy === 'restart' ? <CircularProgress size={18}/> : <RestartAlt/>}</IconButton></span></Tooltip>
                    <Tooltip title={paused ? 'Unpause' : 'Pause'}><span><IconButton disabled={locked || (!active && !paused)}
                        onClick={() => onAction(row, paused ? 'unpause' : 'pause')}
                        sx={{color: paused ? '#66bb6a' : '#ffb74d'}}>{paused ? <PlayCircleOutlined/> : <Pause/>}</IconButton></span></Tooltip>
                    <Tooltip title="Update"><span><IconButton disabled={locked || updateRun === 'running'} onClick={() => onAction(row, 'update')}><Update/></IconButton></span></Tooltip>
                    <Tooltip title="Remove"><span><IconButton color="error" disabled={locked} onClick={event => setRemoveAnchor(event.currentTarget)}><Delete/></IconButton></span></Tooltip>
                    <Tooltip title="Refresh details"><span><IconButton disabled={loading} onClick={load}>{loading ? <CircularProgress size={18}/> : <Refresh/>}</IconButton></span></Tooltip>
                    <Button size="small" variant={tab === 'inspect' ? 'contained' : 'outlined'} startIcon={<InfoOutlined/>}
                        onClick={() => setTab('inspect')} sx={{display: {xs: 'none', md: 'inline-flex'}}}>Inspect</Button>
                    <Divider orientation="vertical" flexItem/><Tooltip title="Close"><IconButton onClick={onClose}><Close/></IconButton></Tooltip>
                </Stack>
            </Stack>
            {stackBusy && <Alert severity="info" sx={{borderRadius: 0, py: 0}}>Container actions are locked while its stack action is running.</Alert>}
        </Box>
        <Box sx={{display: 'flex', flex: 1, minHeight: 0}}>
            <Box component="nav" aria-label="Container details" sx={{width: 184, flexShrink: 0, overflowY: 'auto', borderRight: `1px solid ${t.border}`, bgcolor: '#1b1d20', ...scrollbarStyles}}>
                <Tabs orientation="vertical" value={tab} onChange={(_, value: TabID) => setTab(value)}
                    variant="scrollable" sx={{py: 0.8, minHeight: '100%', '& .MuiTabs-indicator': {left: 0, right: 'auto', width: 3}}}>
                    {tabs.map(v => <Tab key={v.id} value={v.id} label={v.label} icon={v.icon} iconPosition="start"
                        sx={{minHeight: 42, justifyContent: 'flex-start', alignItems: 'center', textTransform: 'none', fontWeight: 650,
                            fontSize: '0.78rem', px: 1.5, gap: 1, '& svg': {fontSize: 18}}}/>) }
                </Tabs>
            </Box>
            <Box sx={{flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden'}}>
                {error && <Alert severity="error" sx={{m: 1, mb: 0, flexShrink: 0}}>{error}</Alert>}
                <Box sx={{flex: 1, minHeight: 0, overflow: fixedContent ? 'hidden' : 'auto', p: tab === 'logs' || tab === 'exec' || tab === 'files' ? 0 : 1.4,
                    userSelect: 'text', cursor: tab === 'logs' || tab === 'exec' ? 'default' : 'text', ...scrollbarStyles}}>
                {loading && !raw ? <Box sx={{display: 'grid', placeItems: 'center', height: '100%'}}><CircularProgress/></Box> : <>
                    <Box hidden={tab !== 'overview'}><Overview row={row} inspect={inspect} history={history} processCount={processCount} onUpdate={() => onAction(row, 'update')} updateRun={updateRun}/></Box>
                    <Box hidden={tab !== 'logs'} sx={{height: '100%', minHeight: 0, overflow: 'hidden'}}><LogsViewer containers={[{id: row.info.id, name: row.info.name}]} isActive={tab === 'logs'}/></Box>
                    <Box hidden={tab !== 'exec'} sx={{height: '100%', minHeight: 0, overflow: 'hidden'}}><ExecTerminal active={tab === 'exec'} containerID={row.info.id} running={state === 'running'}/></Box>
                    <Box hidden={tab !== 'processes'} sx={{height: '100%', minHeight: 0}}>{processAvailable
                        ? <Processes active={tab === 'processes'} containerID={row.info.id} onCount={setProcessCount}/>
                        : <Alert severity="info">Start the container to inspect its running processes.</Alert>}</Box>
                    <Box hidden={tab !== 'networks'}><Networks containerID={row.info.id} containers={containers} inspect={inspect} onChanged={load}/></Box>
                    <Box hidden={tab !== 'mounts'} sx={{height: '100%', minHeight: 0}}><Mounts inspect={inspect}/></Box>
                    <Box hidden={tab !== 'environment'} sx={{height: '100%', minHeight: 0}}><Section title="Environment variables" fill><KeyValueTable value={field(inspect.Config, 'Env')} maskSecrets scrollable/></Section></Box>
                    <Box hidden={tab !== 'labels'} sx={{height: '100%', minHeight: 0}}><Section title="Labels" fill><KeyValueTable value={field(inspect.Config, 'Labels')} scrollable/></Section></Box>
                    <Box hidden={tab !== 'files'} sx={{height: '100%', minHeight: 0}}><ContainerFileBrowser kind="container" target={row.info.id} active={tab === 'files'}/></Box>
                    <Box hidden={tab !== 'security'}><Security inspect={inspect}/></Box>
                    <Box hidden={tab !== 'resources'}><Resources inspect={inspect}/></Box>
                    <Box hidden={tab !== 'health'}><Health inspect={inspect}/></Box>
                    <Box hidden={tab !== 'inspect'} sx={{height: '100%'}}><JsonInspect raw={raw}/></Box>
                </>}
                </Box>
            </Box>
        </Box>
        </Box>
        <Popover open={removeAnchor !== null} anchorEl={removeAnchor} onClose={() => setRemoveAnchor(null)}
            anchorOrigin={{vertical: 'top', horizontal: 'center'}} transformOrigin={{vertical: 'bottom', horizontal: 'center'}}
            slotProps={{paper: {sx: {bgcolor: t.header, border: `1px solid ${t.border}`, borderRadius: 1.5, px: 1.25, py: 1, maxWidth: 260}}}}>
            <Typography sx={{fontSize: '0.78rem', color: t.text, mb: 0.75}}>Remove <b>{row.info.name}</b>?</Typography>
            <Stack direction="row" spacing={0.75} sx={{justifyContent: 'flex-end'}}>
                <Button size="small" onClick={() => setRemoveAnchor(null)} sx={{textTransform: 'none', color: t.textDim, minWidth: 0}}>Cancel</Button>
                <Button size="small" variant="contained" color="error" onClick={() => {setRemoveAnchor(null); onAction(row, 'remove');}}
                    sx={{textTransform: 'none', fontWeight: 700}}>Remove</Button>
            </Stack>
        </Popover>
    </Dialog>;
}
