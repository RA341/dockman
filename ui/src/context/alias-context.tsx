import {createContext, type ReactNode, useContext, useEffect, useState} from "react";
import {type Alias, FileService} from "../gen/files/v1/files_pb.ts";
import {callRPC, useClient} from "../lib/api.ts";
import {useSnackbar} from "../hooks/snackbar.ts";

interface AliasContextType {
    files: Alias[]
    isLoading: boolean

    addAlias: (alias: string, fullpath: string) => Promise<void>
    deleteAlias: (alias: string) => Promise<void>
    listAlias: () => Promise<void>

    activeAlias: string
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

const AliasProvider = ({children}: { children: ReactNode }) => {
    const files = useClient(FileService)
    const {showError} = useSnackbar()

    const [activeAlias, setActiveAlias] = useState("")
    const [aliases, setAliases] = useState<Alias[]>([])
    const [isLoading, setIsLoading] = useState(false)

    useEffect(() => {
        list().then()
    }, []);

    const setAlias = (alias: string) => {
        setActiveAlias(alias)
    }

    const clearAlias = () => {
        setActiveAlias("")
    }

    const list = async () => {
        setIsLoading(true)

        const {val, err} = await callRPC(() => files.listAlias({}))
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
    }

    const addAlias = async (alias: string, fullpath: string) => {
        const {err} = await callRPC(() => files.addAlias({alias: {alias, fullpath}}))
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

    const value = {
        files: aliases,
        isLoading: isLoading,
        addAlias: addAlias,
        deleteAlias: deleteAlias,
        listAlias: list,

        activeAlias: activeAlias,
        setAlias: setAlias,
        clearAlias: clearAlias,
    }

    return (
        <AliasContext.Provider value={value}>
            {children}
        </AliasContext.Provider>
    )
};

export default AliasProvider;