import {callRPC, useHostClient} from "../../lib/api.ts";
import {DockerService, type NetworkInspectInfo} from "../../gen/docker/v1/docker_pb.ts";
import {useParams} from "react-router-dom";
import {useCallback, useEffect, useState} from "react";
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
    Typography
} from "@mui/material";
import {ArrowBack, ContentCopy} from "@mui/icons-material";
import HubIcon from "@mui/icons-material/Hub";
import RefreshIcon from "@mui/icons-material/Refresh";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";

const NetworksInspect = () => {
    const dockerService = useHostClient(DockerService)
    const {id} = useParams()

    const [inspect, setInspect] = useState<NetworkInspectInfo | null>(null)
    const [err, setErr] = useState("")
    const [loading, setLoading] = useState(false)

    const fetchData = useCallback(async () => {
        setLoading(true)
        setErr("")

        const {val, err} = await callRPC(() => dockerService.networkInspect({networkId: id}))
        if (err) {
            setErr(err)
        } else {
            setInspect(val?.inspect ?? null)
        }

        setLoading(false)
    }, [dockerService, id]);

    useEffect(() => {
        fetchData().then()
    }, [fetchData]);

    const handleCopy = (text: string) => {
        navigator.clipboard.writeText(text).then();
    };

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
                    <IconButton
                        onClick={() => {
                            history.back();
                        }}
                        title="Back to Networks"
                    >
                        <ArrowBack/>
                    </IconButton>
                    <HubIcon color="primary"/>
                    <Typography variant="h6" component="h2">
                        Inspect Network
                    </Typography>
                </Box>
                <IconButton
                    onClick={fetchData}
                    disabled={loading}
                    title="Refresh Data"
                >
                    <RefreshIcon/>
                </IconButton>
            </Box>

            <Box sx={{
                p: 3,
                flexGrow: 1,
                overflow: 'auto',
                position: 'relative'
            }}>
                {/* 1. Loading State */}
                {loading && (
                    <Box sx={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        height: '100%',
                        gap: 2
                    }}>
                        <CircularProgress size={40} thickness={4}/>
                        <Typography variant="h6" color="text.secondary">
                            Loading...
                        </Typography>
                    </Box>
                )}

                {/* 2. Error State */}
                {!loading && err && (
                    <Box sx={{display: 'flex', justifyContent: 'center', pt: 4}}>
                        <Alert
                            severity="error"
                            variant="outlined"
                            sx={{fontSize: '1rem'}}
                            action={
                                <Button color="inherit" size="large" onClick={fetchData}>
                                    Retry
                                </Button>
                            }
                        >
                            Error: {err}
                        </Alert>
                    </Box>
                )}

                {/* 3. Null State */}
                {!loading && !err && !inspect && (
                    <Box sx={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        height: '100%',
                        opacity: 0.5
                    }}>
                        <ErrorOutlineIcon sx={{fontSize: 60, mb: 2}}/>
                        <Typography variant="h5">No network info found</Typography>
                    </Box>
                )}

                {/* 4. Success State (Main Area) */}
                {!loading && !err && inspect && inspect.net && (
                    <Stack spacing={3}>
                        {/* Summary Header */}
                        <Box>
                            <Typography variant="h5" fontWeight="bold" gutterBottom>
                                {inspect.net.name || "Unnamed Network"}
                            </Typography>
                            <Box sx={{display: 'flex', alignItems: 'center', gap: 1}}>
                                <Typography variant="body1" color="text.secondary" sx={{fontFamily: 'monospace'}}>
                                    {inspect.net.id}
                                </Typography>
                                <IconButton
                                    size="small"
                                    onClick={() => handleCopy(inspect.net!.id)}
                                    title="Copy Network ID"
                                >
                                    <ContentCopy fontSize="small" />
                                </IconButton>
                            </Box>
                        </Box>

                        <Divider/>

                        {/* Network Details in Columns */}
                        <Box>
                            <Typography variant="h6" gutterBottom sx={{fontSize: '1.1rem', mb: 2}}>
                                Network Details
                            </Typography>
                            <Box sx={{display: 'flex', flexDirection: {xs: 'column', md: 'row'}, gap: 2}}>
                                {/* Column 1: Basic Configuration */}
                                <Box sx={{flex: 1}}>
                                    <Typography variant="subtitle2" color="primary" gutterBottom sx={{fontSize: '0.95rem', fontWeight: 600}}>
                                        Configuration
                                    </Typography>
                                    <Stack spacing={2}>
                                        <Box>
                                            <Typography variant="body2" color="text.secondary" sx={{fontSize: '0.9rem', mb: 0.5}}>
                                                Driver
                                            </Typography>
                                            <Chip label={inspect.net.driver} size="medium" color="primary" variant="outlined"/>
                                        </Box>
                                        <Box>
                                            <Typography variant="body2" color="text.secondary" sx={{fontSize: '0.9rem', mb: 0.5}}>
                                                Scope
                                            </Typography>
                                            <Typography variant="body1" sx={{fontSize: '0.95rem'}}>
                                                {inspect.net.scope}
                                            </Typography>
                                        </Box>
                                        {inspect.net.composeProject && (
                                            <Box>
                                                <Typography variant="body2" color="text.secondary" sx={{fontSize: '0.9rem', mb: 0.5}}>
                                                    Compose Project
                                                </Typography>
                                                <Typography variant="body1" sx={{fontSize: '0.95rem'}}>
                                                    {inspect.net.composeProject}
                                                </Typography>
                                            </Box>
                                        )}
                                        <Box>
                                            <Typography variant="body2" color="text.secondary" sx={{fontSize: '0.9rem', mb: 0.5}}>
                                                Created
                                            </Typography>
                                            <Typography variant="body1" sx={{fontSize: '0.95rem'}}>
                                                {inspect.net.createdAt ? new Date(inspect.net.createdAt).toLocaleString() : 'N/A'}
                                            </Typography>
                                        </Box>
                                    </Stack>
                                </Box>

                                {/* Column 2: Network Settings */}
                                <Box sx={{flex: 1}}>
                                    <Typography variant="subtitle2" color="primary" gutterBottom sx={{fontSize: '0.95rem', fontWeight: 600}}>
                                        Network Settings
                                    </Typography>
                                    <Stack spacing={2}>
                                        <Box>
                                            <Typography variant="body2" color="text.secondary" sx={{fontSize: '0.9rem', mb: 0.5}}>
                                                Subnet
                                            </Typography>
                                            <Typography variant="body1" sx={{fontFamily: 'monospace', fontSize: '0.95rem'}}>
                                                {inspect.net.subnet || 'N/A'}
                                            </Typography>
                                        </Box>
                                        <Box>
                                            <Typography variant="body2" color="text.secondary" sx={{fontSize: '0.9rem', mb: 0.5}}>
                                                IPv4 Enabled
                                            </Typography>
                                            <Chip
                                                label={inspect.net.enableIpv4 ? "Yes" : "No"}
                                                size="medium"
                                                color={inspect.net.enableIpv4 ? "success" : "default"}
                                            />
                                        </Box>
                                        <Box>
                                            <Typography variant="body2" color="text.secondary" sx={{fontSize: '0.9rem', mb: 0.5}}>
                                                IPv6 Enabled
                                            </Typography>
                                            <Chip
                                                label={inspect.net.enableIpv6 ? "Yes" : "No"}
                                                size="medium"
                                                color={inspect.net.enableIpv6 ? "success" : "default"}
                                            />
                                        </Box>
                                    </Stack>
                                </Box>

                                {/* Column 3: Access Control */}
                                <Box sx={{flex: 1}}>
                                    <Typography variant="subtitle2" color="primary" gutterBottom sx={{fontSize: '0.95rem', fontWeight: 600}}>
                                        Access Control
                                    </Typography>
                                    <Stack spacing={2}>
                                        <Box>
                                            <Typography variant="body2" color="text.secondary" sx={{fontSize: '0.9rem', mb: 0.5}}>
                                                Internal
                                            </Typography>
                                            <Chip
                                                label={inspect.net.internal ? "Yes" : "No"}
                                                size="medium"
                                                color={inspect.net.internal ? "warning" : "default"}
                                            />
                                        </Box>
                                        <Box>
                                            <Typography variant="body2" color="text.secondary" sx={{fontSize: '0.9rem', mb: 0.5}}>
                                                Attachable
                                            </Typography>
                                            <Chip
                                                label={inspect.net.attachable ? "Yes" : "No"}
                                                size="medium"
                                                color={inspect.net.attachable ? "success" : "default"}
                                            />
                                        </Box>
                                    </Stack>
                                </Box>
                            </Box>
                        </Box>

                        <Divider/>

                        {/* Connected Containers */}
                        <Box>
                            <Typography variant="h6" gutterBottom sx={{fontSize: '1.1rem'}}>
                                Connected Containers ({inspect.container?.length || 0})
                            </Typography>
                            {inspect.container && inspect.container.length > 0 ? (
                                <TableContainer>
                                    <Table size="small">
                                        <TableHead>
                                            <TableRow>
                                                <TableCell sx={{fontSize: '0.95rem'}}><strong>Name</strong></TableCell>
                                                <TableCell sx={{fontSize: '0.95rem'}}><strong>Endpoint</strong></TableCell>
                                                <TableCell sx={{fontSize: '0.95rem'}}><strong>IPv4</strong></TableCell>
                                                <TableCell sx={{fontSize: '0.95rem'}}><strong>IPv6</strong></TableCell>
                                                <TableCell sx={{fontSize: '0.95rem'}}><strong>MAC</strong></TableCell>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {inspect.container.map((container, idx) => (
                                                <TableRow key={idx} hover>
                                                    <TableCell sx={{fontSize: '0.9rem'}}>
                                                        {container.Name || 'N/A'}
                                                    </TableCell>
                                                    <TableCell>
                                                        <Box sx={{display: 'flex', alignItems: 'center', gap: 0.5}}>
                                                            <Typography sx={{fontFamily: 'monospace', fontSize: '0.9rem'}}>
                                                                {container.Endpoint || 'N/A'}
                                                            </Typography>
                                                            {container.Endpoint && (
                                                                <IconButton
                                                                    size="small"
                                                                    onClick={() => handleCopy(container.Endpoint)}
                                                                    title="Copy Endpoint ID"
                                                                >
                                                                    <ContentCopy fontSize="small" />
                                                                </IconButton>
                                                            )}
                                                        </Box>
                                                    </TableCell>
                                                    <TableCell sx={{fontFamily: 'monospace', fontSize: '0.9rem'}}>
                                                        {container.IPv4 || 'N/A'}
                                                    </TableCell>
                                                    <TableCell sx={{fontFamily: 'monospace', fontSize: '0.9rem'}}>
                                                        {container.IPv6 || 'N/A'}
                                                    </TableCell>
                                                    <TableCell sx={{fontFamily: 'monospace', fontSize: '0.9rem'}}>
                                                        {container.Mac || 'N/A'}
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </TableContainer>
                            ) : (
                                <Box sx={{
                                    p: 3,
                                    textAlign: 'center',
                                    bgcolor: 'background.default',
                                    borderRadius: 1
                                }}>
                                    <Typography variant="body1" color="text.secondary">
                                        No containers connected to this network
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

export default NetworksInspect;