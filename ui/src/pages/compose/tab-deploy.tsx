import {useEffect, useState} from 'react';
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
import {
    Delete as DeleteIcon,
    PlayArrow as PlayArrowIcon,
    RestartAlt as RestartAltIcon,
    Stop as StopIcon,
    Update as UpdateIcon
} from '@mui/icons-material';
import {ContainerTable} from './components/container-info-table';
import {LogsPanel} from './components/logs-panel';
import {callRPC, transformAsyncIterable, useClient} from "../../lib/api.ts";
import {DockerService} from '../../gen/docker/v1/docker_pb.ts';
import {useDockerCompose} from '../../hooks/docker-compose.ts';
import {useSnackbar} from "../../hooks/snackbar.ts";

const deployActionsConfig = [
    {name: 'start', rpcName: 'composeStart', message: "started", icon: <PlayArrowIcon/>},
    {name: 'stop', rpcName: 'composeStop', message: "stopped", icon: <StopIcon/>},
    {name: 'remove', rpcName: 'composeRemove', message: "removed", icon: <DeleteIcon/>},
    {name: 'restart', rpcName: 'composeRestart', message: "restarted", icon: <RestartAltIcon/>},
    {name: 'update', rpcName: 'composeUpdate', message: "updated", icon: <UpdateIcon/>},
] as const;

interface LogTab {
    id: string;
    title: string;
    stream: AsyncIterable<string>;
    controller: AbortController;
    inputFn?: (cmd: string) => void,
}

interface DeployPageProps {
    selectedPage: string;
}

