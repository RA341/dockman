import {
    Box,
    Button,
    Checkbox,
    CircularProgress,
    IconButton,
    Link,
    ListItemIcon,
    ListItemText,
    Menu,
    MenuItem,
    InputBase,
    Popover,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    TableSortLabel,
    Tooltip,
    Typography,
} from '@mui/material';
import {
    ArrowDownward,
    ArrowUpward,
    Build,
    CloudDownload,
    Delete,
    EditNote,
    ExpandLess,
    ExpandMore,
    InfoOutlined,
    Pause,
    PlayArrow,
    PlayCircleOutlined,
    ReceiptLong,
    RestartAlt,
    RocketLaunch,
    Search,
    Stop,
    Subject,
    Terminal,
    Update,
    Upgrade,
    WarningAmber,
} from '@mui/icons-material';
import {Fragment, type MouseEvent, type ReactNode, type Ref, useState} from 'react';
import type {ContainerList, ContainerStats} from '../../gen/docker/v1/docker_pb.ts';
import {statsTheme as t} from '../compose/components/stats-theme.ts';
import Sparkline from '../../components/sparkline.tsx';
import {formatBytes, getUsageColor} from '../../lib/editor.ts';
import {ContainerInfoPort} from '../compose/components/container-info-port.tsx';

export interface MonitorRow {
    info: ContainerList;
    stats?: ContainerStats;
}

// per-stack aggregation of the member containers' live metrics
export interface StackStats {
    cpu: number;
    memUsed: number;
    memLimit: number;
    netRx: number;
    netTx: number;
    cpuHist: number[];
    memHist: number[];
}

// sortable columns; stacks sort by their aggregate (or name) and their
// member containers sub-sort by the same field
export type MonitorSortField = 'name' | 'uptime' | 'cpu' | 'mem' | 'net';

export interface StackGroup {
    // display name; empty for containers outside any compose stack
    stack: string;
    // compose file in dockman's namespace, empty when unknown — stack-level
    // actions and the editor shortcut need it
    servicePath: string;
    rows: MonitorRow[];
    // null until at least one member delivered real stats
    stats: StackStats | null;
}

export type RowAction = 'start' | 'stop' | 'restart' | 'pause' | 'unpause' | 'update' | 'remove';
export type StackAction = 'up' | 'down' | 'start' | 'stop' | 'restart';

export interface RedeployOptions {
    pull: boolean;
    build: boolean;
    recreate: boolean;
}

interface MonitorTableProps {
    groups: StackGroup[];
    flatRows: MonitorRow[];
    containerListMode: boolean;
    containerRowsCharts: boolean;
    history: Map<string, { cpu: number[]; mem: number[] }>;
    // stack and container selections are mutually exclusive: picking one
    // kind clears the other, and the toolbar actions adapt to the kind
    selectedContainers: string[];
    selectedStacks: string[];
    onToggleContainers: (ids: string[], on: boolean) => void;
    onToggleStack: (stack: string, on: boolean) => void;
    onToggleAllStacks: (stacks: string[], on: boolean) => void;
    onToggleAllContainers: (ids: string[], on: boolean) => void;
    expanded: Record<string, boolean>;
    onToggleExpand: (stack: string) => void;
    sortField: MonitorSortField | null;
    sortOrder: 'asc' | 'desc';
    onSortChange: (field: MonitorSortField) => void;
    nameSearch: string;
    onNameSearchChange: (value: string) => void;
    nameSearchInputRef: Ref<HTMLInputElement>;
    // scroll position persistence across navigations
    scrollRef: Ref<HTMLDivElement>;
    onScroll: (top: number) => void;
    // explicit clock so the memoized rows re-render on tick
    now: number;
    // dockman.yml monitor.stackRows: compact stack rows drop the charts
    stackRowsCompact: boolean;
    runningStacks: Record<string, boolean>;
    // last action outcome per compose file — drives the output button
    stackRuns: Record<string, 'running' | 'failed' | 'done'>;
    onStackOutput: (group: StackGroup) => void;
    // per-container update runs (keyed by name): busy indicator + output
    updateRuns: Record<string, 'running' | 'failed' | 'done'>;
    onUpdateOutput: (row: MonitorRow) => void;
    onRowAction: (row: MonitorRow, action: RowAction) => void;
    // container id → lifecycle action in flight: locks the row's buttons
    // and spins the one that launched the action
    rowBusy: Record<string, RowAction>;
    onRowLogs: (row: MonitorRow) => void;
    onRowExec: (row: MonitorRow, anchor: HTMLElement) => void;
    onRowDetails: (row: MonitorRow) => void;
    onStackAction: (group: StackGroup, action: StackAction) => void;
    onStackRedeploy: (group: StackGroup, opts: RedeployOptions) => void;
    onStackLogs: (group: StackGroup) => void;
    onStackEdit: (group: StackGroup) => void;
}

