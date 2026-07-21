import {useCallback, useEffect, useState} from 'react'
import {callRPC, useHostClient} from '../lib/api.ts'
import {type ContainerList, DockerService} from '../gen/docker/v1/docker_pb.ts'
import {useSnackbar} from "./snackbar.ts"
import {useDockerEvents} from "./docker-events.ts";
import {FAST_POLL_MS, IDLE_POLL_MS, isSettling} from "./container-freshness.ts";

export function useDockerCompose(composeFile: string) {
    const dockerService = useHostClient(DockerService);
    const {showWarning} = useSnackbar()
    // container lifecycle events drive the refresh; polling is a safety net
    const eventBump = useDockerEvents()

    const [containers, setContainers] = useState<ContainerList[]>([])
    const [loading, setLoading] = useState(true)
    const [refreshInterval, setRefreshInterval] = useState(30000)

    const fetchContainers = useCallback(async () => {
        if (!composeFile) {
            setContainers([])
            return
        }

        const {val, err} = await callRPC(() => dockerService.composeList({
            filename: composeFile,
        }))
        if (err) {
            showWarning(`Failed to refresh containers: ${err}`)
            setContainers([])
            return
        }

        setContainers(val?.list || [])
    }, [composeFile, dockerService, showWarning])

    useEffect(() => {
        setLoading(true)
        fetchContainers().then(() => {
            setLoading(false)
        })
    }, [fetchContainers]) // run only once on page load

    // fast cadence while containers settle (start, health checks, restarts),
    // slow safety net once stable
    useEffect(() => {
        const fast = containers.some(c => isSettling(c.state, c.health, c.created));
        setRefreshInterval(fast ? FAST_POLL_MS : IDLE_POLL_MS);
    }, [containers])

    // fetch without setting load
    useEffect(() => {
        fetchContainers().then()
        const intervalId = setInterval(fetchContainers, refreshInterval)
        return () => clearInterval(intervalId)
    }, [fetchContainers, refreshInterval, eventBump])

    return {containers, loading, fetchContainers, refreshInterval, setRefreshInterval}
}
