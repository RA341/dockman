import {type ReactNode, useCallback, useEffect, useState} from 'react'
import {callRPC, useClient} from '../lib/api'
import {useSnackbar} from '../hooks/snackbar'
import {InfoService} from "../gen/info/v1/info_pb.ts";
import {ChangelogContext} from '../hooks/changelog.ts';
import ChangelogModal from "../components/change-log-modal.tsx";

interface ChangelogProviderProps {
    children: ReactNode
}

export function ChangelogProvider({children}: ChangelogProviderProps) {
    const infoClient = useClient(InfoService)
    const {showError} = useSnackbar()

    const [changelog, setChangelog] = useState("")
    const [version, setVersion] = useState("")
    const [isChangelogVisible, setIsChangelogVisible] = useState(false)
    const [isLoading, setIsLoading] = useState(false)
    const [releaseUrl, setReleaseUrl] = useState("")

    const checkVersion = useCallback(async () => {
        setIsLoading(true)
        const {val, err} = await callRPC(() => infoClient.getChangelog({}))
        if (err) {
            showError(err)
            return
        }

        const changelogContent = val?.changelog ?? ""
        setChangelog(changelogContent)
        // Show modal if there's changelog content
        if (changelogContent.trim()) {
            setReleaseUrl(val?.url ?? "")
            setVersion(val?.version ?? "")
            setIsChangelogVisible(true)
        }

        setIsLoading(false)
    }, [infoClient, showError])

    const dismissChangelog = useCallback(async () => {
        // Mark changelog as read on the backend
        const {err} = await callRPC(() => infoClient.readVersion({version: version}))
        if (err) {
            showError(err)
            return
        }

        // Hide the modal
        setIsChangelogVisible(false)
        setChangelog("")
        setReleaseUrl("")
        setVersion("")
    }, [infoClient, showError, version])

    // Check for changelog on mount
    useEffect(() => {
        checkVersion().then()
    }, [checkVersion])

    const value = {
        changelog,
        isChangelogVisible,
        isLoading,
        dismissChangelog,
        checkVersion
    }

    return (
        <ChangelogContext.Provider value={value}>
            {children}
            <ChangelogModal
                githubUrl={releaseUrl}
                isVisible={isChangelogVisible}
                changelog={changelog}
                onDismiss={dismissChangelog}
                isLoading={isLoading}
            />
        </ChangelogContext.Provider>
    )
}
