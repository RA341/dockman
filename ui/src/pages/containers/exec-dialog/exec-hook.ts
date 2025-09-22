import {createContext, useContext} from "react";

export interface ExecDialogContextType {
    closeDialog: () => void
    showDialog: (containerId: string, containerName: string) => void
}

export const ExecDialogContext = createContext<ExecDialogContextType | undefined>(undefined)

// Hook to use the changelog context
export function useExecDialog() {
    const context = useContext(ExecDialogContext)
    if (!context) {
        throw new Error('useExecDialog must be used within a ExecDialogProvider')
    }
    return context
}
