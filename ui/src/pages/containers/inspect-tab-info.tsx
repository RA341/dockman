import {callRPC, useHostClient} from "../../lib/api.ts";
import {useCallback, useEffect, useState} from "react";
import {type ContainerInspectMessage, DockerService} from "../../gen/docker/v1/docker_pb.ts";
import {
    Alert,
    Box,
    Chip,
    CircularProgress,
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

// Icons
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import ImageIcon from '@mui/icons-material/Image';
import TerminalIcon from '@mui/icons-material/Terminal';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import FingerprintIcon from '@mui/icons-material/Fingerprint';
import {ContainerIcon} from "../compose/components/file-icon.tsx";

const InfoRow = ({icon: Icon, label, value, mono = false}: {
    icon: any,
    label: string,
    value: string | undefined,
    mono?: boolean
}) => (
    <Box sx={{
        display: 'flex',
        py: 1.5,
        px: 1,
        borderBottom: '1px solid',
        borderColor: 'divider',
        '&:last-child': {borderBottom: 0}
    }}>
        <Stack direction="row" spacing={2} sx={{width: '100%', alignItems: 'center'}}>
            <Icon sx={{color: 'text.secondary', fontSize: 20}}/>
            <Typography variant="body2" sx={{fontWeight: 600, minWidth: 120, color: 'text.secondary'}}>
                {label}
            </Typography>
            <Typography
                variant="body2"
                sx={{
                    fontFamily: mono ? 'monospace' : 'inherit',
                    wordBreak: 'break-all',
                    color: 'text.primary',
                    bgcolor: mono ? 'action.hover' : 'transparent',
                    px: mono ? 0.5 : 0,
                    borderRadius: 1
                }}
            >
                {value || 'N/A'}
            </Typography>
        </Stack>
    </Box>
);

function InspectTabInfo({containerId}: { containerId: string }) {
    const dockerClient = useHostClient(DockerService)
    const [inspect, setInspect] = useState<ContainerInspectMessage | null>(null)
    const [err, setErr] = useState("")
    const [loading, setLoading] = useState(false)

    const fetchInspect = useCallback(async () => {
        setLoading(true)
        const {val, err} = await callRPC(() => dockerClient.containerInspect({containerID: containerId}))
        if (err) {
            setErr(err)
        } else {
            setInspect(val)
        }
        setLoading(false)
    }, [containerId, dockerClient]);

    useEffect(() => {
        fetchInspect().then()
    }, [fetchInspect]);

    if (loading) {
        return (
            <Box sx={{display: 'flex', justifyContent: 'center', alignItems: 'center', height: '200px'}}>
                <CircularProgress size={32} thickness={5}/>
            </Box>
        )
    }

    if (err || !inspect) {
        return (
            <Box sx={{p: 2}}>
                <Alert severity="error" variant="outlined">
                    {err || "Api request succeeded but an empty value was returned"}
                </Alert>
            </Box>
        )
    }

    return (
        <Box sx={{width: '100%', p: 2}}>
            {/* Header Section */}
            <Paper variant="outlined" sx={{p: 3, mb: 3, borderRadius: 2, bgcolor: ''}}>
                <Stack direction="row" alignItems="center" spacing={2}>
                    <Box sx={{p: 1.5, borderRadius: 2, color: 'white', display: 'flex'}}>
                        <ContainerIcon/>
                    </Box>
                    <Box>
                        <Typography variant="h5" sx={{fontWeight: 700}}>
                            {inspect.Name?.replace(/^\//, '')}
                        </Typography>
                        <Typography variant="caption" sx={{fontFamily: 'monospace', color: 'text.secondary'}}>
                            {inspect.ID}
                        </Typography>
                    </Box>
                </Stack>
            </Paper>

            <Stack spacing={3}>
                {/* General Details Section */}
                <Box>
                    <Typography variant="overline" sx={{px: 1, fontWeight: 700, color: 'primary.main'}}>
                        General Configuration
                    </Typography>
                    <Paper variant="outlined" sx={{mt: 1, borderRadius: 2, overflow: 'hidden'}}>
                        <InfoRow icon={FingerprintIcon} label="Short ID" value={inspect.ID?.substring(0, 12)} mono/>
                        <InfoRow icon={ImageIcon} label="Image" value={inspect.Image}/>
                        <InfoRow icon={TerminalIcon} label="Entrypoint" value={inspect.Path} mono/>
                        <InfoRow icon={CalendarTodayIcon} label="Created"
                                 value={new Date(inspect.Created).toLocaleString()}/>
                        <InfoRow icon={FolderOpenIcon} label="Hosts Path" value={inspect.HostsPath} mono/>
                    </Paper>
                </Box>

                {/* Mounts Section */}
                {inspect.mounts && inspect.mounts.length > 0 && (
                    <Box>
                        <Typography variant="overline" sx={{px: 1, fontWeight: 700, color: 'primary.main'}}>
                            Volume Mounts
                        </Typography>
                        <TableContainer component={Paper} variant="outlined" sx={{mt: 1, borderRadius: 2}}>
                            <Table size="small">
                                <TableHead sx={{bgcolor: 'action.hover'}}>
                                    <TableRow>
                                        <TableCell sx={{fontWeight: 700}}>Type</TableCell>
                                        <TableCell sx={{fontWeight: 700}}>Source (Host)</TableCell>
                                        <TableCell sx={{fontWeight: 700}}>Destination (Container)</TableCell>
                                        <TableCell sx={{fontWeight: 700}} align="center">Mode</TableCell>
                                        <TableCell sx={{fontWeight: 700}} align="center">RW</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {inspect.mounts.map((mount, index) => (
                                        <TableRow key={index} hover>
                                            <TableCell>
                                                <Chip label={mount.Type} size="small" variant="outlined"/>
                                            </TableCell>
                                            <TableCell sx={{
                                                fontFamily: 'monospace',
                                                fontSize: '0.75rem'
                                            }}>{mount.Source}</TableCell>
                                            <TableCell sx={{
                                                fontFamily: 'monospace',
                                                fontSize: '0.75rem'
                                            }}>{mount.Destination}</TableCell>
                                            <TableCell align="center">{mount.Mode || '-'}</TableCell>
                                            <TableCell align="center">
                                                <Chip
                                                    label={mount.RW ? 'Read-Write' : 'Read-Only'}
                                                    size="small"
                                                    color={mount.RW ? 'success' : 'warning'}
                                                    sx={{fontSize: '0.7rem'}}
                                                />
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    </Box>
                )}
            </Stack>
        </Box>
    );
}

export default InspectTabInfo;
