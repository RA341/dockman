import {callRPC, useHostClient} from '../../lib/api.ts';
import {DockerService, type VolumeInspectInfo} from '../../gen/docker/v1/docker_pb.ts';
import {useNavigate, useParams} from 'react-router-dom';
import {type ReactNode, useCallback, useEffect, useState} from 'react';
import {
    Alert, Box, Button, Chip, CircularProgress, Dialog, Divider, IconButton, Paper, Stack, Tab, Table,
    TableBody, TableCell, TableContainer, TableHead, TableRow, Tabs, Tooltip, Typography,
} from '@mui/material';
import {Close, ContentCopy, FolderOpenOutlined, InfoOutlined, Refresh, Storage as StorageIcon} from '@mui/icons-material';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutlined';
import {formatBytes} from '../../lib/editor.ts';
import {formatDate} from '../../lib/api.ts';
import ContainerFileBrowser from '../../components/container-file-browser.tsx';
import scrollbarStyles from '../../components/scrollbar-style.tsx';
import {statsTheme as t} from '../compose/components/stats-theme.ts';

interface Props {
    open?: boolean;
    volumeName?: string;
    onClose?: () => void;
}

type VolumeTab = 'overview' | 'files';

const tabs = [
    {id: 'overview' as const, label: 'Overview', icon: <InfoOutlined/>},
    {id: 'files' as const, label: 'Files', icon: <FolderOpenOutlined/>},
];

const Detail = ({label, children}: {label: string; children: ReactNode}) => <Box sx={{minWidth: 0}}>
    <Typography sx={{color: t.textDim, fontSize: '0.69rem', mb: 0.25}}>{label}</Typography>
    {children}
</Box>;

const Value = ({children}: {children: ReactNode}) => <Typography sx={{fontFamily: t.mono, fontSize: '0.76rem', overflowWrap: 'anywhere', userSelect: 'text'}}>
    {children}
</Typography>;

const Section = ({title, children}: {title: string; children: ReactNode}) => <Paper variant="outlined" sx={{p: 1.35, bgcolor: t.panel, borderColor: t.border, borderRadius: 1.5}}>
    <Typography sx={{fontWeight: 800, fontSize: '0.8rem', mb: 1}}>{title}</Typography>
    {children}
</Paper>;

