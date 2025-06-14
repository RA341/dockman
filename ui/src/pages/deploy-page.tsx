import {useEffect, useState} from 'react';
import {
    Box,
    Button,
    Chip,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Paper,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Typography
} from '@mui/material';
import {
    Delete as DeleteIcon,
    PlayArrow as PlayArrowIcon,
    RestartAlt as RestartAltIcon,
    Stop as StopIcon,
    Update as UpdateIcon,
} from '@mui/icons-material';
import {type ContainerList, DockerService, type Port} from "../gen/docker/v1/docker_pb.ts";
import {callRPC, useClient} from '../lib/api.ts';
import {useSnackbar} from "../components/snackbar.tsx";
import {trim} from "../lib/utils.ts";

interface DeployPageProps {
    selectedPage: string
}

export function DeployPage({selectedPage}: DeployPageProps) {
    const dockerService = useClient(DockerService);
    const {showSuccess, showWarning} = useSnackbar();

    const [error, setError] = useState<string>("");
    const [loadingStates, setLoadingStates] = useState<Record<string, boolean>>({});
    const [containers, setContainers] = useState<ContainerList[]>([]);

    useEffect(() => {
        if (!selectedPage) {
            setContainers([]);
            return;
        }

        const fetchContainers = async () => {
            const {val, err} = await callRPC(() => dockerService.list({filename: selectedPage}));
            if (err) {
                showWarning(`Failed to refresh containers: ${err}`);
                setContainers([]);
            } else {
                setContainers(val?.list || []);
            }
        };

        fetchContainers();
        const intervalId = setInterval(fetchContainers, 5000);
        return () => clearInterval(intervalId);
    }, [selectedPage, dockerService, showWarning]);

    const handleActionStart = (actionName: string) => {
        setLoadingStates(prev => ({...prev, [actionName]: true}));
    };

    const handleActionEnd = (actionName: string) => {
        setLoadingStates(prev => ({...prev, [actionName]: false}));
    };

    const handleCloseError = () => {
        setError("");
    };

    const deployActions = [
        {
            name: 'start',
            icon: <PlayArrowIcon/>,
            handler: async () => {
                handleActionStart('start');
                const {err} = await callRPC(() => dockerService.start({filename: selectedPage}));
                if (err) {
                    setError(`Failed to start deployment: ${err}`);
                } else {
                    showSuccess('Deployment started successfully!')
                }
                handleActionEnd('start');
            }
        },
        {
            name: 'stop',
            icon: <StopIcon/>,
            handler: async () => {
                handleActionStart('stop');
                const {err} = await callRPC(() => dockerService.stop({filename: selectedPage}));
                if (err) {
                    setError(`Failed to stop deployment: ${err}`);
                } else {
                    showSuccess('Deployment stopped successfully!');
                }
                handleActionEnd('stop');
            }
        },
        {
            name: 'remove',
            icon: <DeleteIcon/>,
            handler: async () => {
                handleActionStart('remove');
                const {err} = await callRPC(() => dockerService.remove({filename: selectedPage}));
                if (err) {
                    setError(`Failed to remove deployment: ${err}`);
                } else {
                    showSuccess('Deployment removed successfully!');
                }
                handleActionEnd('remove');
            }
        },
        {
            name: 'restart',
            icon: <RestartAltIcon/>,
            handler: async () => {
                handleActionStart('restart');
                // todo
                // const {err} = await callRPC(() => dockerService.restart({filename: selectedPage}));
                // if (err) {
                //     setError(`Failed to restart deployment: ${err}`);
                // } else {
                //     showSuccess('Deployment restarted successfully!'}
                // }
                handleActionEnd('restart');
            }
        },
        {
            name: 'update',
            icon: <UpdateIcon/>,
            handler: async () => {
                handleActionStart('update');
                const {err} = await callRPC(() => dockerService.update({filename: selectedPage}));
                if (err) {
                    setError(`Failed to update deployment: ${err}`);
                } else {
                    showSuccess('Deployment updated successfully!');
                }
                handleActionEnd('update');
            }
        },
    ];

    const getStatusChipColor = (status: string): "success" | "warning" | "default" | "error" => {
        if (status.toLowerCase().startsWith('up')) return 'success';
        if (status.toLowerCase().startsWith('exited')) return 'error';
        if (status.toLowerCase().includes('restarting')) return 'warning';
        return 'default';
    };

    const formatPorts = (ports: Port[]): string => {
        if (!ports || ports.length === 0) {
            return '—';
        }
        return ports.map(p => `${p.host}:${p.public} → :${p.private}/${p.type}`).join(', ');
    };

    return (
        <Box sx={{p: 3, height: '100%', flexGrow: 1, display: 'flex', flexDirection: 'column'}}>
            <Box sx={{display: 'flex', gap: 2, flexWrap: 'wrap', mb: 3}}>
                {deployActions.map((action) => (
                    <Button
                        key={action.name}
                        variant="outlined"
                        disabled={!selectedPage || loadingStates[action.name]}
                        onClick={action.handler}
                        startIcon={loadingStates[action.name] ?
                            <CircularProgress size={20} color="inherit"/> : action.icon}
                    >
                        {action.name.charAt(0).toUpperCase() + action.name.slice(1)}
                    </Button>
                ))}
            </Box>

            <Box
                sx={{
                    flexGrow: 1,
                    border: '2px dashed',
                    borderColor: 'rgba(255, 255, 255, 0.23)',
                    borderRadius: 1,
                    p: 2,
                    display: 'flex',
                    flexDirection: 'column',
                    backgroundColor: 'rgba(0,0,0,0.1)'
                }}
            >
                {selectedPage ? (
                    containers.length > 0 ? (
                        <TableContainer component={Paper} sx={{boxShadow: 3, borderRadius: 2}}>
                            <Table sx={{minWidth: 650}} aria-label="docker containers table">
                                {/* Table Header */}
                                <TableHead>
                                    <TableRow sx={{'& th': {border: 0}}}>
                                        <TableCell sx={{fontWeight: 'bold', color: 'text.secondary'}}>Name</TableCell>
                                        <TableCell sx={{fontWeight: 'bold', color: 'text.secondary'}}>Status</TableCell>
                                        <TableCell sx={{fontWeight: 'bold', color: 'text.secondary'}}>Image</TableCell>
                                        <TableCell sx={{fontWeight: 'bold', color: 'text.secondary'}}>Ports</TableCell>
                                    </TableRow>
                                </TableHead>

                                {/* Table Body */}
                                <TableBody>
                                    {containers.map((container) => (
                                        <TableRow
                                            key={container.id}
                                            sx={{'&:last-child td, &:last-child th': {border: 0}}}
                                        >
                                            {/* Name Cell */}
                                            <TableCell component="th" scope="row">
                                                <Typography variant="body1"
                                                            fontWeight="500">{trim(container.name, "/")}</Typography>
                                            </TableCell>

                                            {/* Status Cell */}
                                            <TableCell>
                                                <Chip
                                                    label={container.status}
                                                    color={getStatusChipColor(container.status)}
                                                    size="small"
                                                    sx={{textTransform: 'capitalize'}}
                                                />
                                            </TableCell>

                                            {/* Image Cell */}
                                            <TableCell>
                                                <Typography variant="body2" color="text.secondary"
                                                            sx={{wordBreak: 'break-all'}}>
                                                    {container.imageName}
                                                </Typography>
                                            </TableCell>

                                            {/* Ports Cell */}
                                            <TableCell>
                                                <Typography variant="body2" fontWeight="500">
                                                    {formatPorts(container.ports)}
                                                </Typography>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    ) : (
                        <Box sx={{display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%'}}>
                            <Typography variant="h6" color="text.secondary">
                                No containers found for this deployment.
                            </Typography>
                        </Box>
                    )
                ) : (
                    <Box sx={{display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%'}}>
                        <Typography variant="h5" color="text.secondary">
                            Select a page
                        </Typography>
                    </Box>
                )}
            </Box>

            {/* Error Dialog */}
            <Dialog open={error !== ""} onClose={handleCloseError}>
                <DialogTitle>Error</DialogTitle>
                <DialogContent>
                    <Typography>{error}</Typography>
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleCloseError} color="primary">
                        Close
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}