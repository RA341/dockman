import {type ReactNode, useState} from 'react'
import {FileDialogCreate} from "./rename-ui.tsx";
import {RenameFileContext} from "./rename-hook.ts";

interface RenameFilesProps {
    children: ReactNode
}

export function RenameFilesProvider({children}: RenameFilesProps) {
    const [isVisible, setIsVisible] = useState(false)
    const [parent, setParent] = useState("")

    const closeDialog = () => {
        setIsVisible(false)
        setParent("")
    }

    const showDialog = (parent?: string) => {
        setParent(parent ?? "")
        setIsVisible(true)
    }

    const value = {
        isVisible,
        closeDialog,
        showDialog
    }

    return (
        <RenameFileContext.Provider value={value}>
            {children}
            <FileDialogCreate
                filename={parent}
                open={isVisible}
                onClose={closeDialog}
            />
        </RenameFileContext.Provider>
    )
}
