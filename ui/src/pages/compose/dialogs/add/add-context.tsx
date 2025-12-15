import {type ReactNode, useState} from 'react'
import {AddFileContext} from "./add-hook.ts";
import {FileDialogCreate} from "./add-ui.tsx";
import {useFiles} from "../../../../context/file-context.tsx"

interface AddFilesProps {
    children: ReactNode
}

export function AddFilesProvider({children}: AddFilesProps) {
    const [isVisible, setIsVisible] = useState(false)
    const {addFile} = useFiles()
    const [parent, setParent] = useState("")

    const closeDialog = () => {
        setIsVisible(false)
        setParent("")
    }

    const handleAddConfirm = (filename: string, isDir: boolean) => {
        addFile(filename, isDir).then(() => {
            closeDialog()
        })
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
        <AddFileContext.Provider value={value}>
            {children}
            <FileDialogCreate
                parentName={parent}
                open={isVisible}
                onClose={closeDialog}
                onConfirm={handleAddConfirm}
            />
        </AddFileContext.Provider>
    )
}
