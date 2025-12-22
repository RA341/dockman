import {type ReactNode, useState} from 'react'
import {AddFileContext, type PresetType} from "./add-hook.ts";
import {FileDialogCreate} from "./add-ui.tsx";
import {useFiles} from "../../../../context/file-context.tsx"

interface AddFilesProps {
    children: ReactNode
}

export function AddFilesProvider({children}: AddFilesProps) {
    const [isVisible, setIsVisible] = useState(false)
    const {addFile} = useFiles()
    const [parent, setParent] = useState("")
    const [preset, setPreset] = useState<PresetType | null>(null)

    const closeDialog = () => {
        setIsVisible(false)
        setParent("")
    }

    const handleAddConfirm = (filename: string, isDir: boolean) => {
        addFile(filename, isDir).then(() => {
            closeDialog()
        })
    }

    const showDialog = (parent?: string, preset?: PresetType) => {
        setParent(parent ?? "")
        setPreset(preset ?? null)
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
                preset={preset}
                parentName={parent}
                open={isVisible}
                onClose={closeDialog}
                onConfirm={handleAddConfirm}
            />
        </AddFileContext.Provider>
    )
}
