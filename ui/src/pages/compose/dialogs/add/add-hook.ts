import {createContext, useContext} from "react";


export type PresetType = 'file' | 'folder' | 'compose-directory'
export type CreationStep = 'preset-selection' | 'name-input'

export interface AddFileContextType {
    isVisible: boolean
    closeDialog: () => void
    showDialog: (parent?: string, preset?: PresetType) => void
}

export const AddFileContext = createContext<AddFileContextType | undefined>(undefined)

// Hook to use the changelog context
export function useAddFile() {
    const context = useContext(AddFileContext)
    if (!context) {
        throw new Error('useTelescope must be used within a TelescopeProvider')
    }
    return context
}
