import {createContext, type ReactNode, useCallback, useContext, useEffect, useState} from "react";
import {callRPC, useClient} from "../lib/api.ts";
import {useSnackbar} from "../hooks/snackbar.ts";
import {useNavigate, useParams} from "react-router-dom";
import {useEditorUrl} from "../lib/editor.ts";
import {type FolderAlias, HostManagerService} from "../gen/host/v1/host_pb.ts";

interface AliasContextType {
    aliases: FolderAlias[]
    isLoading: boolean

    addAlias: (alias: string, host: number, fullpath: string) => Promise<void>
    deleteAlias: (host: number, alias: string) => Promise<void>
    listAlias: () => Promise<void>

    setAlias: (alias: string) => void
    clearAlias: () => void
}

const AliasContext = createContext<AliasContextType | undefined>(undefined)

export function useAlias() {
    const context = useContext(AliasContext)
    if (context === undefined) {
        throw new Error('useAlias must be used within a AliasProvider')
    }
    return context
}

export const COMPOSE_ROOT_ALIAS = "compose";

const AliasProvider = ({children}: { children: ReactNode }) => {
    const hostmanager = useClient(HostManagerService)
    const {showError} = useSnackbar()
    const {host} = useParams()

    const [aliases, setAliases] = useState<FolderAlias[]>([])
    const [isLoading, setIsLoading] = useState(false)

    const nav = useNavigate()

    const editorUrl = useEditorUrl()

    const setAlias = (alias: string) => {
        nav(editorUrl(alias))
    }

    const clearAlias = () => {
        nav(`/files`)
    }

    const list = useCallback(async () => {
        setIsLoading(true)

        const {val, err} = await callRPC(() => hostmanager.listAlias({host}))
        if (err) {
            showError(`Unable to list file aliases\n${err}`)
        } else {
            if (!val) {
                showError("Api returned null response")
            } else {
                setAliases(val.aliases)
            }
        }

        setIsLoading(false)
    }, [host])

    const addAlias = async (alias: string, host: number, fullpath: string) => {
        const {err} = await callRPC(() => hostmanager.addAlias({alias: {alias, fullpath, id: host}}))
        if (err) {
            showError(`Unable to add file alias\n${err}`)
        }
        await list()
    }

    const deleteAlias = async (host: number, alias: string) => {
        const {err} = await callRPC(() => hostmanager.deleteAlias({alias: alias, hostId: host}))
        if (err) {
            showError(`Unable to delete file alias\n${err}`)
        }
        await list()
    }

    useEffect(() => {
        list().then()
    }, [list])

    const value = {
        aliases,
        isLoading,
        addAlias: addAlias,
        deleteAlias: deleteAlias,
        listAlias: list,
        setAlias,
        clearAlias,
    }

    return (
        <AliasContext.Provider value={value}>
            {children}
        </AliasContext.Provider>
    )
};

export default AliasProvider;