export default function VolumesInspect({open: controlledOpen, volumeName: controlledName, onClose}: Props) {
    const dockerService = useHostClient(DockerService);
    const params = useParams();
    const navigate = useNavigate();
    const volumeName = controlledName ?? params.id ?? '';
    const open = controlledOpen ?? Boolean(params.id);
    const close = onClose ?? (() => navigate(`/${params.host ?? ''}/volumes`, {replace: true}));
    const [inspect, setInspect] = useState<VolumeInspectInfo | null>(null);
    const [err, setErr] = useState('');
    const [loading, setLoading] = useState(false);
    const [tab, setTab] = useState<VolumeTab>('overview');

    const fetchData = useCallback(async () => {
        if (!open || !volumeName) return;
        setLoading(true);
        setErr('');
        const result = await callRPC(() => dockerService.volumeInspect({volumeName}));
        if (result.err) {
            setErr(result.err);
            setInspect(null);
        } else {
            setInspect(result.val?.inspect ?? null);
        }
        setLoading(false);
    }, [dockerService, open, volumeName]);

    useEffect(() => {
        if (!open) return;
        setTab('overview');
        setInspect(null);
        void fetchData();
    }, [open, volumeName, fetchData]);

    const copy = (value: string) => void navigator.clipboard.writeText(value);
    const containers = inspect?.containers ?? [];
    const volume = inspect?.vol;

    return <Dialog open={open} onClose={close} maxWidth={false} fullWidth
        slotProps={{
            backdrop: {sx: {bgcolor: 'rgba(0,0,0,0.68)', backdropFilter: 'blur(4px)'}},
            paper: {sx: {
                width: 'min(86vw, 1220px)', height: 'min(82vh, 790px)', maxWidth: 'none', maxHeight: 'none', m: 2,
                bgcolor: '#17191c', border: `1px solid ${t.border}`, borderRadius: 2.5, overflow: 'hidden',
                boxShadow: '0 28px 90px rgba(0,0,0,0.65)', userSelect: 'text', WebkitUserSelect: 'text',
            }},
        }}>
        <Box sx={{display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0}}>
            <Stack direction="row" sx={{px: 1.75, py: 1, alignItems: 'center', gap: 1.25, bgcolor: t.header, borderBottom: `1px solid ${t.border}`}}>
                <StorageIcon color="primary"/>
                <Box sx={{minWidth: 0, flex: 1}}>
                    <Typography variant="h6" noWrap sx={{fontWeight: 900}}>{volume?.name || volumeName || 'Volume'}</Typography>
                    <Typography noWrap sx={{fontFamily: t.mono, color: t.textDim, fontSize: '0.68rem', userSelect: 'text'}}>
                        {volume?.mountPoint || 'Docker managed volume'}
                    </Typography>
                </Box>
                <Tooltip title="Refresh details"><span><IconButton disabled={loading} onClick={() => void fetchData()}>
                    {loading ? <CircularProgress size={18}/> : <Refresh/>}
                </IconButton></span></Tooltip>
                <Divider orientation="vertical" flexItem/>
                <Tooltip title="Close"><IconButton onClick={close}><Close/></IconButton></Tooltip>
            </Stack>

            <Box sx={{display: 'flex', flex: 1, minHeight: 0}}>
                <Box component="nav" aria-label="Volume details" sx={{width: 168, flexShrink: 0, overflowY: 'auto', borderRight: `1px solid ${t.border}`, bgcolor: '#1b1d20', ...scrollbarStyles}}>
                    <Tabs orientation="vertical" value={tab} onChange={(_, value: VolumeTab) => setTab(value)}
                        sx={{py: 0.8, minHeight: '100%', '& .MuiTabs-indicator': {left: 0, right: 'auto', width: 3}}}>
                        {tabs.map(item => <Tab key={item.id} value={item.id} label={item.label} icon={item.icon} iconPosition="start"
                            sx={{minHeight: 42, justifyContent: 'flex-start', alignItems: 'center', textTransform: 'none', fontWeight: 650,
                                fontSize: '0.78rem', px: 1.5, gap: 1, '& svg': {fontSize: 18}}}/>) }
                    </Tabs>
                </Box>

                <Box sx={{flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden'}}>
                    {err && <Alert severity="error" sx={{m: 1, mb: 0, flexShrink: 0}}
                        action={<Button color="inherit" size="small" onClick={() => void fetchData()}>Retry</Button>}>{err}</Alert>}
                    <Box hidden={tab !== 'files'} sx={{height: '100%', minHeight: 0, overflow: 'hidden'}}>
                        <ContainerFileBrowser kind="volume" target={volumeName} active={open && tab === 'files'}/>
                    </Box>
                    <Box hidden={tab !== 'overview'} sx={{flex: 1, minHeight: 0, overflow: 'auto', p: 1.4, ...scrollbarStyles}}>
                        {loading && !inspect && <Box sx={{display: 'grid', placeItems: 'center', height: '100%'}}><CircularProgress/></Box>}
                        {!loading && !err && !volume && <Box sx={{display: 'grid', placeItems: 'center', height: '100%', color: t.textDim}}>
                            <Stack sx={{alignItems: 'center'}}><ErrorOutlineIcon sx={{fontSize: 42}}/><Typography>No volume information found</Typography></Stack>
                        </Box>}
                        {volume && <Stack spacing={1.25}>
                            <Section title="Volume overview">
                                <Box sx={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 1.25}}>
                                    <Detail label="Name"><Value>{volume.name || '—'}</Value></Detail>
                                    <Detail label="Size"><Value>{formatBytes(volume.size)}</Value></Detail>
                                    <Detail label="Status"><Chip label={containers.length ? 'In use' : 'Unused'} size="small" color={containers.length ? 'success' : 'default'} variant="outlined"/></Detail>
                                    <Detail label="Created"><Value>{volume.createdAt ? formatDate(volume.createdAt) : '—'}</Value></Detail>
                                    <Detail label="Compose project"><Value>{volume.composeProjectName || '—'}</Value></Detail>
                                    <Detail label="Labels"><Value>{volume.labels || '—'}</Value></Detail>
                                </Box>
                            </Section>
                            <Section title="Mount point">
                                <Stack direction="row" spacing={0.5} sx={{alignItems: 'center'}}>
                                    <Value>{volume.mountPoint || '—'}</Value>
                                    {volume.mountPoint && <Tooltip title="Copy mount point"><IconButton size="small" onClick={() => copy(volume.mountPoint)}><ContentCopy sx={{fontSize: 16}}/></IconButton></Tooltip>}
                                </Stack>
                            </Section>
                            <Section title={`Used by (${containers.length})`}>
                                {containers.length ? <TableContainer sx={{maxHeight: 330, ...scrollbarStyles}}><Table size="small" stickyHeader sx={{'& .MuiTableCell-root': {py: 0.6, px: 1, borderColor: t.border, fontSize: '0.73rem'}}}>
                                    <TableHead><TableRow><TableCell>Container</TableCell><TableCell>Mount path</TableCell><TableCell>Access</TableCell><TableCell>Project</TableCell><TableCell>ID</TableCell></TableRow></TableHead>
                                    <TableBody>{containers.map(container => <TableRow key={`${container.id}:${container.destination}`} hover>
                                        <TableCell sx={{fontWeight: 700}}>{container.name || '—'}</TableCell>
                                        <TableCell sx={{fontFamily: t.mono, userSelect: 'text'}}>{container.destination || '—'}</TableCell>
                                        <TableCell><Chip label={container.rw ? 'Read / Write' : 'Read-only'} size="small" color={container.rw ? 'primary' : 'default'} variant="outlined"/></TableCell>
                                        <TableCell>{container.composeProject || '—'}</TableCell>
                                        <TableCell><Stack direction="row" spacing={0.25} sx={{alignItems: 'center'}}><Typography sx={{fontFamily: t.mono, fontSize: '0.72rem'}}>{container.id ? container.id.slice(0, 12) : '—'}</Typography>
                                            {container.id && <IconButton size="small" onClick={() => copy(container.id)}><ContentCopy sx={{fontSize: 14}}/></IconButton>}</Stack></TableCell>
                                    </TableRow>)}</TableBody>
                                </Table></TableContainer> : <Typography sx={{color: t.textDim, fontSize: '0.76rem'}}>No containers are using this volume.</Typography>}
                            </Section>
                        </Stack>}
                    </Box>
                </Box>
            </Box>
        </Box>
    </Dialog>;
}
