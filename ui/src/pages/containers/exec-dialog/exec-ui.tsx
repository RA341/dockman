import {useEffect, useRef, useState} from "react";
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
} from '@mui/material';
import CloseIcon from "@mui/icons-material/Close";
import {useSnackbar} from "../../../hooks/snackbar.ts";
import "@xterm/xterm/css/xterm.css";
import {getWSUrl} from "../../../lib/api.ts";
import AppTerminal from "../../compose/components/logs-terminal-interactive.tsx";
import {FitAddon} from "@xterm/addon-fit";
import {interactiveTermFn} from "../../compose/state/state.tsx";

export const ExecDialog = ({show, hide, name, containerID}: {
    show: boolean;
    hide: () => void;
    name: string;
    containerID: string;
}) => {
    const {showError} = useSnackbar();

    const [selectedCmd, setSelectedCmd] = useState<string>('/bin/sh');
    const [isConnected, setIsConnected] = useState(false);

    const fitAddonRef = useRef<FitAddon>(new FitAddon());
    // Reset state when dialog opens/closes or container changes
    useEffect(() => {
        if (!show) {
            setIsConnected(false);
        }
    }, [show, containerID]);

    const commandOptions = ["/bin/sh", "/bin/bash", "sh", "bash", "zsh"];

    const handleConnect = () => {
        if (!containerID) {
            showError("No container ID provided");
            return;
        }
        setIsConnected(true);
    };

    const getWsUrl = () => {
        const encodedCmd = encodeURIComponent(selectedCmd);
        return getWSUrl(`docker/exec/${containerID}?cmd=${encodedCmd}`)
    };

    return (
        <Dialog
            open={show}
            onClose={hide}
            fullWidth
            maxWidth="lg" // Made slightly larger for terminal
            scroll="paper"
            slotProps={{
                paper: {
                    sx: {
                        borderRadius: '12px',
                        backgroundColor: '#1e1e1e',
                        color: '#ffffff',
                        height: '80vh', // Fixed height for terminal
                        display: 'flex',
                        flexDirection: 'column'
                    }
                }
            }}
        >
            <DialogTitle sx={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                backgroundColor: '#252526',
                color: '#ffffff',
                borderBottom: '1px solid #333',
                p: 2
            }}>
                {name ? `Exec: ${name}` : 'Container Exec'}
                <IconButton
                    onClick={hide}
                    sx={{color: '#ffffff', '&:hover': {backgroundColor: '#333'}}}
                >
                    <CloseIcon/>
                </IconButton>
            </DialogTitle>

            <DialogContent sx={{
                p: 0,
                backgroundColor: '#000',
                display: 'flex',
                flexDirection: 'column',
                flex: 1,
                overflow: 'hidden' // Let xterm handle scroll
            }}>
                {!isConnected ? (
                    <Box sx={{
                        p: 4,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 2,
                        alignItems: 'center',
                        justifyContent: 'center',
                        height: '100%'
                    }}>
                        <Box sx={{width: '100%', maxWidth: 400, display: 'flex', gap: 1}}>
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
                                onClick={handleConnect}
                                color="primary"
                            >
                                Connect
                            </Button>
                        </Box>
                    </Box>
                ) : (
                    <Box sx={{flex: 1, p: 1, overflow: 'hidden'}}>
                        <AppTerminal
                            isActive={true}
                            id={containerID}
                            interactive={true}
                            fit={fitAddonRef}
                            title={`Exec ${name}`}
                            onTerminal={
                                term => interactiveTermFn(term, getWsUrl())
                            }
                        />
                    </Box>
                )}
            </DialogContent>

            <DialogActions sx={{
                backgroundColor: '#252526',
                borderTop: '1px solid #333',
                p: 1
            }}>
                {/* Status or helper text could go here */}
                <Box sx={{fontSize: '0.8rem', color: '#666', mr: 2}}>
                    {isConnected && "Status: Connected via WebSocket"}
                </Box>
            </DialogActions>
        </Dialog>
    );
};

export default ExecDialog;