const headCell = {
    bgcolor: t.header,
    color: t.textDim,
    borderColor: t.border,
    fontWeight: 700,
    fontSize: '0.68rem',
    letterSpacing: '0.08em',
    whiteSpace: 'nowrap' as const,
    py: 0.75,
};

const bodyCell = {
    borderColor: t.border,
    color: t.text,
    py: 0.5,
};

const disabledIcon = {color: 'rgba(255,255,255,0.15)'};

// per-state icon + color, shared by the state column
const stateVisual: Record<string, { icon: ReactNode, color: string }> = {
    running: {icon: <PlayArrow/>, color: '#66bb6a'},
    restarting: {icon: <RestartAlt/>, color: '#4db6ac'},
    paused: {icon: <Pause/>, color: '#ffb74d'},
    exited: {icon: <Stop/>, color: '#9e9e9e'},
    created: {icon: <Stop/>, color: '#64748b'},
    dead: {icon: <WarningAmber/>, color: '#ef5350'},
    removing: {icon: <Delete/>, color: '#ef5350'},
};

function containerStatusColor(row: MonitorRow): string {
    const {state, health} = row.info;
    if ((state === 'running' && health === 'unhealthy') || state === 'dead' || state === 'removing') {
        return '#ef5350';
    }
    if (state === 'running' && health === 'starting') return '#4db6ac';
    return stateVisual[state]?.color ?? '#9e9e9e';
}

// A stack has no daemon state of its own, so derive a useful operational
// state from all members. Failures win, followed by transitions, degraded
// partial operation, healthy operation and finally fully stopped.
function stackStatusColor(rows: MonitorRow[]): string {
    if (rows.some(row => containerStatusColor(row) === '#ef5350')) return '#ef5350';
    if (rows.some(row => row.info.state === 'restarting'
        || (row.info.state === 'running' && row.info.health === 'starting'))) return '#4db6ac';
    const running = rows.filter(row => row.info.state === 'running').length;
    const paused = rows.filter(row => row.info.state === 'paused').length;
    if (running === rows.length && rows.length > 0) return '#66bb6a';
    if (running > 0 || paused > 0) return '#ffb74d';
    return '#9e9e9e';
}

function subduedColor(color: string): string {
    return /^#[0-9a-f]{6}$/i.test(color) ? `${color}66` : color;
}

