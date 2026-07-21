import {callRPC, useHostClient} from "../../lib/api.ts";
import {DockerService, type VolumeInspectInfo} from "../../gen/docker/v1/docker_pb.ts";
import {useParams} from "react-router-dom";
import {type ReactNode, useCallback, useEffect, useState} from "react";
import {
    Alert,
    Box,
    Button,
    Chip,
    CircularProgress,
    Divider,
    IconButton,
    Paper,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Tab,
    Tabs,
    Typography
} from "@mui/material";
import {ArrowBack, ContentCopy, FolderOpenOutlined, InfoOutlined} from "@mui/icons-material";
import StorageIcon from "@mui/icons-material/Storage";
import RefreshIcon from "@mui/icons-material/Refresh";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutlined";
import {formatBytes} from "../../lib/editor.ts";
import {formatDate} from "../../lib/api.ts";
import ContainerFileBrowser from "../../components/container-file-browser.tsx";

const VolumesInspect = () => {
    const dockerService = useHostClient(DockerService)
    const {id} = useParams()
    const volumeName = id ?? ""

    const [inspect, setInspect] = useState<VolumeInspectInfo | null>(null)
    const [err, setErr] = useState("")
    const [loading, setLoading] = useState(false)
    const [tab, setTab] = useState<'overview' | 'files'>('overview')

    const fetchData = useCallback(async () => {
        setLoading(true)
        setErr("")

        const {val, err} = await callRPC(() => dockerService.volumeInspect({volumeName}))
        if (err) {
            setErr(err)
        } else {
            setInspect(val?.inspect ?? null)
        }

        setLoading(false)
    }, [dockerService, volumeName]);

    useEffect(() => {
        fetchData().then()
    }, [fetchData]);

    const handleCopy = (text: string) => {
        navigator.clipboard.writeText(text).then();
    };

    const containers = inspect?.containers ?? []

    return (
        <Paper
            elevation={0}
            sx={{
                display: 'flex',
                flexDirection: 'column',
                height: '100%',
                width: '100%',
                borderRadius: 0,
                overflow: 'hidden'
            }}
        >
            {/* --- Header Section --- */}
            <Box sx={{
                p: 2,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderBottom: 1,
                borderColor: 'divider',
                bgcolor: 'background.default'
            }}>
                <Box sx={{display: 'flex', alignItems: 'center', gap: 2}}>
                    <IconButton onClick={() => history.back()} title="Back to Volumes">
                        <ArrowBack/>
                    </IconButton>
                    <StorageIcon color="primary"/>
                    <Typography variant="h6" component="h2">
                        Inspect Volume
                    </Typography>
                </Box>
                <IconButton onClick={fetchData} disabled={loading} title="Refresh Data">
                    <RefreshIcon/>
                </IconButton>
            </Box>
            <Tabs value={tab} onChange={(_, value: 'overview' | 'files') => setTab(value)} sx={{px: 2, borderBottom: 1, borderColor: 'divider', flexShrink: 0}}>
                <Tab value="overview" icon={<InfoOutlined/>} iconPosition="start" label="Overview" sx={{textTransform: 'none', minHeight: 46}}/>
                <Tab value="files" icon={<FolderOpenOutlined/>} iconPosition="start" label="Files" sx={{textTransform: 'none', minHeight: 46}}/>
            </Tabs>
            <Box hidden={tab !== 'files'} sx={{p: 1.5, flexGrow: 1, minHeight: 0, overflow: 'hidden'}}>
                <ContainerFileBrowser kind="volume" target={volumeName} active={tab === 'files'}/>
            </Box>
            <Box hidden={tab !== 'overview'} sx={{p: 3, flexGrow: 1, overflow: 'auto', position: 'relative'}}>
                {loading && (
                    <Box sx={{
                        display: 'flex', flexDirection: 'column', alignItems: 'center',
                        justifyContent: 'center', height: '100%', gap: 2
                    }}>
                        <CircularProgress size={40} thickness={4}/>
                        <Typography variant="h6" sx={{
                            color: "text.secondary"
                        }}>Loading...</Typography>
                    </Box>
                )}

                {!loading && err && (
                    <Box sx={{display: 'flex', justifyContent: 'center', pt: 4}}>
                        <Alert
                            severity="error"
                            variant="outlined"
                            sx={{fontSize: '1rem'}}
                            action={<Button color="inherit" size="large" onClick={fetchData}>Retry</Button>}
                        >
                            Error: {err}
                        </Alert>
                    </Box>
                )}

                {!loading && !err && !inspect?.vol && (
                    <Box sx={{
                        display: 'flex', flexDirection: 'column', alignItems: 'center',
                        justifyContent: 'center', height: '100%', opacity: 0.5
                    }}>
                        <ErrorOutlineIcon sx={{fontSize: 60, mb: 2}}/>
                        <Typography variant="h5">No volume info found</Typography>
                    </Box>
                )}

                {!loading && !err && inspect?.vol && (
                    <Stack spacing={3}>
                        {/* Summary Header */}
                        <Box>
                            <Typography variant="h5" gutterBottom sx={{
                                fontWeight: "bold"
                            }}>
                                {inspect.vol.name || "Unnamed Volume"}
                            </Typography>
                            <Box sx={{display: 'flex', alignItems: 'center', gap: 1}}>
                                <Typography
                                    variant="body1"
                                    sx={{
                                        color: "text.secondary",
                                        fontFamily: 'monospace'
                                    }}>
                                    {inspect.vol.mountPoint || 'N/A'}
                                </Typography>
                                {inspect.vol.mountPoint && (
                                    <IconButton size="small" onClick={() => handleCopy(inspect.vol!.mountPoint)}
                                                title="Copy Mount Point">
                                        <ContentCopy fontSize="small"/>
                                    </IconButton>
                                )}
                            </Box>
                        </Box>

                        <Divider/>

                        {/* Volume Details */}
                        <Box>
                            <Typography variant="h6" gutterBottom sx={{fontSize: '1.1rem', mb: 2}}>
                                Volume Details
                            </Typography>
                            <Box sx={{display: 'flex', flexDirection: {xs: 'column', md: 'row'}, gap: 2}}>
                                <Box sx={{flex: 1}}>
                                    <Stack spacing={2}>
                                        <Detail label="Size">
                                            <Typography variant="body1" sx={{fontFamily: 'monospace', fontSize: '0.95rem'}}>
                                                {formatBytes(inspect.vol.size)}
                                            </Typography>
                                        </Detail>
                                        <Detail label="Status">
                                            <Chip
                                                label={containers.length > 0 ? "In Use" : "Unused"}
                                                size="small"
                                                color={containers.length > 0 ? "success" : "default"}
                                                variant="outlined"
                                            />
                                        </Detail>
                                    </Stack>
                                </Box>
                                <Box sx={{flex: 1}}>
                                    <Stack spacing={2}>
                                        <Detail label="Compose Project">
                                            <Typography variant="body1" sx={{fontSize: '0.95rem'}}>
                                                {inspect.vol.composeProjectName || inspect.vol.labels || '—'}
                                            </Typography>
                                        </Detail>
                                        <Detail label="Created">
                                            <Typography variant="body1" sx={{fontSize: '0.95rem'}}>
                                                {inspect.vol.createdAt ? formatDate(inspect.vol.createdAt) : 'N/A'}
                                            </Typography>
                                        </Detail>
                                    </Stack>
                                </Box>
                            </Box>
                        </Box>

                        <Divider/>

                        {/* Containers using this volume */}
                        <Box>
                            <Typography variant="h6" gutterBottom sx={{fontSize: '1.1rem'}}>
                                Used By ({containers.length})
                            </Typography>
                            {containers.length > 0 ? (
                                <TableContainer>
                                    <Table size="small">
                                        <TableHead>
                                            <TableRow>
                                                <TableCell sx={{fontSize: '0.95rem'}}><strong>Container</strong></TableCell>
                                                <TableCell sx={{fontSize: '0.95rem'}}><strong>Mount Path</strong></TableCell>
                                                <TableCell sx={{fontSize: '0.95rem'}}><strong>Access</strong></TableCell>
                                                <TableCell sx={{fontSize: '0.95rem'}}><strong>Project</strong></TableCell>
                                                <TableCell sx={{fontSize: '0.95rem'}}><strong>ID</strong></TableCell>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {containers.map((c, idx) => (
                                                <TableRow key={idx} hover>
                                                    <TableCell sx={{fontSize: '0.9rem'}}>{c.name || 'N/A'}</TableCell>
                                                    <TableCell sx={{fontFamily: 'monospace', fontSize: '0.9rem'}}>
                                                        {c.destination || 'N/A'}
                                                    </TableCell>
                                                    <TableCell>
                                                        <Chip
                                                            label={c.rw ? "Read/Write" : "Read-Only"}
                                                            size="small"
                                                            variant="outlined"
                                                            color={c.rw ? "primary" : "default"}
                                                        />
                                                    </TableCell>
                                                    <TableCell sx={{fontSize: '0.9rem'}}>{c.composeProject || '—'}</TableCell>
                                                    <TableCell>
                                                        <Box sx={{display: 'flex', alignItems: 'center', gap: 0.5}}>
                                                            <Typography sx={{fontFamily: 'monospace', fontSize: '0.9rem'}}>
                                                                {c.id ? c.id.substring(0, 12) : 'N/A'}
                                                            </Typography>
                                                            {c.id && (
                                                                <IconButton size="small" onClick={() => handleCopy(c.id)}
                                                                            title="Copy Container ID">
                                                                    <ContentCopy fontSize="small"/>
                                                                </IconButton>
                                                            )}
                                                        </Box>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </TableContainer>
                            ) : (
                                <Box sx={{p: 3, textAlign: 'center', bgcolor: 'background.default', borderRadius: 1}}>
                                    <Typography variant="body1" sx={{
                                        color: "text.secondary"
                                    }}>
                                        No containers are using this volume
                                    </Typography>
                                </Box>
                            )}
                        </Box>
                    </Stack>
                )}
            </Box>
        </Paper>
    );
};

const Detail = ({label, children}: { label: string; children: ReactNode }) => (
    <Box>
        <Typography
            variant="body2"
            sx={{
                color: "text.secondary",
                fontSize: '0.9rem',
                mb: 0.5
            }}>
            {label}
        </Typography>
        {children}
    </Box>
);

export default VolumesInspect;
