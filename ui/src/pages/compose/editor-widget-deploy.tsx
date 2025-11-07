import {
    Box,
    Button,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Typography
} from "@mui/material";
import {useState} from "react";
import {transformAsyncIterable, useClient} from "../../lib/api";
import {useSnackbar} from "../../hooks/snackbar.ts";
import {DockerService} from "../../gen/docker/v1/docker_pb.ts";
import {
    activeActionAtom,
    activeTerminalAtom,
    deployActionsConfig,
    isTerminalPanelOpenAtom,
    type LogTab,
    openTerminalsAtom
} from "./state.tsx";
import {useAtom} from "jotai";
import {useDockerCompose} from "../../hooks/docker-compose.ts";

function EditorDeployWidget({selectedPage}: { selectedPage: string }) {
    const dockerService = useClient(DockerService);
    const {fetchContainers} = useDockerCompose(selectedPage);

    const [composeErrorDialog, setComposeErrorDialog] = useState<{ dialog: boolean; message: string }>({
        dialog: false,
        message: ''
    });
    const closeErrorDialog = () => setComposeErrorDialog(p => ({...p, dialog: false}));
    const showErrorDialog = (message: string) => setComposeErrorDialog({dialog: true, message});
    const {showSuccess} = useSnackbar();
    const [activeAction, setActiveAction] = useAtom(activeActionAtom);

    const [, setLogTabs] = useAtom(openTerminalsAtom);
    const [, setActiveTabId] = useAtom(activeTerminalAtom);

    const [, setIsLogPanelMinimized] = useAtom(isTerminalPanelOpenAtom);
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

    const handleComposeAction = (
        name: typeof deployActionsConfig[number]['name'],
        message: string,
        rpcName: typeof deployActionsConfig[number]['rpcName'],
    ) => {
        setActiveAction(name);
        // unique ID and title for the new tab
        const tabId = `${name}-${Date.now()}`;
        const tabTitle = `${name} - ${selectedPage.split('/').pop() || selectedPage}`;

        createStream({
            id: tabId,
            title: tabTitle,
            getStream: signal => dockerService[rpcName]({
                filename: selectedPage,
                selectedServices: [], // services by default
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

    return (
        <>
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

            <Dialog open={composeErrorDialog.dialog} onClose={closeErrorDialog}>
                <DialogTitle>Error</DialogTitle>
                <DialogContent>
                    <Typography sx={{whiteSpace: 'pre-wrap'}}>{composeErrorDialog.message}</Typography>
                </DialogContent>
                <DialogActions>
                    <Button onClick={closeErrorDialog} color="primary">Close</Button>
                </DialogActions>
            </Dialog>
        </>
    );
}

export default EditorDeployWidget