export function MonitorTable(props: MonitorTableProps) {
    const {
        groups, selectedStacks, selectedContainers, onToggleAllStacks,
        sortField, sortOrder, onSortChange, nameSearch,
        onNameSearchChange, nameSearchInputRef, scrollRef, onScroll,
    } = props;

    const sortLabelSx = {
        color: `${t.textDim} !important`,
        '&.Mui-active': {color: `${t.text} !important`},
        '& .MuiTableSortLabel-icon': {color: `${t.textDim} !important`},
    };

    const sortableHead = (field: MonitorSortField, label: string) => (
        <TableSortLabel
            active={sortField === field}
            direction={sortField === field ? sortOrder : (field === 'name' ? 'asc' : 'desc')}
            onClick={() => onSortChange(field)}
            sx={sortLabelSx}
        >
            {label}
        </TableSortLabel>
    );

    // header checkbox drives stack selection (containers are picked row by
    // row); standalone containers have no stack to select
    const selectableStacks = groups.filter(g => g.stack && g.servicePath).map(g => g.stack);
    const allStacksSelected = selectableStacks.length > 0 && selectableStacks.every(s => selectedStacks.includes(s));
    const someStacksSelected = selectableStacks.some(s => selectedStacks.includes(s));
    const visibleContainerIDs = props.flatRows.map(row => row.info.id);
    const allContainersSelected = visibleContainerIDs.length > 0
        && visibleContainerIDs.every(id => selectedContainers.includes(id));
    const someContainersSelected = visibleContainerIDs.some(id => selectedContainers.includes(id));

    return (
        <TableContainer
            ref={scrollRef}
            onScroll={e => onScroll((e.target as HTMLDivElement).scrollTop)}
            sx={{height: '100%', bgcolor: t.panel}}
        >
            <Table size="small" stickyHeader>
                <TableHead>
                    <TableRow>
                        <TableCell padding="checkbox" sx={{...headCell, width: 40, minWidth: 40, maxWidth: 40, px: 0.5}}>
                            <Tooltip title={props.containerListMode ? 'Select all visible containers' : 'Select all stacks'} arrow>
                                <span>
                                    <Checkbox
                                        size="small"
                                        checked={props.containerListMode ? allContainersSelected : allStacksSelected}
                                        indeterminate={props.containerListMode
                                            ? someContainersSelected && !allContainersSelected
                                            : someStacksSelected && !allStacksSelected}
                                        disabled={!props.containerListMode && selectedContainers.length > 0}
                                        onChange={e => props.containerListMode
                                            ? props.onToggleAllContainers(visibleContainerIDs, e.target.checked)
                                            : onToggleAllStacks(selectableStacks, e.target.checked)}
                                        sx={{color: t.textDim, p: 0.5}}
                                    />
                                </span>
                            </Tooltip>
                        </TableCell>
                        <TableCell aria-label="Container details" sx={{...headCell, width: 32, minWidth: 32, maxWidth: 32, p: 0}}/>
                        <TableCell sx={{...headCell, minWidth: 245}}>
                            <Stack direction="row" spacing={1} sx={{alignItems: 'center'}}>
                                {sortableHead('name', 'NAME')}
                                <Box sx={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    width: 132,
                                    height: 25,
                                    px: 0.65,
                                    border: `1px solid ${nameSearch ? t.cpuLine : t.border}`,
                                    borderRadius: 1,
                                    bgcolor: 'rgba(255,255,255,0.035)',
                                    transition: 'border-color 120ms ease',
                                    '&:focus-within': {borderColor: t.cpuLine},
                                }}>
                                    <Search sx={{fontSize: 15, mr: 0.5, color: nameSearch ? t.cpuLine : t.textDim}}/>
                                    <InputBase
                                        inputRef={nameSearchInputRef}
                                        value={nameSearch}
                                        onChange={event => onNameSearchChange(event.target.value)}
                                        placeholder="Filter name"
                                        inputProps={{'aria-label': 'Filter by container or stack name'}}
                                        sx={{
                                            minWidth: 0,
                                            flex: 1,
                                            color: t.text,
                                            fontSize: '0.72rem',
                                            '& input': {p: 0},
                                            '& input::placeholder': {color: t.textDim, opacity: 0.8},
                                        }}
                                    />
                                </Box>
                            </Stack>
                        </TableCell>
                        <TableCell sx={headCell}>STATE</TableCell>
                        <TableCell sx={headCell}>{sortableHead('uptime', 'UPTIME')}</TableCell>
                        <TableCell sx={{...headCell, minWidth: props.containerRowsCharts ? 130 : 80}}>{sortableHead('cpu', 'CPU')}</TableCell>
                        <TableCell sx={{...headCell, minWidth: props.containerRowsCharts ? 150 : 110}}>{sortableHead('mem', 'MEMORY')}</TableCell>
                        <TableCell sx={headCell}>{sortableHead('net', 'NET I/O')}</TableCell>
                        <TableCell sx={headCell}>PORTS</TableCell>
                        <TableCell sx={{...headCell, width: 210}} align="right">ACTIONS</TableCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {props.containerListMode
                        ? props.flatRows.map(row => (
                            <ContainerRow {...props} key={row.info.id} row={row}
                                          boundaryColor={containerStatusColor(row)}/>
                        ))
                        : groups.map(group => {
                            const boundaryColor = stackStatusColor(group.rows);
                            return (
                                <Fragment key={group.stack || '(standalone)'}>
                                    <StackRow {...props} group={group} boundaryColor={boundaryColor}/>
                                    {(props.expanded[group.stack] ?? false) && group.rows.map(row => (
                                        <ContainerRow {...props} key={row.info.id} row={row}
                                                      boundaryColor={subduedColor(boundaryColor)}/>
                                    ))}
                                </Fragment>
                            );
                        })}
                </TableBody>
            </Table>
        </TableContainer>
    );
}

