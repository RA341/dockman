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
import {useClient} from "../../lib/api";
import {DockerService} from "../../gen/docker/v1/docker_pb.ts";
import {deployActionsConfig, useComposeAction} from "./state/state.tsx";

function EditorDeployWidget() {
    const dockerService = useClient(DockerService);
    // const {fetchContainers} = useDockerCompose(selectedPage);

    const [composeErrorDialog, setComposeErrorDialog] = useState<{ dialog: boolean; message: string }>({
        dialog: false,
        message: ''
    });
    const closeErrorDialog = () => setComposeErrorDialog(p => ({...p, dialog: false}));

    const runAction = useComposeAction(state => state.runAction)
    const activeAction = useComposeAction(state => state.activeAction)

    const handleComposeAction = (
        name: typeof deployActionsConfig[number]['name'],
        _message: string,
        rpcName: typeof deployActionsConfig[number]['rpcName'],
    ) => {
        runAction(dockerService[rpcName], name, [])
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