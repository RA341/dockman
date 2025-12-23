import {createContext, useContext} from "react";
import type {Config} from "../context/config-context.tsx";
import type {DockmanYaml} from "../gen/files/v1/files_pb.ts";

export interface UpdateSettingsOption {
    updateUpdater?: boolean;
}

export interface ConfigContextType {
    config: Config
    isLoading: boolean
    updateSettings: (user: Config, opts?: UpdateSettingsOption) => Promise<void>,
    dockYaml: DockmanYaml | null
    fetchDockmanYaml: () => Promise<void>,
}

export const ConfigContext = createContext<ConfigContextType | undefined>(undefined)

// Hook to use the changelog context
export function useConfig() {
    const context = useContext(ConfigContext)
    if (!context) {
        throw new Error('useChangelog must be used within a UserConfigProvider')
    }
    return context
}