function StackRow(props: MonitorTableProps & { group: StackGroup, boundaryColor: string }) {
    const {
        group, expanded, onToggleExpand, selectedStacks, selectedContainers,
        onToggleStack, onToggleContainers, runningStacks, stackRuns,
        onStackAction, onStackRedeploy, onStackLogs, onStackEdit, onStackOutput,
    } = props;

    const isExpanded = expanded[group.stack] ?? false;
    const isStack = group.stack !== '';
    const hasFile = group.servicePath !== '';
    const busy = runningStacks[group.servicePath] ?? false;
    const running = group.rows.filter(r => r.info.state === 'running').length;
    // paused/restarting containers still count as an "active" stack: down is
    // the meaningful direction, up only once everything is stopped
    const active = group.rows.some(r => ['running', 'restarting', 'paused'].includes(r.info.state));

    const ids = group.rows.map(r => r.info.id);
    // selecting a stack checks the stack AND (visually) all its containers;
    // the two selection kinds never mix, so the other kind's boxes disable
    const checked = isStack && hasFile
        ? selectedStacks.includes(group.stack)
        : ids.length > 0 && ids.every(id => selectedContainers.includes(id));
    const indeterminate = !(isStack && hasFile)
        && !checked && ids.some(id => selectedContainers.includes(id));
    const disabled = isStack && hasFile
        ? selectedContainers.length > 0
        : selectedStacks.length > 0;

    const s = group.stats;
    const memPercent = s && s.memLimit > 0 ? (s.memUsed / s.memLimit) * 100 : 0;
    const lastRun = hasFile ? stackRuns[group.servicePath] : undefined;

    return (
        // the whole row toggles expand/collapse; the checkbox and the action
        // cluster opt out via stopPropagation
        <TableRow onClick={() => onToggleExpand(group.stack)}
                  sx={{bgcolor: t.header, cursor: 'pointer'}}>
            <TableCell padding="checkbox" onClick={e => e.stopPropagation()}
                       sx={{...bodyCell, borderLeft: `3px solid ${props.boundaryColor}`, cursor: 'default', width: 40, minWidth: 40, maxWidth: 40, px: 0.5}}>
                <Tooltip title={isStack && hasFile ? "Select stack" : "Select containers"} arrow>
                    <span>
                        <Checkbox
                            size="small"
                            checked={checked}
                            indeterminate={indeterminate}
                            disabled={disabled}
                            onChange={e => isStack && hasFile
                                ? onToggleStack(group.stack, e.target.checked)
                                : onToggleContainers(ids, e.target.checked)}
                            sx={{color: t.textDim, p: 0.5}}
                        />
                    </span>
                </Tooltip>
            </TableCell>
            <TableCell sx={{...bodyCell, width: 32, minWidth: 32, maxWidth: 32, p: 0}}/>
            <TableCell colSpan={3} sx={{...bodyCell, py: 0.25}}>
                <Stack
                    direction="row"
                    spacing={0.75}
                    sx={{
                        alignItems: "center",
                        userSelect: 'none'
                    }}>
                    <IconButton size="small" sx={{color: t.textDim, p: 0.25}}>
                        {isExpanded ? <ExpandLess sx={{fontSize: 17}}/> : <ExpandMore sx={{fontSize: 17}}/>}
                    </IconButton>
                    <Typography sx={{fontWeight: 700, fontSize: '0.85rem', color: t.text}}>
                        {group.stack || '#standalone'}
                    </Typography>
                    <Typography sx={{color: t.textDim, fontFamily: t.mono, fontSize: '0.72rem'}}>
                        {running}/{group.rows.length} running
                    </Typography>
                    {busy && <CircularProgress size={12} sx={{color: t.textDim}}/>}
                </Stack>
            </TableCell>
            <MetricCell
                text={s ? `${s.cpu.toFixed(1)}%` : '…'}
                textColor={s ? getUsageColor(s.cpu) : t.textDim}
                data={s?.cpuHist}
                lineColor={t.cpuLine}
                chart={!props.stackRowsCompact}
            />
            <MetricCell
                text={s ? formatBytes(s.memUsed) : '…'}
                subText={s && s.memLimit > 0 ? `/ ${formatBytes(s.memLimit)}` : ''}
                textColor={s ? getUsageColor(memPercent) : t.textDim}
                data={s?.memHist}
                lineColor={t.memLine}
                chart={!props.stackRowsCompact}
            />
            <TableCell colSpan={2} sx={bodyCell}/>
            <TableCell align="right" onClick={e => e.stopPropagation()}
                       sx={{...bodyCell, py: 0.25, whiteSpace: 'nowrap', cursor: 'default'}}>
                {hasFile && (
                    <>
                        <StackActionButton
                            title={active ? 'Stack down (remove containers)' : 'Stack up'}
                            disabled={busy}
                            onClick={() => onStackAction(group, active ? 'down' : 'up')}
                            icon={active ? <ArrowDownward sx={{fontSize: 15}}/> : <ArrowUpward sx={{fontSize: 15}}/>}
                        />
                        <StackActionButton
                            title={running > 0 ? 'Stack stop' : 'Stack start'}
                            disabled={busy}
                            onClick={() => onStackAction(group, running > 0 ? 'stop' : 'start')}
                            icon={running > 0 ? <Stop sx={{fontSize: 15}}/> : <PlayArrow sx={{fontSize: 15}}/>}
                        />
                        <StackActionButton
                            title="Stack restart"
                            disabled={busy}
                            onClick={() => onStackAction(group, 'restart')}
                            icon={<RestartAlt sx={{fontSize: 15}}/>}
                        />
                        <RedeployMenuButton disabled={busy} onPick={opts => onStackRedeploy(group, opts)}/>
                        {lastRun && (
                            <Tooltip title={lastRun === 'failed' ? 'Last action output (failed)' : 'Last action output'} arrow>
                                <IconButton size="small" onClick={() => onStackOutput(group)}
                                            sx={{
                                                color: lastRun === 'failed' ? '#ef5350' : t.textDim,
                                                '&:hover': {color: lastRun === 'failed' ? '#ef5350' : t.text},
                                            }}>
                                    <ReceiptLong sx={{fontSize: 15}}/>
                                </IconButton>
                            </Tooltip>
                        )}
                    </>
                )}
                <StackActionButton
                    title={isStack ? "Stack logs" : "Logs"}
                    onClick={() => onStackLogs(group)}
                    icon={<Subject sx={{fontSize: 15}}/>}
                />
                {hasFile && (
                    <StackActionButton
                        title="Open compose file"
                        onClick={() => onStackEdit(group)}
                        icon={<EditNote sx={{fontSize: 16}}/>}
                    />
                )}
            </TableCell>
        </TableRow>
    );
}

