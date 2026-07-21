import {useHostClient} from "../../../lib/api.ts";
import {useFileComponents} from "../state/terminal.tsx";
import {Box, Button, ButtonGroup, CircularProgress, IconButton, Tooltip} from "@mui/material";
import TerminalIcon from '@mui/icons-material/Terminal';
import {deployActionsConfig, useComposeAction} from "../state/compose.tsx";
import {DockerService} from "../../../gen/docker/v1/docker_pb.ts";
import {useSnackbar} from "../../../hooks/snackbar.ts";
import {DockerCommandButton} from "./docker-command-button.tsx";

export function ComposeActionHeaders({selectedServices, fetchContainers}: {
    selectedServices: string[];
    fetchContainers: () => Promise<void>
}) {
    const dockerService = useHostClient(DockerService);
    const {showSuccess, showError} = useSnackbar();

    const runAction = useComposeAction(state => state.runAction)
    const activeAction = useComposeAction(state => state.activeAction)
    const openOutput = useComposeAction(state => state.openOutput)
    const {filename} = useFileComponents();
    const composeFile = filename!
    const lastRun = useComposeAction(state => state.runs[composeFile])

    // short stack label for toasts: the compose file's folder
    const parts = composeFile.split('/');
    const stackLabel = parts.length > 1 ? parts[parts.length - 2] : composeFile;

    const handleComposeAction = (
        name: typeof deployActionsConfig[number]['name'],
        _message: string,
        rpcName: typeof deployActionsConfig[number]['rpcName'],
    ) => {
        runAction(
            composeFile,
            dockerService[rpcName],
            name,
            selectedServices,
            (error) => {
                void fetchContainers()
                if (error) {
                    showError(`${stackLabel}: ${name} failed`, {
                        duration: 10000,
                        action: (
                            <Button color="inherit" size="small" onClick={() => openOutput(composeFile)}>
                                Output
                            </Button>
                        ),
                    });
                } else {
                    showSuccess(`${stackLabel}: ${name} completed`);
                }
            }
        )
    };

    return (
        <Box sx={{display: 'flex', gap: 1.5, flexWrap: 'wrap', mb: 2, flexShrink: 0, alignItems: 'center'}}>
            <ButtonGroup
                variant="outlined"
                size="small"
                sx={{
                    '& .MuiButton-root': {
                        textTransform: 'none',
                        fontWeight: 600,
                        px: 1.5,
                        borderColor: 'divider',
                        color: 'text.secondary',
                        '&:hover': {
                            borderColor: 'primary.main',
                            color: 'primary.main',
                            bgcolor: 'action.hover',
                        },
                    },
                    '& .MuiButton-startIcon svg': {fontSize: 17},
                }}
            >
                {deployActionsConfig.map((action) => (
                    <Button
                        key={action.name}
                        disabled={!!activeAction}
                        onClick={() => handleComposeAction(action.name, action.message, action.rpcName)}
                        startIcon={
                            activeAction === action.name ?
                                <CircularProgress size={15} color="inherit"/> :
                                action.icon
                        }
                    >
                        {action.name.charAt(0).toUpperCase() + action.name.slice(1)}
                    </Button>
                ))}
            </ButtonGroup>
            <DockerCommandButton/>
            {lastRun && (
                <Tooltip title={lastRun.running
                    ? `${lastRun.action} running — show output`
                    : `Last action output (${lastRun.action}${lastRun.failed ? ', failed' : ''})`}>
                    <IconButton
                        size="small"
                        onClick={() => openOutput(composeFile)}
                        sx={{color: lastRun.failed ? 'error.main' : 'text.secondary'}}
                    >
                        <TerminalIcon sx={{fontSize: 20}}/>
                    </IconButton>
                </Tooltip>
            )}
        </Box>
    )
}
