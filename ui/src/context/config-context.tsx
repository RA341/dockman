import {type ReactNode, useCallback, useEffect, useState} from 'react'
import {callRPC, useClient, useFileClient} from "../lib/api.ts";
import {useSnackbar} from "../hooks/snackbar.ts";
import {ConfigService, type UserConfig} from "../gen/config/v1/config_pb.ts";
import {ConfigContext, type ConfigContextType, type UpdateSettingsOption} from "../hooks/config.ts";
import {type DockmanYaml} from "../gen/files/v1/files_pb.ts";

export type Config = Omit<UserConfig, '$typeName' | '$unknown'>;

export function UserConfigProvider({children}: { children: ReactNode }) {
    const client = useClient(ConfigService)
    const file = useFileClient()

    const {showError, showSuccess, showWarning} = useSnackbar()
    const [config, setConfig] = useState<Config>({})
    const [isLoading, setIsLoading] = useState(true)

    const [dockYaml, setDockYaml] = useState<DockmanYaml | null>(null)

    const fetchDockYaml = useCallback(async () => {
        const {val, err} = await callRPC(() => file.getDockmanYaml({}))
        if (err) {
            showWarning(`Unable to get dockman yaml, ${err}`)
        }
        setDockYaml(val)
    }, [file])

    const fetchConfig = useCallback(async () => {
        console.log("Fetching user config...")
        setIsLoading(true)

        const {val, err} = await callRPC(() => client.getUserConfig({}))
        if (err) {
            showError(err)
        } else if (val) {
            setConfig(val)
        }

        await fetchDockYaml()

        setIsLoading(false)
    }, [client, fetchDockYaml])

    const updateSettings = useCallback(
        async (conf: Config, updaterConfig: UpdateSettingsOption = {}) => {
            const {err} = await callRPC(() => client.setUserConfig({config: conf, ...updaterConfig}))
            if (err) {
                showError(`Error saving file: ${err}`)
            } else {
                showSuccess(`Settings updated.`)
            }

            await fetchConfig()
        }, [client, fetchConfig]
    )

    useEffect(() => {
        fetchConfig().then()
    }, [fetchConfig])

    const value: ConfigContextType = {
        config,
        isLoading,
        updateSettings,
        dockYaml,
        fetchDockmanYaml: fetchDockYaml,
    }

    return (
        <ConfigContext.Provider value={value}>
            {children}
        </ConfigContext.Provider>
    )
}
