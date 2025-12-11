import {type ReactNode, useState} from 'react'
import {DeleteFileContext} from "./delete-hook.ts";
import FileDialogDelete from "./delete-ui.tsx";
import {useFiles} from "../../../../hooks/files.ts";

interface DeleteFileProviderProps {
    children: ReactNode
}

export function DeleteFileProvider({children}: DeleteFileProviderProps) {
    const [isVisible, setIsVisible] = useState(false)
    const {deleteFile} = useFiles()
    const [fileToDelete, setFileToDelete] = useState("")
    const [depth, setDepth] = useState<number[]>([])

    const showDialog = (file: string, depthIndex: number[]) => {
        setIsVisible(true)
        setFileToDelete(file)
        setDepth(depthIndex)
    }

    const deleteFileConfirm = (file: string) => {
        deleteFile(file, depth).then()
    }

    const closeDialog = () => {
        setIsVisible(false)
        setFileToDelete("")
    }

    const value = {
        isVisible,
        closeDialog,
        showDialog,
    }

    return (
        <DeleteFileContext.Provider value={value}>
            {children}
            <FileDialogDelete
                fileToDelete={fileToDelete}
                onClose={closeDialog}
                handleDelete={deleteFileConfirm}
            />
        </DeleteFileContext.Provider>
    )
}