export function TabDeploy({selectedPage}: DeployPageProps) {
    const dockerService = useClient(DockerService);
    const {containers, fetchContainers, loading} = useDockerCompose(selectedPage);
    const {showSuccess, showError} = useSnackbar();

    const [activeAction, setActiveAction] = useState<string | null>(null);
    const [isLogPanelMinimized, setIsLogPanelMinimized] = useState(true);
    const [selectedServices, setSelectedServices] = useState<string[]>([]);

    // State is now an array of tabs and an active tab ID
    const [logTabs, setLogTabs] = useState<LogTab[]>([]);
    const [activeTabId, setActiveTabId] = useState<string | null>(null);

    const [composeErrorDialog, setComposeErrorDialog] = useState<{ dialog: boolean; message: string }>({
        dialog: false,
        message: ''
    });

    const closeErrorDialog = () => setComposeErrorDialog(p => ({...p, dialog: false}));
    const showErrorDialog = (message: string) => setComposeErrorDialog({dialog: true, message});

    useEffect(() => {
        // On unmount, abort all active streams
        return () => {
            logTabs.forEach(tab => tab.controller.abort("Component unmounted"));
        };
    }, [logTabs]);

    const handleComposeAction = (
        name: typeof deployActionsConfig[number]['name'],
        message: string,
        rpcName: typeof deployActionsConfig[number]['rpcName'],
    ) => {
        setActiveAction(name);
        // Create a unique ID and title for the new tab
        const tabId = `${name}-${Date.now()}`;
        const tabTitle = `${name} - ${selectedPage.split('/').pop() || selectedPage}`;

        createStream({
            id: tabId,
            title: tabTitle,
            getStream: signal => dockerService[rpcName]({
                filename: selectedPage,
                selectedServices: selectedServices,
            }, {signal}),
            transform: item => item.message,
            onSuccess: () => {
                showSuccess(`Deployment ${message} successfully`)
                setIsLogPanelMinimized(true);
            },
            onFinalize: () => {
                setActiveAction('');
                fetchContainers().then();
            }
        });
    };

    const handleContainerLogs = (containerId: string, containerName: string) => {
        const tabId = `logs:${containerId}`
        // If a tab for this container already exists, just switch to it
        const existingTab = logTabs.find(tab => tab.id === tabId);
        if (existingTab) {
            setActiveTabId(tabId);
            setIsLogPanelMinimized(false);
            return;
        }

        createStream({
            id: tabId,
            title: `Logs - ${containerName}`,
            getStream: signal => dockerService.containerLogs({containerID: containerId}, {signal}),
            transform: item => item.message,
        });
    };

    const handleContainerExec = (containerId: string, containerName: string) => {
        const cmd = "/bin/sh"
        const tabId = `exec:${containerId}`

        const existingTab = logTabs.find(tab => tab.id === tabId);
        if (existingTab) {
            setActiveTabId(tabId);
            setIsLogPanelMinimized(false);
            return;
        }

        createStream({
            id: tabId,
            title: `Exec - ${containerName}`,
            getStream: signal => dockerService.containerExecOutput({
                    containerID: containerId,
                    execCmd: cmd.trim().split(' ')
                },
                {signal}
            ),
            transform: item => item.message,
            inputFn: (cmd: string) => {
                callRPC(() => dockerService.containerExecInput({
                    containerID: containerId,
                    userCmd: cmd
                })).catch((err) => {
                    showError(`unable to send cmd: ${err}`)
                })
            }
        });
    };

    const createStream = <T, >(
        {
            id, getStream, transform, title, onSuccess, onFinalize, inputFn
        }:
        {
            id: string;
            getStream: (signal: AbortSignal) => AsyncIterable<T>;
            transform: (item: T) => string;
            title: string;
            inputFn?: (cmd: string) => void,
            onSuccess?: () => void;
            onFinalize?: () => void;
        }) => {
        const newController = new AbortController();
        const sourceStream = getStream(newController.signal);

        const transformedStream = transformAsyncIterable(sourceStream, {
            transform,
            onComplete: () => onSuccess?.(),
            onError: (err) => {
                // Don't show an error dialog if the stream was intentionally aborted
                if (!newController.signal.aborted) {
                    showErrorDialog(`Error streaming container logs: ${err}`);
                }
            },
            onFinally: () => onFinalize?.(),
        });

        const newTab: LogTab = {
            id,
            title,
            stream: transformedStream,
            controller: newController,
            inputFn: inputFn
        };

        setLogTabs(prev => [...prev, newTab]);
        setActiveTabId(id);
        setIsLogPanelMinimized(false); // Always expand panel for a new tab
    };

    const handleCloseTab = (tabIdToClose: string) => {
        setLogTabs(prevTabs => {
            const tabToClose = prevTabs.find(tab => tab.id === tabIdToClose);
            // abort the stream associated with the closing tab
            tabToClose?.controller.abort("Tab closed by user");

            const remainingTabs = prevTabs.filter(tab => tab.id !== tabIdToClose);

            // Adjust the active tab if the closed one was active
            if (activeTabId === tabIdToClose) {
                if (remainingTabs.length > 0) {
                    setActiveTabId(remainingTabs[remainingTabs.length - 1].id);
                } else {
                    setActiveTabId(null);
                    setIsLogPanelMinimized(true); // Minimize when last tab is closed
                }
            }
            return remainingTabs;
        });
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
                {/* Action Buttons */}
                <Box sx={{display: 'flex', gap: 2, flexWrap: 'wrap', mb: 3, flexShrink: 0}}>
                    {deployActionsConfig.map((action) => (
                        <Button
                            key={action.name}
                            variant="outlined"
                            disabled={!!activeAction}
                            onClick={() => handleComposeAction(action.name, action.message, action.rpcName)}
                            startIcon={activeAction === action.name ?
                                <CircularProgress size={20} color="inherit"/> : action.icon}
                        >
                            {action.name.charAt(0).toUpperCase() + action.name.slice(1)}
                        </Button>
                    ))}
                </Box>

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

            <LogsPanel
                tabs={logTabs}
                activeTabId={activeTabId}
                isMinimized={isLogPanelMinimized}
                onTabChange={setActiveTabId}
                onTabClose={handleCloseTab}
                onToggle={() => setIsLogPanelMinimized(prev => !prev)}
            />

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
