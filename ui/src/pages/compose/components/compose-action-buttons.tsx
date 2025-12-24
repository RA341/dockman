import {useDockerClient} from "../../../lib/api.ts";
import {deployActionsConfig, useComposeAction, useFileComponents} from "../state/state.tsx";
import {Box, Button, CircularProgress} from "@mui/material";

export function ComposeActionHeaders({selectedServices, fetchContainers}: {
    selectedServices: string[];
    fetchContainers: () => Promise<void>
}) {
    const dockerService = useDockerClient();

    const runAction = useComposeAction(state => state.runAction)
    const activeAction = useComposeAction(state => state.activeAction)
    const {filename} = useFileComponents();
    const composeFile = filename!

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
            () => fetchContainers()
        )
    };

    return (
        <Box sx={{display: 'flex', gap: 2, flexWrap: 'wrap', mb: 3, flexShrink: 0}}>
            {deployActionsConfig.map((action) => (
                <Button
                    key={action.name}
                    variant="outlined"
                    disabled={!!activeAction}
                    onClick={() => handleComposeAction(action.name, action.message, action.rpcName)}
                    startIcon={
                        activeAction === action.name ?
                            <CircularProgress size={20} color="inherit"/> :
                            action.icon
                    }
                >
                    {action.name.charAt(0).toUpperCase() + action.name.slice(1)}
                </Button>
            ))}
        </Box>
    )
}