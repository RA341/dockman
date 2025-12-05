import {useState} from 'react';
import {
    Autocomplete,
    Box,
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    TextField,
    Typography
} from '@mui/material';
import {ContainerTable} from './components/container-info-table';
import {getWSUrl} from "../../lib/api.ts";
import {useDockerCompose} from '../../hooks/docker-compose.ts';
import {useContainerExec} from "./state/state.tsx";
import {ComposeActionHeaders} from "./components/compose-action-buttons.tsx";

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

    const [showExecDialog, setShowExecDialog] = useState(false)
    const [containerId, setContainerId] = useState("")
    const [containerName, setContainerName] = useState("")

    function showDialog(containerId: string, containerName: string) {
        setContainerName(containerName);
        setContainerId(containerId);
        setShowExecDialog(true)
    }

    const closeExecDialog = () => {
        setContainerName("");
        setContainerId("");
        setShowExecDialog(false)
    }

    const commandOptions = ["/bin/sh", "/bin/bash", "sh", "bash", "zsh"];
    const [selectedCmd, setSelectedCmd] = useState<string>('/bin/sh');
    const handleConnect = (containerId: string, containerName: string, cmd: string) => {
        const encodedCmd = encodeURIComponent(cmd);
        const url = getWSUrl(`docker/exec/${containerId}?cmd=${encodedCmd}`)
        execContainer(`${selectedPage}: exec-${containerName}`, url, true)
        closeExecDialog()
    }

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
                        onExec={showDialog}
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

            <Dialog open={showExecDialog} onClose={closeExecDialog}>
                <DialogTitle>Choose exec entrypoint</DialogTitle>
                <DialogContent sx={{overflow: 'visible'}}>
                    <Autocomplete
                        freeSolo
                        options={commandOptions}
                        value={selectedCmd}
                        onInputChange={(_, value) => setSelectedCmd(value)}
                        sx={{flex: 1}}
                        renderInput={(params) => (
                            <TextField
                                {...params}
                                label="Shell Command"
                                variant="outlined"
                                size="small"
                                slotProps={{
                                    inputLabel: {style: {color: '#aaa'}},
                                    input: {
                                        ...params.InputProps,
                                        style: {color: '#fff', backgroundColor: '#333'}
                                    }
                                }}
                            />
                        )}
                    />
                    <Button
                        variant="contained"
                        onClick={() => handleConnect(containerId, containerName, selectedCmd)}
                        color="primary"
                        sx={{mt: 2}}
                    >
                        Connect
                    </Button>
                </DialogContent>
                <DialogActions>
                    <Button onClick={closeExecDialog} color="primary">Close</Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}
