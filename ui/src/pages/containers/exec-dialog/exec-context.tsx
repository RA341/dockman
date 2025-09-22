import {type ReactNode, useState} from 'react'
import {ExecDialogContext} from "./exec-hook.ts";
import ExecDialog from "./exec-ui.tsx";

interface ExecDialogProps {
    children: ReactNode
}

export function ExecDialogProvider({children}: ExecDialogProps) {
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
        <ExecDialogContext.Provider value={value}>
            {children}
            {isVisible && (
                <ExecDialog
                    name={containerName}
                    containerID={containerId}
                    hide={closeDialog}
                    show={isVisible}
                />)
            }
        </ExecDialogContext.Provider>
    )
}
