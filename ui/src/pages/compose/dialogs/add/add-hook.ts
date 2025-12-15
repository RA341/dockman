import {createContext, useContext} from "react";

export interface AddFileContextType {
    isVisible: boolean
    closeDialog: () => void
    showDialog: (parent?: string) => void
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
