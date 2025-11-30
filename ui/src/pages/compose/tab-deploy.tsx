import {useState} from 'react';
import {
    Box,
    Button,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Typography
} from '@mui/material';
import {ContainerTable} from './components/container-info-table';
import {getWSUrl, useClient} from "../../lib/api.ts";
import {DockerService} from '../../gen/docker/v1/docker_pb.ts';
import {useDockerCompose} from '../../hooks/docker-compose.ts';
import {deployActionsConfig, useComposeAction, useContainerExec} from "./state/state.tsx";

interface DeployPageProps {
    selectedPage: string;
}

export function TabDeploy({selectedPage}: DeployPageProps) {
    // const {showError} = useSnackbar();

    const {containers, loading, fetchContainers} = useDockerCompose(selectedPage);

    const [selectedServices, setSelectedServices] = useState<string[]>([]);

    const [composeErrorDialog, setComposeErrorDialog] = useState<{ dialog: boolean; message: string }>({
        dialog: false,
        message: ''
    });

    const closeErrorDialog = () => setComposeErrorDialog(p => ({...p, dialog: false}));
    // const showErrorDialog = (message: string) => setComposeErrorDialog({dialog: true, message});

    const handleContainerLogs = (containerId: string, containerName: string) => {
        const url = getWSUrl(`docker/logs/${containerId}`)
        execContainer(`${selectedPage}: logs-${containerName}`, url, false)
    };

    const execContainer = useContainerExec(state => state.execParams)
    const handleContainerExec = (containerId: string, containerName: string) => {
        const cmd = "/bin/sh"
        const encodedCmd = encodeURIComponent(cmd);
        const url = getWSUrl(`docker/exec/${containerId}?cmd=${encodedCmd}`)
        execContainer(`${selectedPage}: exec-${containerName}`, url, true)
    };

    if (!selectedPage) {
        return (
            <Box sx={{display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%'}}>
                <Typography variant="h5" color="text.secondary">Select a deployment</Typography>
            </Box>
        );
    }

    return (
        <Box sx={{height: '100%', display: 'flex', flexDirection: 'column', backgroundColor: 'background.default'}}>
            <Box sx={{flexGrow: 1, p: 3, display: 'flex', flexDirection: 'column', overflow: 'hidden'}}>
                <ComposeActionHeaders
                    selectedServices={selectedServices}
                    fetchContainers={fetchContainers}
                />
                <Box sx={{
                    flexGrow: 1, overflow: 'hidden', border: '3px ridge',
                    borderColor: 'rgba(255, 255, 255, 0.23)', borderRadius: 3, display: 'flex',
                    flexDirection: 'column', backgroundColor: 'rgb(41,41,41)'
                }}>
                    <ContainerTable
                        containers={containers}
                        loading={loading}
                        setSelectedServices={setSelectedServices}
                        selectedServices={selectedServices}
                        onShowLogs={handleContainerLogs}
                        onExec={handleContainerExec}
                    />
                </Box>
            </Box>

            <Dialog open={composeErrorDialog.dialog} onClose={closeErrorDialog}>
                <DialogTitle>Error</DialogTitle>
                <DialogContent>
                    <Typography sx={{whiteSpace: 'pre-wrap'}}>{composeErrorDialog.message}</Typography>
                </DialogContent>
                <DialogActions>
                    <Button onClick={closeErrorDialog} color="primary">Close</Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}

function ComposeActionHeaders({selectedServices, fetchContainers}: {
    selectedServices: string[];
    fetchContainers: () => Promise<void>
}) {
    const dockerService = useClient(DockerService);

    const runAction = useComposeAction(state => state.runAction)
    const activeAction = useComposeAction(state => state.activeAction)

    const handleComposeAction = (
        name: typeof deployActionsConfig[number]['name'],
        _message: string,
        rpcName: typeof deployActionsConfig[number]['rpcName'],
    ) => {
        runAction(dockerService[rpcName], name, selectedServices, () => {
            fetchContainers().then()
        })
    };

    return (
        <Box sx={{display: 'flex', gap: 2, flexWrap: 'wrap', mb: 3, flexShrink: 0}}>
            {deployActionsConfig.map((action) => (
                <Button
                    key={action.name}
                    variant="outlined"
                    disabled={!!activeAction}
                    onClick={() => handleComposeAction(action.name, action.message, action.rpcName)}
                    startIcon={
                        activeAction === action.name ?
                            <CircularProgress size={20} color="inherit"/> :
                            action.icon
                    }
                >
                    {action.name.charAt(0).toUpperCase() + action.name.slice(1)}
                </Button>
            ))}
        </Box>
    )
}