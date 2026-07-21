import {useMemo, useState} from 'react';
import {
    Autocomplete,
    Box,
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Link,
    Stack,
    TextField,
    Typography
} from '@mui/material';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import {ContainerTable} from './components/container-info-table';
import {useContainerExecWsUrl} from "../../lib/api.ts";
import {useDockerCompose} from '../../hooks/docker-compose.ts';
import {useContainerExec, useFileComponents, useLogsPanel} from "./state/terminal.tsx";
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

    // logs open in the bottom panel, next to terminals; tabs display a short
    // stack/container name but are keyed on the full host/alias/file path so
    // same-named stacks in different folders never collide
    const openLogs = useLogsPanel(state => state.openLogs)
    const {host, alias} = useFileComponents()

    const stackName = useMemo(() => {
        const parts = selectedPage.split('/');
        return parts.length > 1 ? parts[parts.length - 2] : selectedPage;
    }, [selectedPage]);

    const tabKey = (kind: string, target: string) =>
        `${kind}:${host}/${alias}/${selectedPage}#${target}`;

    const handleContainerLogs = (containerId: string, containerName: string) => {
        openLogs(
            tabKey('logs', containerName),
            `${stackName}/${containerName}`,
            [{id: containerId, name: containerName}],
        )
    };

    const stackTargets = useMemo(
        () => containers.map(c => ({id: c.id, name: c.serviceName || c.name})),
        [containers],
    );

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

    const commandOptions = ["/bin/sh", "/bin/bash", "sh", "bash", "zsh", "fish"];
    const [selectedCmd, setSelectedCmd] = useState<string>('/bin/sh');
    const debugImageOptions = ["nixery.dev/shell/fish", "nixery.dev/shell/bash", "nixery.dev/shell/zsh"];
    const [debuggerImage, setDebuggerImage] = useState("")
    const createExecUrl = useContainerExecWsUrl()

    const handleConnect = (containerId: string, containerName: string, cmd: string) => {
        const url = createExecUrl(containerId, cmd, debuggerImage)
        execContainer(tabKey('exec', containerId), `${stackName}/${containerName} (exec)`, url, true)
        closeExecDialog()
    }

    if (!selectedPage) {
        return (
            <Box sx={{display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%'}}>
                <Typography variant="h5" sx={{
                    color: "text.secondary"
                }}>Select a deployment</Typography>
            </Box>
        );
    }

    return (
        <Box sx={{
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: 'background.default'
        }}>
            <Box sx={{
                flexGrow: 1,
                p: 1,
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden'
            }}>
                <Stack
                    direction="row"
                    spacing={2}
                    sx={{
                        alignItems: "center",
                        mb: 1
                    }}>
                    <ComposeActionHeaders
                        selectedServices={selectedServices}
                        fetchContainers={fetchContainers}
                    />
                    <Box sx={{flexGrow: 1}}/>
                    <Button
                        variant="outlined"
                        size="small"
                        startIcon={<ReceiptLongIcon sx={{fontSize: 17}}/>}
                        disabled={stackTargets.length === 0}
                        onClick={() => openLogs(tabKey('logs', '__stack__'), `${stackName}: stack logs`, stackTargets)}
                        sx={{
                            flexShrink: 0,
                            textTransform: 'none',
                            fontWeight: 600,
                            borderColor: 'divider',
                            color: 'text.secondary',
                            '&:hover': {borderColor: 'primary.main', color: 'primary.main', bgcolor: 'action.hover'},
                        }}
                    >
                        Stack logs
                    </Button>
                </Stack>
                <Box sx={{
                    height: '100%',
                    display: 'flex',
                    flexGrow: 1,
                    overflow: 'hidden',
                    border: '1px solid',
                    borderColor: 'divider',
                    borderRadius: 2,
                    flexDirection: 'column',
                    backgroundColor: 'background.paper'
                }}>
                    <ContainerTable
                        containers={containers}
                        loading={loading}
                        setSelectedServices={setSelectedServices}
                        selectedServices={selectedServices}
                        onLogs={handleContainerLogs}
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
                                    ...params.slotProps,
                                    inputLabel: {
                                        ...params.slotProps.inputLabel,
                                        style: {color: '#aaa'}
                                    },
                                    input: {
                                        ...params.slotProps.input,
                                        style: {color: '#fff', backgroundColor: '#333'}
                                    }
                                }}
                            />
                        )}
                    />

                    <Box sx={{width: '100%', maxWidth: 400, display: 'flex', gap: 1, alignItems: 'center'}}>
                        <Typography>
                            Dockman Debug
                        </Typography>
                        <Autocomplete
                            freeSolo
                            options={debugImageOptions}
                            value={debuggerImage}
                            onInputChange={(_, value) => setDebuggerImage(value)}
                            sx={{flex: 1}}
                            renderInput={(params) => (
                                <TextField
                                    {...params}
                                    label="Debugger Image"
                                    variant="outlined"
                                    size="small"
                                    slotProps={{
                                        ...params.slotProps,
                                        inputLabel: {
                                            ...params.slotProps.inputLabel,
                                            style: {color: '#aaa'}
                                        },
                                        input: {
                                            ...params.slotProps.input,
                                            style: {color: '#fff', backgroundColor: '#333'}
                                        }
                                    }}
                                />
                            )}
                        />
                    </Box>
                    <Typography>
                        Exec into any container using a custom image {' '}
                        <Link
                            href={"https://dockman.radn.dev/docs/dockman-debug/overview"}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label="Read more on GitHub (opens in a new tab)"
                            sx={{
                                color: '#60a5fa',
                                fontWeight: 'medium',
                                '&:hover': {
                                    color: '#93c5fd',
                                }
                            }}
                        >
                            more info
                        </Link>
                    </Typography>
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
