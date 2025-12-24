import {createContext, type ReactNode, useCallback, useContext, useEffect, useState} from "react";
import {type Alias} from "../gen/files/v1/files_pb.ts";
import {callRPC, useFileClient} from "../lib/api.ts";
import {useSnackbar} from "../hooks/snackbar.ts";
import {useNavigate} from "react-router-dom";
import {useEditorUrl} from "../lib/editor.ts";
import {useHostStore} from "../pages/compose/state/files.ts";

interface AliasContextType {
    files: Alias[]
    isLoading: boolean

    addAlias: (alias: string, host: string, fullpath: string) => Promise<void>
    deleteAlias: (alias: string) => Promise<void>
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
    const files = useFileClient()
    const {showError} = useSnackbar()
    const host = useHostStore(state => state.host)

    const [aliases, setAliases] = useState<Alias[]>([])
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

        const {val, err} = await callRPC(() => files.listAlias({host}))
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

    const addAlias = async (alias: string, host: string, fullpath: string) => {
        const {err} = await callRPC(() => files.addAlias({alias: {alias, fullpath, host}}))
        if (err) {
            showError(`Unable to add file alias\n${err}`)
        }
        await list()
    }

    const deleteAlias = async (alias: string) => {
        const {err} = await callRPC(() => files.deleteAlias({alias: {alias}}))
        if (err) {
            showError(`Unable to delete file alias\n${err}`)
        }
        await list()
    }


    useEffect(() => {
        list().then()
    }, [list])


    const value = {
        files: aliases,
        isLoading: isLoading,
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