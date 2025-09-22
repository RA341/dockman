import {createContext, useContext} from "react";

export interface LogsDialogContextType {
    closeDialog: () => void
    showDialog: (containerId: string, containerName: string) => void
}

export const LogsDialogContext = createContext<LogsDialogContextType | undefined>(undefined)

// Hook to use the changelog context
export function useLogsDialog() {
    const context = useContext(LogsDialogContext)
    if (!context) {
        throw new Error('useLogsDialog must be used within a LogsDialogProvider')
    }
    return context
}
