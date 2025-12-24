import {useCallback, useEffect, useState} from 'react'
import {callRPC, useDockerClient} from '../lib/api.ts'
import {type ListResponse} from '../gen/docker/v1/docker_pb.ts'
import {useSnackbar} from "./snackbar.ts"
import {useHostStore} from "../pages/compose/state/files.ts";

export function useDockerContainers() {
    const dockerService = useDockerClient()
    const {showWarning} = useSnackbar()
    const selectedHost = useHostStore(state => state.host)

    const [containers, setContainers] = useState<ListResponse | null>(null)
    const [loading, setLoading] = useState(true)
    const [refreshInterval, setRefreshInterval] = useState(2000)

    const fetchContainers = useCallback(async () => {
        const {val, err} = await callRPC(() => dockerService.containerList({}))
        if (err) {
            showWarning(`Failed to refresh containers: ${err}`)
            setContainers(null)
            return
        }

        setContainers(val)
    }, [dockerService, selectedHost])

    const refreshContainers = useCallback(() => {
        fetchContainers().finally(() => setLoading(false))
    }, [fetchContainers]);

    useEffect(() => {
        setLoading(true)
        fetchContainers().then(() => {
            setLoading(false)
        })
    }, [fetchContainers]) // run only once on page load

    useEffect(() => {
        fetchContainers().then()
        const intervalId = setInterval(fetchContainers, refreshInterval)
        return () => clearInterval(intervalId)
    }, [fetchContainers, refreshInterval])

    return {containers, loading, refreshContainers, fetchContainers, refreshInterval, setRefreshInterval}
}