function StackActionButton({title, icon, onClick, disabled}: {
    title: string,
    icon: ReactNode,
    onClick: () => void,
    disabled?: boolean,
}) {
    return (
        <Tooltip title={title} arrow>
            <span>
                <IconButton size="small" disabled={disabled} onClick={onClick}
                            sx={{color: t.textDim, '&:hover': {color: t.text}, '&.Mui-disabled': disabledIcon}}>
                    {icon}
                </IconButton>
            </span>
        </Tooltip>
    );
}

// redeploy = compose up -d with a forced option, picked from a small menu
function RedeployMenuButton({disabled, onPick}: {
    disabled?: boolean,
    onPick: (opts: RedeployOptions) => void,
}) {
    const [anchor, setAnchor] = useState<null | HTMLElement>(null);

    const pick = (opts: RedeployOptions) => {
        setAnchor(null);
        onPick(opts);
    };

    return (
        <>
            <Tooltip title="Redeploy…" arrow>
                <span>
                    <IconButton size="small" disabled={disabled}
                                onClick={(e: MouseEvent<HTMLElement>) => setAnchor(e.currentTarget)}
                                sx={{color: t.textDim, '&:hover': {color: t.text}, '&.Mui-disabled': disabledIcon}}>
                        <RocketLaunch sx={{fontSize: 15}}/>
                    </IconButton>
                </span>
            </Tooltip>
            <Menu anchorEl={anchor} open={anchor !== null} onClose={() => setAnchor(null)}>
                <MenuItem onClick={() => pick({pull: true, build: false, recreate: false})}>
                    <ListItemIcon><CloudDownload sx={{fontSize: 17}}/></ListItemIcon>
                    <ListItemText primary="Pull images (force)" secondary="up -d --pull always"/>
                </MenuItem>
                <MenuItem onClick={() => pick({pull: false, build: true, recreate: false})}>
                    <ListItemIcon><Build sx={{fontSize: 17}}/></ListItemIcon>
                    <ListItemText primary="Build images (force)" secondary="up -d --build"/>
                </MenuItem>
                <MenuItem onClick={() => pick({pull: false, build: false, recreate: true})}>
                    <ListItemIcon><RestartAlt sx={{fontSize: 17}}/></ListItemIcon>
                    <ListItemText primary="Recreate (force)" secondary="up -d --force-recreate"/>
                </MenuItem>
            </Menu>
        </>
    );
}

