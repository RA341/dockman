import {useState} from "react";
import {Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField, Tooltip} from "@mui/material";
import TerminalIcon from '@mui/icons-material/Terminal';
import {useHostClient} from "../../../lib/api.ts";
import {DockerService} from "../../../gen/docker/v1/docker_pb.ts";
import {makeID, type TabTerminal, useTerminalAction, useTerminalTabs} from "../state/terminal.tsx";

const LAST_COMMAND_KEY = 'dockman-last-docker-command';

// Runs a one-off docker CLI command on the current host (quick container
// tests: docker run --rm ...); output streams into a bottom-panel terminal
export function DockerCommandButton() {
    const dockerService = useHostClient(DockerService);
    const [open, setOpen] = useState(false);
    const [command, setCommand] = useState(() => localStorage.getItem(LAST_COMMAND_KEY) ?? "docker run --rm ");

    const runCommand = () => {
        const cmd = command.trim();
        if (!cmd) return;
        localStorage.setItem(LAST_COMMAND_KEY, cmd);
        setOpen(false);

        const stream = dockerService.dockerCommand({command: cmd});

        useTerminalAction.getState().open();
        const tabsStore = useTerminalTabs.getState();
        const key = `docker-command:${makeID(6)}`;
        const shortTitle = cmd.length > 40 ? `${cmd.slice(0, 40)}…` : cmd;

        const tab: TabTerminal = {
            id: makeID(),
            title: shortTitle,
            interactive: false,
            onClose: () => {
            },
            onTerminal: term => {
                const consume = async () => {
                    try {
                        for await (const item of stream) {
                            term.write(item.message);
                        }
                        term.write('\r\n\x1b[32m*** command finished ***\x1b[0m\r\n');
                    } catch (error: unknown) {
                        const err = error instanceof Error ? error.message : String(error);
                        term.write(`\r\n\x1b[31m${err}\x1b[0m\r\n`);
                    }
                };
                void consume();
            },
        };
        tabsStore.addTab(key, tab);
    };

    return (
        <>
            <Tooltip title="Run a docker command">
                <Button
                    variant="outlined"
                    size="small"
                    startIcon={<TerminalIcon sx={{fontSize: 17}}/>}
                    onClick={() => setOpen(true)}
                    sx={{
                        textTransform: 'none',
                        fontWeight: 600,
                        borderColor: 'divider',
                        color: 'text.secondary',
                        '&:hover': {borderColor: 'primary.main', color: 'primary.main', bgcolor: 'action.hover'},
                    }}
                >
                    Run
                </Button>
            </Tooltip>

            <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="md">
                <DialogTitle>Run a docker command</DialogTitle>
                <DialogContent>
                    <Box sx={{pt: 1}}>
                        <TextField
                            autoFocus
                            fullWidth
                            label="Command"
                            placeholder="docker run --rm -p 8080:80 nginx:alpine"
                            value={command}
                            onChange={(e) => setCommand(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    e.preventDefault();
                                    runCommand();
                                }
                            }}
                            slotProps={{input: {sx: {fontFamily: 'monospace', fontSize: '0.9rem'}}}}
                            helperText="Only the docker binary is allowed; output opens in the bottom panel"
                        />
                    </Box>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setOpen(false)}>Cancel</Button>
                    <Button variant="contained" onClick={runCommand} disabled={!command.trim()}>
                        Run
                    </Button>
                </DialogActions>
            </Dialog>
        </>
    );
}
