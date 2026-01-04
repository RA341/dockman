import {Delete, PlayArrow, RestartAlt, Stop} from "@mui/icons-material";
import {callRPC, useHostClient} from "../../../lib/api.ts";
import {useEffect, useState} from "react";
import {useSnackbar} from "../../../hooks/snackbar.ts";
import {DockerService} from "../../../gen/docker/v1/docker_pb.ts";

export const useContainerAction = ({onActionComplete, containerId, removeRemoveAction = false}: {
    containerId?: string,
    removeRemoveAction?: boolean,
    onActionComplete?: () => Promise<void>
}) => {
    const dockerService = useHostClient(DockerService);
    const {showSuccess, showError} = useSnackbar()
    const [selectedContainers, setSelectedContainers] = useState<string[]>([])

    useEffect(() => {
        if (containerId) {
            setSelectedContainers([containerId])
        }
    }, [containerId]);

    async function handleContainerAction(name: string, rpcName: keyof typeof dockerService, message: string) {
        // @ts-ignore
        const {err} = await callRPC(() => dockerService[rpcName]({containerIds: selectedContainers}));
        if (err) {
            showError(`Failed to ${name} Containers: ${err}`);
        } else {
            showSuccess(`Successfully ${message} containers`);
        }

        if (containerId) {
            setSelectedContainers([containerId])
        } else {
            setSelectedContainers([]);
        }

        await onActionComplete?.()
    }

    return [
        {
            action: 'start',
            buttonText: "Start",
            icon: <PlayArrow/>,
            disabled: selectedContainers.length === 0,
            handler: () => handleContainerAction('start', 'containerStart', "started"),
            tooltip: "",
        },
        {
            action: 'stop',
            buttonText: "Stop",
            icon: <Stop/>,
            disabled: selectedContainers.length === 0,
            handler: () => handleContainerAction('stop', 'containerStop', "stopped"),
            tooltip: "",

        },
        {
            action: 'restart',
            buttonText: "Restart",
            icon: <RestartAlt/>,
            disabled: selectedContainers.length === 0,
            handler: () => handleContainerAction('restart', 'containerRestart', "restarted"),
            tooltip: "",
        },

        // {
        //     action: 'update',
        //     buttonText: "Update",
        //     icon: <Update/>,
        //     disabled: selectedContainers.length === 0,
        //     handler: () => handleContainerAction('update', 'containerUpdate', "updated"),
        //     tooltip: "",
        // },
        ...(!removeRemoveAction ? [{
            action: 'remove',
            buttonText: "Remove",
            icon: <Delete/>,
            disabled: selectedContainers.length === 0,
            handler: () => handleContainerAction('remove', 'containerRemove', "removed"),
            tooltip: "",
        }] : []),
    ]
}