function ContainerRow(props: MonitorTableProps & { row: MonitorRow, boundaryColor: string }) {
    const {
        row, history, selectedContainers, selectedStacks, onToggleContainers,
        now, onRowAction, rowBusy, onRowLogs, onRowExec, onRowDetails, updateRuns, onUpdateOutput,
    } = props;
    const c = row.info;
    const s = row.stats;
    const hist = s ? history.get(c.name) : undefined;
    const isRunning = c.state === 'running';
    const isPaused = c.state === 'paused';
    const isActive = ['running', 'restarting', 'paused'].includes(c.state);
    const busy = rowBusy[c.id];
    const stackBusy = c.servicePath !== '' && (props.runningStacks[c.servicePath] ?? false);
    // deleting is destructive: a small popover above the button asks first
    const [confirmEl, setConfirmEl] = useState<HTMLElement | null>(null);
    const spinner = <CircularProgress size={14} sx={{color: t.textDim}}/>;
    // a selected stack shows all its members checked; while stacks are
    // selected, individual container boxes are frozen (kinds never mix)
    const stackSelected = c.stackName !== '' && selectedStacks.includes(c.stackName);
    const isChecked = stackSelected || selectedContainers.includes(c.id);
    const updRun = updateRuns[c.name];

    const memPercent = s && Number(s.memoryLimit) > 0
        ? (Number(s.memoryUsage) / Number(s.memoryLimit)) * 100 : 0;

    const portsList = c.ports
        .filter(p => p.public > 0)
        .filter((p, i, arr) =>
            arr.findIndex(q => q.public === p.public && q.private === p.private && q.type === p.type) === i);
    // traefik-declared hostnames land in the address list next to plain ips;
    // anything with letters and a dot (and no ipv6 colon) reads as a domain.
    // several router rules can declare the same host (priorities): distinct.
    const domains = [...new Set(c.IPAddress.filter(a => /[a-z]/i.test(a) && a.includes('.') && !a.includes(':')))];

    return (
        <TableRow hover sx={{'&:hover': {bgcolor: t.rowHover}}}>
            <TableCell padding="checkbox" sx={{...bodyCell, borderLeft: `3px solid ${props.boundaryColor}`, width: 40, minWidth: 40, maxWidth: 40, px: 0.5}}>
                <Checkbox
                    size="small"
                    checked={isChecked}
                    disabled={selectedStacks.length > 0 || stackBusy}
                    onChange={e => onToggleContainers([c.id], e.target.checked)}
                    sx={{color: t.textDim, p: 0.5}}
                />
            </TableCell>
            <TableCell sx={{...bodyCell, width: 32, minWidth: 32, maxWidth: 32, p: 0}}>
                <Tooltip title="Details" arrow>
                    <IconButton size="small" onClick={() => onRowDetails(row)}
                                sx={{color: '#64b5f6', '&:hover': {color: '#90caf9'}}}>
                        <InfoOutlined sx={{fontSize: 17}}/>
                    </IconButton>
                </Tooltip>
            </TableCell>
            <TableCell sx={{...bodyCell, maxWidth: 240, pl: 0.75}}>
                <Stack direction="row" spacing={0.5} sx={{
                    alignItems: "center"
                }}>
                    <Typography noWrap sx={{fontWeight: 600, fontSize: '0.82rem'}}>
                        {c.name}
                    </Typography>
                    {props.containerListMode && c.stackName && (
                        <Typography noWrap sx={{color: t.textDim, fontSize: '0.65rem', fontFamily: t.mono}}>
                            {c.stackName}
                        </Typography>
                    )}
                    {c.updateAvailable && (
                        <Tooltip title={`Update available: ${c.updateAvailable}`} arrow>
                            <Upgrade sx={{fontSize: 14, color: '#4db6ac'}}/>
                        </Tooltip>
                    )}
                </Stack>
                <Typography noWrap sx={{color: t.textDim, fontSize: '0.7rem', fontFamily: t.mono}}>
                    {c.imageName}
                </Typography>
            </TableCell>
            <StateCell state={c.state} health={c.health}/>
            <TableCell sx={{...bodyCell, whiteSpace: 'nowrap', fontFamily: t.mono, fontSize: '0.75rem', color: t.textDim}}>
                {isRunning && s ? formatUptime(s.startedAt, now) : '–'}
            </TableCell>
            <MetricCell
                text={s ? `${s.cpuUsage.toFixed(1)}%` : '…'}
                textColor={s ? getUsageColor(s.cpuUsage) : t.textDim}
                data={hist?.cpu}
                lineColor={t.cpuLine}
                chart={props.containerRowsCharts}
            />
            <MetricCell
                text={s ? formatBytes(Number(s.memoryUsage)) : '…'}
                subText={s && Number(s.memoryLimit) > 0 ? `/ ${formatBytes(Number(s.memoryLimit))}` : ''}
                textColor={s ? getUsageColor(memPercent) : t.textDim}
                data={hist?.mem}
                lineColor={t.memLine}
                chart={props.containerRowsCharts}
            />
            <TableCell sx={{...bodyCell, whiteSpace: 'nowrap', fontFamily: t.mono, fontSize: '0.72rem', color: t.textDim}}>
                {s ? <>↓ {formatBytes(Number(s.networkRx))}<br/>↑ {formatBytes(Number(s.networkTx))}</> : '–'}
            </TableCell>
            <TableCell sx={{...bodyCell, maxWidth: 230}}>
                {portsList.length === 0 && domains.length === 0 ? (
                    <Typography sx={{fontFamily: t.mono, fontSize: '0.72rem', color: t.textDim}}>–</Typography>
                ) : (
                    // one entry per line, ports then hostnames
                    (<Stack spacing={0.4} sx={{
                        alignItems: "flex-start"
                    }}>
                        {portsList.map((p, i) => (
                            <Box key={`p${i}`} component="span"
                                 sx={{
                                     bgcolor: 'rgba(255,255,255,0.06)',
                                     px: 0.6, py: 0.1, borderRadius: 0.75,
                                     fontFamily: t.mono, fontSize: '0.7rem', whiteSpace: 'nowrap',
                                 }}>
                                <ContainerInfoPort port={p}/>
                            </Box>
                        ))}
                        {domains.map(d => (
                            <Box key={d} component="span"
                                 sx={{
                                     bgcolor: 'rgba(255,255,255,0.06)',
                                     px: 0.6, py: 0.1, borderRadius: 0.75,
                                     fontFamily: t.mono, fontSize: '0.7rem', whiteSpace: 'nowrap',
                                 }}>
                                <Tooltip title="Open in new tab" arrow>
                                    <Link href={`http://${d}`} target="_blank" rel="noopener noreferrer"
                                          sx={{
                                              color: 'info.main',
                                              textDecoration: 'none',
                                              '&:hover': {textDecoration: 'underline'},
                                          }}>
                                        {d}
                                    </Link>
                                </Tooltip>
                            </Box>
                        ))}
                    </Stack>)
                )}
            </TableCell>
            <TableCell align="right" sx={{...bodyCell, whiteSpace: 'nowrap'}}>
                <Tooltip title={isActive ? 'Stop' : 'Start'} arrow>
                    <span>
                        <IconButton size="small" disabled={!!busy || stackBusy}
                                    onClick={() => onRowAction(row, isActive ? 'stop' : 'start')}
                                    sx={{color: isActive ? '#ef5350' : '#66bb6a', '&.Mui-disabled': disabledIcon}}>
                            {busy === 'start' || busy === 'stop' ? spinner
                                : isActive ? <Stop sx={{fontSize: 16}}/> : <PlayArrow sx={{fontSize: 16}}/>}
                        </IconButton>
                    </span>
                </Tooltip>
                <Tooltip title="Restart" arrow>
                    <span>
                        <IconButton size="small" disabled={!!busy || stackBusy}
                                    onClick={() => onRowAction(row, 'restart')}
                                    sx={{color: '#4db6ac', '&.Mui-disabled': disabledIcon}}>
                            {busy === 'restart' ? spinner : <RestartAlt sx={{fontSize: 16}}/>}
                        </IconButton>
                    </span>
                </Tooltip>
                <Tooltip title={isPaused ? 'Unpause' : 'Pause'} arrow>
                    <span>
                        <IconButton size="small" disabled={(!isRunning && !isPaused) || !!busy || stackBusy}
                                    onClick={() => onRowAction(row, isPaused ? 'unpause' : 'pause')}
                                    sx={{color: isPaused ? '#66bb6a' : '#ffb74d', '&:hover': {color: t.text}, '&.Mui-disabled': disabledIcon}}>
                            {busy === 'pause' || busy === 'unpause' ? spinner
                                : isPaused ? <PlayCircleOutlined sx={{fontSize: 17}}/> : <Pause sx={{fontSize: 16}}/>}
                        </IconButton>
                    </span>
                </Tooltip>
                <Tooltip title={updRun === 'running'
                    ? 'Update in progress…'
                    : c.updateAvailable ? `Update image (${c.updateAvailable} available)` : 'Update image'} arrow>
                    <span>
                        <IconButton size="small" disabled={updRun === 'running' || !!busy || stackBusy}
                                    onClick={() => onRowAction(row, 'update')}
                                    sx={{color: c.updateAvailable ? '#4db6ac' : t.textDim, '&:hover': {color: t.text}, '&.Mui-disabled': disabledIcon}}>
                            {updRun === 'running' ? spinner : <Update sx={{fontSize: 16}}/>}
                        </IconButton>
                    </span>
                </Tooltip>
                {updRun && (
                    <Tooltip title={updRun === 'failed' ? 'Update output (failed)' : 'Update output'} arrow>
                        <IconButton size="small" onClick={() => onUpdateOutput(row)}
                                    sx={{
                                        color: updRun === 'failed' ? '#ef5350' : t.textDim,
                                        '&:hover': {color: updRun === 'failed' ? '#ef5350' : t.text},
                                    }}>
                            <ReceiptLong sx={{fontSize: 15}}/>
                        </IconButton>
                    </Tooltip>
                )}
                <Tooltip title="Remove" arrow>
                    <span>
                        <IconButton size="small" disabled={!!busy || stackBusy}
                                    onClick={e => setConfirmEl(e.currentTarget)}
                                    sx={{color: t.textDim, '&:hover': {color: '#ef5350'}, '&.Mui-disabled': disabledIcon}}>
                            {busy === 'remove' ? spinner : <Delete sx={{fontSize: 16}}/>}
                        </IconButton>
                    </span>
                </Tooltip>
                <Popover
                    open={confirmEl !== null}
                    anchorEl={confirmEl}
                    onClose={() => setConfirmEl(null)}
                    anchorOrigin={{vertical: 'top', horizontal: 'center'}}
                    transformOrigin={{vertical: 'bottom', horizontal: 'center'}}
                    slotProps={{
                        paper: {
                            sx: {
                                bgcolor: t.header,
                                border: `1px solid ${t.border}`,
                                borderRadius: 1.5,
                                px: 1.25, py: 1,
                                maxWidth: 260,
                            },
                        },
                    }}
                >
                    <Typography sx={{fontSize: '0.78rem', color: t.text, mb: 0.75}}>
                        Remove <b>{c.name}</b>?
                    </Typography>
                    <Stack direction="row" spacing={0.75} sx={{justifyContent: 'flex-end'}}>
                        <Button size="small" onClick={() => setConfirmEl(null)}
                                sx={{textTransform: 'none', color: t.textDim, minWidth: 0}}>
                            Cancel
                        </Button>
                        <Button size="small" variant="contained" color="error"
                                disabled={stackBusy}
                                onClick={() => {
                                    setConfirmEl(null);
                                    onRowAction(row, 'remove');
                                }}
                                sx={{textTransform: 'none', fontWeight: 700}}>
                            Remove
                        </Button>
                    </Stack>
                </Popover>
                <Tooltip title="Logs" arrow>
                    <IconButton size="small" onClick={() => onRowLogs(row)}
                                sx={{color: t.textDim, '&:hover': {color: t.text}}}>
                        <Subject sx={{fontSize: 16}}/>
                    </IconButton>
                </Tooltip>
                <Tooltip title="Exec" arrow>
                    <span>
                        <IconButton size="small" disabled={!isRunning}
                                    onClick={event => onRowExec(row, event.currentTarget)}
                                    sx={{color: t.textDim, '&:hover': {color: t.text}, '&.Mui-disabled': disabledIcon}}>
                            <Terminal sx={{fontSize: 16}}/>
                        </IconButton>
                    </span>
                </Tooltip>
            </TableCell>
        </TableRow>
    );
}

