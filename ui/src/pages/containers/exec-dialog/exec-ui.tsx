import {
    Autocomplete,
    Box,
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    IconButton,
    TextField
} from '@mui/material'; // Or your preferred UI library
import CloseIcon from "@mui/icons-material/Close";
import {useSnackbar} from "../../../hooks/snackbar.ts";
import {callRPC, transformAsyncIterable, useClient} from "../../../lib/api.ts";
import LogsTerminal from "../../compose/components/logs-terminal.tsx";
import {useEffect, useRef, useState} from "react";
import {DockerService, type LogsMessage} from "../../../gen/docker/v1/docker_pb.ts";

interface ExecDialogProps {
    show: boolean;
    hide: () => void;
    name: string;
    containerID: string;
}

export const ExecDialog = ({show, hide, name, containerID}: ExecDialogProps) => {
    const {showError, showInfo} = useSnackbar()
    const dockerService = useClient(DockerService);

    const [panelTitle, setPanelTitle] = useState('');
    const [logStream, setLogStream] = useState<AsyncIterable<string> | null>(null);
    const [selectedCmd, setSelectedCmd] = useState<string>('/bin/sh');
    const [connected, setConnected] = useState(false);

    const abortControllerRef = useRef<AbortController | null>(null);

    const commandOptions = ["/bin/sh", "/bin/bash", "sh", "bash", "zsh"];

    useEffect(() => {
        if (containerID) {
            setPanelTitle(`Exec - ${name}`);
        }

        return () => {
            abortControllerRef.current?.abort()
            setPanelTitle('')
            setLogStream(null)
            setConnected(false)
        };
    }, [containerID, name]);

    const manageStream = <T, >({getStream, transform}: {
        getStream: (signal: AbortSignal) => AsyncIterable<T>;
        transform: (item: T) => string;
    }) => {
        abortControllerRef.current?.abort("User started a new action");
        const newController = new AbortController();
        abortControllerRef.current = newController;

        const sourceStream = getStream(newController.signal);
        const transformedStream = transformAsyncIterable(sourceStream, {
            transform,
            onComplete: () => showInfo("Stream completed successfully."),
            onError: error => showError(`Stream error: ${error}`),
            onFinally: () => {
                if (abortControllerRef.current === newController) {
                    abortControllerRef.current = null;
                }
            },
        });

        setLogStream(transformedStream);
    };

    const handleConnect = () => {
        if (!containerID) return;

        manageStream<LogsMessage>({
            getStream: signal => dockerService.containerExecOutput({
                containerID: containerID,
                execCmd: selectedCmd.trim().split(' ')
            }, {signal}),
            transform: item => item.message,
        });

        setConnected(true);
    };

    function handleInput(cmd: string) {
        callRPC(() => dockerService.containerExecInput(
            {containerID: containerID, userCmd: cmd}
        )).catch((err) => {
            showError(`unable to send cmd: ${err}`)
        })
    }

    return (
        <Dialog
            open={show}
            onClose={hide}
            fullWidth
            maxWidth="md"
            scroll="paper"
            slotProps={{
                paper: {
                    sx: {
                        borderRadius: '12px',
                        backgroundColor: '#2e2e2e',
                        color: '#ffffff'
                    }
                }
            }}
        >
            <DialogTitle sx={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                backgroundColor: '#2e2e2e',
                color: '#ffffff',
                borderBottom: '1px solid #333'
            }}>
                {panelTitle}
                <IconButton
                    onClick={hide}
                    sx={{
                        color: '#ffffff',
                        '&:hover': {
                            backgroundColor: '#333'
                        }
                    }}
                >
                    <CloseIcon/>
                </IconButton>
            </DialogTitle>
            <DialogContent dividers sx={{p: 0, backgroundColor: '#000'}}>
                {!connected ? (
                    <Box sx={{p: 2, display: 'flex', flexDirection: 'row', gap: 1, alignItems: 'center'}}>
                        <Autocomplete
                            freeSolo
                            options={commandOptions}
                            value={selectedCmd}
                            onInputChange={(_, value) => setSelectedCmd(value)}
                            sx={{flex: 1}}
                            renderInput={(params) => (
                                <TextField
                                    {...params}
                                    label="Initial Command"
                                    variant="outlined"
                                    size="small"
                                    InputLabelProps={{style: {color: '#aaa'}}}
                                    InputProps={{
                                        ...params.InputProps,
                                        style: {color: '#fff'}
                                    }}
                                />
                            )}
                        />
                        <Button
                            variant="contained"
                            onClick={handleConnect}
                            sx={{whiteSpace: 'nowrap'}}
                        >
                            Connect
                        </Button>
                    </Box>
                ) : (
                    <LogsTerminal
                        isActive={true}
                        logStream={logStream}
                        inputFunc={handleInput}
                    />
                )}
            </DialogContent>
            <DialogActions sx={{
                backgroundColor: '#2e2e2e',
                borderTop: '1px solid #333'
            }}>
                <Box sx={{height: '25px'}}/>
            </DialogActions>
        </Dialog>
    )
}

export default ExecDialog;
