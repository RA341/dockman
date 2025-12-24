import {useCallback, useEffect, useRef, useState} from "react";
import {
    Autocomplete,
    Box,
    Button,
    Paper,
    TextField,
    Typography,
    Stack,
    Divider,
    Link,
    IconButton,
    Tooltip,
} from '@mui/material';

import "@xterm/xterm/css/xterm.css";

// Icons
import TerminalIcon from '@mui/icons-material/Terminal';
import BugReportIcon from '@mui/icons-material/BugReport';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import SettingsIcon from '@mui/icons-material/Settings';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import {useSnackbar} from "../../hooks/snackbar.ts";
import {useHost} from "../home/home.tsx";
import {FitAddon} from "@xterm/addon-fit";
import {createTab} from "../compose/state/state.tsx";
import {getWSUrl} from "../../lib/api.ts";
import AppTerminal from "../compose/components/logs-terminal.tsx";

const commandOptions = ["/bin/sh", "/bin/bash", "sh", "bash", "zsh"];
const debugImageOptions = ["nixery.dev/shell/fish", "nixery.dev/shell/bash", "nixery.dev/shell/zsh"];

const InspectTabExec = ({containerID}: { containerID: string; }) => {
    const {showError} = useSnackbar();
    const selectedHost = useHost();
    const fitAddonRef = useRef<FitAddon>(new FitAddon());

    const [selectedCmd, setSelectedCmd] = useState<string>('/bin/sh');
    const [debuggerImage, setDebuggerImage] = useState("");
    const [isConnected, setIsConnected] = useState(false);

    useEffect(() => {
        setIsConnected(false);
    }, [containerID]);

    const handleConnect = () => {
        if (!containerID) {
            showError("No container ID provided");
            return;
        }
        setIsConnected(true);
    };

    const setupExec = useCallback(() => {
        const encodedCmd = encodeURIComponent(selectedCmd);
        let base = `api/docker/exec/${containerID}/${encodeURIComponent(selectedHost)}?cmd=${encodedCmd}`;

        if (debuggerImage) {
            base += "&debug=true";
            base += "&image=" + encodeURIComponent(debuggerImage);
        }

        return createTab(getWSUrl(base), `Exec: ${containerID}`, true);
    }, [containerID, debuggerImage, selectedCmd, selectedHost]);

    const containerShortId = containerID.slice(0, 12);

    if (isConnected) {
        return (
            <Box sx={{display: 'flex', flexDirection: 'column', height: 'calc(100vh - 200px)', minHeight: '500px'}}>
                <Paper
                    variant="outlined"
                    sx={{
                        p: 1,
                        mb: 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        bgcolor: 'background.default'
                    }}
                >
                    <Stack direction="row" spacing={2} alignItems="center">
                        <IconButton size="small" onClick={() => setIsConnected(false)}>
                            <ArrowBackIcon fontSize="small"/>
                        </IconButton>
                        <Typography variant="subtitle2" sx={{fontFamily: 'monospace', fontWeight: 700}}>
                            {containerShortId} › {selectedCmd}
                        </Typography>
                    </Stack>
                    <Typography variant="caption" color="success.main" sx={{fontWeight: 700}}>
                        ● CONNECTED
                    </Typography>
                </Paper>

                <Box sx={{flex: 1, bgcolor: '#000', borderRadius: 1, overflow: 'hidden', p: 1}}>
                    <AppTerminal
                        {...setupExec()}
                        isActive={true}
                        fit={fitAddonRef}
                    />
                </Box>
            </Box>
        );
    }

    return (
        <Box sx={{p: 2, maxWidth: '800px', mx: 'auto'}}>
            <Stack spacing={3}>
                <Box>
                    <Typography variant="h6" sx={{fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1}}>
                        <TerminalIcon color="primary"/> Execute Command
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                        Open an interactive shell session within container <code
                        style={{color: '#d32f2f'}}>{containerShortId}</code>.
                    </Typography>
                </Box>

                <Paper variant="outlined" sx={{borderRadius: 2, overflow: 'hidden'}}>
                    <Box sx={{p: 2, bgcolor: 'action.hover', borderBottom: '1px solid', borderColor: 'divider'}}>
                        <Typography variant="subtitle2" sx={{display: 'flex', alignItems: 'center', gap: 1}}>
                            <SettingsIcon sx={{fontSize: 18}}/> Basic Settings
                        </Typography>
                    </Box>

                    <Box sx={{p: 3}}>
                        <Stack spacing={3}>
                            <Autocomplete
                                freeSolo
                                options={commandOptions}
                                value={selectedCmd}
                                onInputChange={(_, value) => setSelectedCmd(value)}
                                renderInput={(params) => (
                                    <TextField
                                        {...params}
                                        label="Shell Command"
                                        placeholder="/bin/bash"
                                        helperText="The command to execute (e.g., /bin/sh, /bin/bash)"
                                    />
                                )}
                            />

                            <Divider>
                                <Typography variant="caption" color="text.disabled" sx={{px: 1, fontWeight: 700}}>
                                    OR
                                </Typography>
                            </Divider>

                            <Box>
                                <Stack direction="row" spacing={1} alignItems="center" sx={{mb: 1}}>
                                    <BugReportIcon sx={{fontSize: 18, color: 'warning.main'}}/>
                                    <Typography variant="subtitle2">Dockman Debug</Typography>
                                    <Tooltip title="Launch a sidecar container with debugging tools">
                                        <HelpOutlineIcon
                                            sx={{fontSize: 14, color: 'text.disabled', cursor: 'pointer'}}/>
                                    </Tooltip>
                                </Stack>

                                <Autocomplete
                                    freeSolo
                                    options={debugImageOptions}
                                    value={debuggerImage}
                                    onInputChange={(_, value) => setDebuggerImage(value)}
                                    renderInput={(params) => (
                                        <TextField
                                            {...params}
                                            label="Debugger Image"
                                            placeholder="nixery.dev/shell/fish"
                                        />
                                    )}
                                />
                                <Typography variant="caption" sx={{mt: 1, display: 'block', color: 'text.secondary'}}>
                                    Exec into any container using a custom image. {' '}
                                    <Link
                                        href="https://dockman.radn.dev/docs/dockman-debug/overview"
                                        target="_blank"
                                        rel="noopener"
                                        underline="hover"
                                        sx={{color: 'primary.main'}}
                                    >
                                        Learn more
                                    </Link>
                                </Typography>
                            </Box>
                        </Stack>
                    </Box>

                    <Box sx={{
                        p: 2,
                        borderTop: '1px solid',
                        borderColor: 'divider',
                        display: 'flex',
                        justifyContent: 'flex-end'
                    }}>
                        <Button
                            variant="contained"
                            size="large"
                            onClick={handleConnect}
                            startIcon={<PlayArrowIcon/>}
                            sx={{px: 4, borderRadius: 2}}
                        >
                            Launch Terminal
                        </Button>
                    </Box>
                </Paper>
            </Stack>
        </Box>
    );
};

export default InspectTabExec;