// state as a colored icon (tooltip carries the word), health spelled out
// next to it when the container has a healthcheck. Health only means
// something while the container runs: the daemon keeps serving the last
// health state on stopped/paused containers, which would wrongly paint
// them unhealthy.
function StateCell({state, health}: { state: string, health: string }) {
    const isRunning = state === 'running';
    const visual = (isRunning && health === 'unhealthy')
        ? {icon: <WarningAmber/>, color: '#ef5350'}
        : stateVisual[state] ?? {icon: <Stop/>, color: t.textDim};

    return (
        <TableCell sx={bodyCell}>
            <Stack direction="row" spacing={0.5} sx={{
                alignItems: "center"
            }}>
                <Tooltip title={state} arrow>
                    <Box sx={{display: 'flex', color: visual.color, '& svg': {fontSize: 17}}}>
                        {visual.icon}
                    </Box>
                </Tooltip>
                {health && isRunning && (
                    <Typography sx={{
                        fontSize: '0.7rem',
                        fontFamily: t.mono,
                        color: health === 'healthy' ? '#66bb6a' : health === 'unhealthy' ? '#ef5350' : t.textDim,
                    }}>
                        {health}
                    </Typography>
                )}
            </Stack>
        </TableCell>
    );
}

// same recipe as the edit view's STATS tab: the live value (usage-colored)
// sits top-left above a small sparkline of its history; chart=false keeps
// only the value line (compact stack rows)
function MetricCell({text, subText, textColor, data, lineColor, chart = true}: {
    text: string;
    subText?: string;
    textColor: string;
    data?: number[];
    lineColor: string;
    chart?: boolean;
}) {
    return (
        <TableCell sx={bodyCell}>
            <Box sx={{width: chart ? 150 : 'auto', minWidth: chart ? 150 : 0}}>
                <Typography variant="caption" component="div"
                            sx={{fontFamily: t.mono, whiteSpace: 'nowrap', lineHeight: 1.4, mb: chart ? 0.4 : 0}}>
                    <Box component="span" sx={{fontWeight: 700, color: textColor}}>{text}</Box>
                    {subText && (
                        <Box component="span" sx={{color: t.textDim, fontSize: '0.65rem'}}>
                            {' '}{subText}
                        </Box>
                    )}
                </Typography>
                {chart && <Sparkline data={data ?? []} color={lineColor} height={26}/>}
            </Box>
        </TableCell>
    );
}

// how long the container has been up, from the stats' RFC3339 started_at:
// "3d 4h", "5h 12m", "8m", "42s"
function formatUptime(startedAt: string, now: number): string {
    if (!startedAt || startedAt.startsWith('0001')) return '–';
    const start = Date.parse(startedAt);
    if (isNaN(start)) return '–';
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
