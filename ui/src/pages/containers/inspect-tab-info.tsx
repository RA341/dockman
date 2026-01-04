import {useHostClient, useRPCRunner} from "../../lib/api.ts";
import {type ReactElement, type ReactNode, useEffect} from "react";

import {DockerService} from "../../gen/docker/v1/docker_pb.ts";
import {
    Alert,
    Box,
    Button,
    Chip,
    CircularProgress,
    Divider,
    Grid,
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

import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import ImageIcon from '@mui/icons-material/Image';
import TerminalIcon from '@mui/icons-material/Terminal';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import RefreshIcon from '@mui/icons-material/Refresh';
import DnsIcon from '@mui/icons-material/Dns';
import {ContainerIcon, VolumeIcon} from "../compose/components/file-icon.tsx";
import ActionButtons from "../../components/action-buttons.tsx";
import {useContainerAction} from "./components/container-action-button.tsx";
import {formatTimeAgo} from "../../lib/table.ts";
import {Description, Label} from "@mui/icons-material";

function ContainerProcessList({containerId}: { containerId: string }) {
    const dockerClient = useHostClient(DockerService);
    const {
        val: val,
        runner: fetchTop,
        loading,
        err,
    } = useRPCRunner(() => dockerClient.containerTop({containerId}));


    useEffect(() => {
        fetchTop().then();
        const intervalId = setInterval(fetchTop, 2000)
        return () => clearInterval(intervalId)
    }, [containerId, fetchTop])

    return (
        <Paper variant="outlined"
               sx={{
                   p: 2.5,
                   borderRadius: 3,
                   height: "400px",
                   width: "800px",
                   display: 'flex',
                   flexDirection: 'column'
               }}
        >
            <Stack
                direction="row"
                alignItems="center"
                spacing={1}
                sx={{mb: 2, width: '100%'}}
            >
                <SectionHeader title="Processes" icon={<TerminalIcon/>}/>
                <Chip
                    label={`${val?.top?.proc.length ?? 0} Active`}
                    size="small"
                    color="primary"
                    sx={{fontWeight: 700, fontSize: '0.65rem'}}
                />
            </Stack>

            <Divider sx={{mb: 2, borderStyle: 'dashed'}}/>


            <Box sx={{flexGrow: 1, overflow: 'auto', minHeight: 0}}>
                {loading && !val ? (
                    <Box sx={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        py: 8,
                        gap: 2
                    }}>
                        <CircularProgress size={28} thickness={5}/>
                        <Typography variant="caption" color="text.secondary">Interrogating container...</Typography>
                    </Box>
                ) : err ? (
                    <Alert severity="error" variant="outlined" sx={{borderRadius: 2}}>
                        {err}
                    </Alert>
                ) : val ? (
                    <TableContainer sx={{flexGrow: 1, overflow: 'auto'}}>
                        <Table size="small" stickyHeader>
                            <TableHead>
                                <TableRow>
                                    {val?.top?.Titles.map((title, idx) => (
                                        <TableCell key={idx} sx={headerStyles}>
                                            {title}
                                        </TableCell>
                                    ))}
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {val?.top?.proc.map((p, rowIdx) => (
                                    <TableRow key={rowIdx} hover sx={{'&:last-child td': {border: 0}}}>
                                        {p.Processes.map((value, colIdx) => (
                                            <TableCell
                                                key={colIdx}
                                                sx={{
                                                    fontFamily: 'monospace',
                                                    fontSize: '0.75rem',
                                                    color: colIdx === 0 ? 'primary.main' : 'text.primary',
                                                    fontWeight: colIdx === 0 ? 700 : 400,
                                                    whiteSpace: 'nowrap'
                                                }}
                                            >
                                                {value}
                                            </TableCell>
                                        ))}
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TableContainer>
                ) : (
                    <Box sx={{py: 4, textAlign: 'center'}}>
                        <Typography variant="body2" color="text.disabled" sx={{fontStyle: 'italic'}}>
                            No process data available
                        </Typography>
                    </Box>
                )}
            </Box>
        </Paper>
    );
}

function InspectTabInfo({containerId}: { containerId: string }) {
    const dockerClient = useHostClient(DockerService);
    const actions = useContainerAction({
        containerId: containerId,
        removeRemoveAction: true
    })
    const {
        val: inspect,
        runner: fetchInspect,
        loading, err,
    } = useRPCRunner(() => dockerClient.containerInspect({containerID: containerId}));

    useEffect(() => {
        fetchInspect().then();
    }, [fetchInspect]);

    if (loading) {
        return (
            <Box sx={{display: 'flex', justifyContent: 'center', alignItems: 'center', height: '300px'}}>
                <CircularProgress size={32} thickness={5}/>
            </Box>
        );
    }

    if (err || !inspect) {
        return (
            <Box sx={{p: 2}}>
                <Alert severity="error" variant="outlined" sx={{borderRadius: 2}}>
                    {err || "API request succeeded but an empty value was returned"}
                </Alert>
            </Box>
        );
    }

    return (
        <Box sx={{width: '100%', p: 3, minHeight: '100%'}}>
            {/* 1. Header Section */}
            <Paper variant="outlined" sx={{p: 2.5, mb: 3, borderRadius: 3, bgcolor: 'background.paper'}}>
                <Stack direction="row" alignItems="center" justifyContent="space-between">
                    <Stack direction="row" alignItems="center" spacing={2}>
                        <Box sx={{
                            p: 1.5,
                            bgcolor: 'primary.lighter',
                            borderRadius: 2,
                            color: 'primary.main',
                            display: 'flex'
                        }}>
                            <ContainerIcon/>
                        </Box>
                        <Box>
                            <Typography variant="h5" sx={{fontWeight: 800, lineHeight: 1.2}}>
                                {inspect.Name?.replace(/^\//, '')}
                            </Typography>
                            <Typography variant="caption" sx={{fontFamily: 'monospace', color: 'text.secondary'}}>
                                {inspect.ID}
                            </Typography>

                            <ActionButtons actions={actions}/>
                        </Box>
                    </Stack>
                    <Button
                        variant="outlined"
                        color="inherit"
                        startIcon={<RefreshIcon/>}
                        onClick={fetchInspect}
                        sx={{borderRadius: 2, fontWeight: 700, px: 2}}
                    >
                        Reload
                    </Button>
                </Stack>
            </Paper>

            <Stack spacing={3}>
                {/* Metadata & Config Grid */}
                <Grid container spacing={3}>
                    <Grid size={{xs: 12, md: 6}}>
                        <Paper variant="outlined" sx={{p: 2.5, borderRadius: 3, height: '100%'}}>
                            <SectionHeader icon={<DnsIcon/>} title="General Metadata"/>
                            <Stack spacing={2} sx={{mt: 2}}>
                                <DetailRow icon={ImageIcon} label="Image" value={inspect.Image}/>
                                <DetailRow icon={TerminalIcon} label="Path" value={inspect.Path} mono/>

                                <DetailRow
                                    icon={CalendarTodayIcon}
                                    label="Created At"
                                    value={
                                        <>
                                            <Typography component="span" variant="body2">
                                                {new Date(inspect.Created).toLocaleString()}
                                            </Typography>
                                            {' '}
                                            <Typography component="span" variant="body2" sx={{color: 'info.main'}}>
                                                ({formatTimeAgo(new Date(inspect.Created))})
                                            </Typography>
                                        </>
                                    }
                                />
                                <DetailRow icon={FolderOpenIcon} label="Hosts Path" value={inspect.HostsPath} mono/>
                            </Stack>
                        </Paper>
                    </Grid>

                    <Grid sx={{xs: 12, md: 6}}>
                        <Paper variant="outlined" sx={{p: 2.5, borderRadius: 3, height: '100%'}}>
                            <SectionHeader icon={<TerminalIcon/>} title="Runtime Config"/>
                            <Stack spacing={2} sx={{mt: 2}}>
                                <DetailRow label="Working Dir" value={inspect.config?.WorkingDir} mono/>
                                <DetailRow label="User" value={inspect.config?.User || 'root'}/>
                                <DetailRow label="Hostname" value={inspect.config?.Hostname} mono/>
                                <Box>
                                    <Typography
                                        variant="caption"
                                        color="text.disabled"
                                        sx={{
                                            fontWeight: 700,
                                            textTransform: 'uppercase',
                                            fontSize: '0.65rem'
                                        }}>
                                        Command
                                    </Typography>
                                    <Typography variant="body2" sx={{
                                        fontFamily: 'monospace',
                                        p: 1,
                                        borderRadius: 1,
                                        mt: 0.5,
                                        fontSize: '0.75rem',
                                        wordBreak: 'break-all'
                                    }}>
                                        {inspect.config?.Cmd?.join(' ') || 'N/A'}
                                    </Typography>
                                </Box>
                            </Stack>
                        </Paper>
                    </Grid>

                    <Grid container spacing={3}>
                        {/* 3. Environment Variables */}
                        <Grid sx={{xs: 12, md: 6}}>
                            <Box sx={{display: 'flex', flexDirection: 'column', height: '100%'}}>
                                <Paper variant="outlined" sx={{
                                    p: 2.5,
                                    mt: 1,
                                    borderRadius: 3,
                                    overflow: 'hidden',
                                    flexGrow: 1,
                                    display: 'flex',
                                    flexDirection: 'column'
                                }}>
                                    <SectionHeader icon={<Description/>} title="Environment Variables"/>
                                    {inspect.config?.Env && inspect.config.Env.length > 0 ? (
                                        <TableContainer sx={{maxHeight: 400,}}>
                                            <Table size="small" stickyHeader>
                                                <TableHead>
                                                    <TableRow>
                                                        <TableCell sx={headerStyles}>Key</TableCell>
                                                        <TableCell sx={headerStyles}>Value</TableCell>
                                                    </TableRow>
                                                </TableHead>
                                                <TableBody>
                                                    {inspect.config.Env.map((env, i) => {
                                                        const [key, ...valParts] = env.split('=');
                                                        const value = valParts.join('=');
                                                        return (
                                                            <TableRow key={i} hover
                                                                      sx={{'&:last-child td': {border: 0}}}>
                                                                <TableCell sx={{
                                                                    fontWeight: 700,
                                                                    color: 'primary.main',
                                                                    width: '35%',
                                                                    fontSize: '0.75rem'
                                                                }}>
                                                                    {key}
                                                                </TableCell>
                                                                <TableCell sx={{
                                                                    fontFamily: 'monospace',
                                                                    fontSize: '0.75rem',
                                                                    wordBreak: 'break-all'
                                                                }}>
                                                                    {value}
                                                                </TableCell>
                                                            </TableRow>
                                                        );
                                                    })}
                                                </TableBody>
                                            </Table>
                                        </TableContainer>
                                    ) : (
                                        <EmptyState message="No environment variables found"/>
                                    )}
                                </Paper>
                            </Box>
                        </Grid>

                        {/* 4. Labels */}
                        <Grid sx={{xs: 12, md: 6}}>
                            <Box sx={{display: 'flex', flexDirection: 'column', height: '100%'}}>
                                <Paper variant="outlined" sx={{
                                    p: 2.5,
                                    mt: 1,
                                    borderRadius: 3,
                                    overflow: 'hidden',
                                    flexGrow: 1,
                                    display: 'flex',
                                    flexDirection: 'column'
                                }}>
                                    <SectionHeader icon={<Label/>} title="Labels"/>
                                    {inspect.config?.Labels && Object.keys(inspect.config.Labels).length > 0 ? (
                                        <TableContainer sx={{maxHeight: 400}}>
                                            <Table size="small" stickyHeader>
                                                <TableHead>
                                                    <TableRow>
                                                        <TableCell sx={headerStyles}>Key</TableCell>
                                                        <TableCell sx={headerStyles}>Value</TableCell>
                                                    </TableRow>
                                                </TableHead>
                                                <TableBody>
                                                    {Object.entries(inspect.config.Labels).map(([k, v], i) => (
                                                        <TableRow key={i} hover sx={{'&:last-child td': {border: 0}}}>
                                                            <TableCell
                                                                sx={{
                                                                    fontWeight: 700,
                                                                    width: '35%',
                                                                    fontSize: '0.75rem'
                                                                }}>
                                                                {k}
                                                            </TableCell>
                                                            <TableCell sx={{
                                                                fontFamily: 'monospace',
                                                                fontSize: '0.75rem',
                                                                wordBreak: 'break-all'
                                                            }}>
                                                                {v}
                                                            </TableCell>
                                                        </TableRow>
                                                    ))}
                                                </TableBody>
                                            </Table>
                                        </TableContainer>
                                    ) : (
                                        <EmptyState message="No labels found"/>
                                    )}
                                </Paper>
                            </Box>
                        </Grid>
                    </Grid>

                    <Grid sx={{xs: 12, md: 6}}>
                        <ContainerProcessList containerId={inspect.ID}/>
                    </Grid>

                    <Grid sx={{xs: 12, md: 6}}>
                        {/* Volume Mounts */}
                        <Paper variant="outlined"
                               sx={{
                                   p: 2.5,
                                   borderRadius: 3,
                                   height: "400px",
                                   width: "800px",
                                   display: 'flex',
                                   flexDirection: 'column'
                               }}
                        >
                            <Typography
                                variant="overline"
                                sx={{
                                    px: 1,
                                    fontWeight: 800,
                                    color: 'text.secondary'
                                }}>

                            </Typography>
                            <SectionHeader icon={<VolumeIcon/>} title="Volume Mounts"/>
                            {inspect.mounts && inspect.mounts.length < 1 ?
                                (
                                    <Box sx={{p: 2}}>
                                        <Alert severity="info" variant="outlined"
                                               sx={{borderRadius: 2, textAlign: 'center'}}>
                                            {err || "No mounts found"}
                                        </Alert>
                                    </Box>
                                ) : (
                                    <TableContainer component={Paper} variant="outlined" sx={{mt: 1, borderRadius: 3}}>
                                        <Table size="small">
                                            <TableHead sx={{}}>
                                                <TableRow>
                                                    <TableCell sx={tableHeaderStyle}>Type</TableCell>
                                                    <TableCell sx={tableHeaderStyle}>Source (Host)</TableCell>
                                                    <TableCell sx={tableHeaderStyle}>Destination (Container)</TableCell>
                                                    <TableCell sx={tableHeaderStyle} align="center">RW</TableCell>
                                                </TableRow>
                                            </TableHead>
                                            <TableBody>
                                                {inspect.mounts.map((mount, index) => (
                                                    <TableRow key={index} hover>
                                                        <TableCell>
                                                            <Chip
                                                                label={mount.Type}
                                                                size="small"
                                                                color="info"
                                                                sx={{fontWeight: 700, fontSize: '0.65rem'}}
                                                            />
                                                        </TableCell>
                                                        <TableCell sx={{
                                                            fontFamily: 'monospace',
                                                            fontSize: '0.75rem'
                                                        }}>
                                                            {mount.Source}
                                                        </TableCell>
                                                        <TableCell sx={{
                                                            fontFamily: 'monospace',
                                                            fontSize: '0.75rem',
                                                            fontWeight: 600
                                                        }}>
                                                            {mount.Destination}
                                                        </TableCell>
                                                        <TableCell align="center">
                                                            <Chip
                                                                label={mount.RW ? 'Read-Write' : 'Read-Only'}
                                                                size="small"
                                                                variant="outlined"
                                                                color={mount.RW ? 'success' : 'warning'}
                                                                sx={{fontSize: '0.65rem', fontWeight: 700}}
                                                            />
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </TableContainer>
                                )
                            }
                        </Paper>
                    </Grid>
                </Grid>
            </Stack>
        </Box>
    );
}

const headerStyles = {
    fontWeight: 700,
    fontSize: '0.65rem',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    bgcolor: 'background.paper',
    py: 1,
    borderBottom: '2px solid',
    borderColor: 'divider'
};

const EmptyState = ({message}: { message: string }) => (
    <Box sx={{
        p: 4,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        flexGrow: 1,
        minHeight: '120px'
    }}>
        <Typography variant="body2" color="text.disabled" sx={{fontStyle: 'italic'}}>
            {message}
        </Typography>
    </Box>
);

const tableHeaderStyle = {
    fontWeight: 700,
    fontSize: '0.7rem',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    py: 1.5
};

const SectionHeader = ({icon, title}: { icon: ReactNode, title: string }) => (
    <Stack direction="row" spacing={1} alignItems="center" sx={{mb: 1}}>
        {icon}
        <Typography variant="subtitle2" sx={{fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.02em'}}>
            {title}
        </Typography>
    </Stack>
);

const DetailRow = ({icon: Icon, label, value, mono}: {
    icon?: any, label: string, value?: string | ReactElement, mono?: boolean
}) => (
    <Box>
        <Typography
            variant="caption"
            color="text.disabled"
            sx={{
                fontWeight: 700,
                textTransform: 'uppercase',
                fontSize: '0.65rem',
                display: 'block'
            }}>
            {label}
        </Typography>
        <Stack direction="row" spacing={1} alignItems="center" sx={{mt: 0.2}}>
            {Icon && <Icon sx={{fontSize: 14, color: 'text.disabled'}}/>}
            {typeof value === 'string' ?
                <Typography
                    variant="body2"
                    sx={{
                        fontWeight: 600,
                        fontFamily: mono ? 'monospace' : 'inherit',
                        wordBreak: 'break-all',
                        fontSize: mono ? '0.75rem' : '0.85rem'
                    }}
                >
                    {value || '—'}
                </Typography>
                : value
            }
        </Stack>
    </Box>
);

export default InspectTabInfo;
