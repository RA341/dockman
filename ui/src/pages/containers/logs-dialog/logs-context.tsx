import {type ReactNode, useState} from 'react'
import {LogsDialogContext} from "./logs-hook.ts";
import LogsDialog from "./logs-ui.tsx";

interface LogsDialogProps {
    children: ReactNode
}

export function LogsDialogProvider({children}: LogsDialogProps) {
    const [isVisible, setIsVisible] = useState(false)
    const [containerId, setContainerId] = useState("")
    const [containerName, setContainerName] = useState("")

    const closeDialog = () => {
        setIsVisible(false)
        setContainerId("")
        setContainerName("")
    }

    const showDialog = (containerId: string, containerName: string) => {
        setContainerName(containerName)
        setContainerId(containerId)
        setIsVisible(true)
    }

    const value = {
        isVisible,
        closeDialog,
        showDialog
    }

    return (
        <LogsDialogContext.Provider value={value}>
            {children}
            <LogsDialog
                hide={closeDialog}
                show={isVisible}
                containerID={containerId}
                name={containerName}
            />
        </LogsDialogContext.Provider>
    )
}
