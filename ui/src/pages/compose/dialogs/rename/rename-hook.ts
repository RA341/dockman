import {createContext, useContext} from "react";

export interface RenameFileContextType {
    isVisible: boolean
    closeDialog: () => void
    showDialog: (parent?: string, depthIndex?: number[]) => void
}

export const RenameFileContext = createContext<RenameFileContextType | undefined>(undefined)

// Hook to use the changelog context
export function useRenameFile() {
    const context = useContext(RenameFileContext)
    if (!context) {
        throw new Error('useTelescope must be used within a TelescopeProvider')
    }
    return context
}
