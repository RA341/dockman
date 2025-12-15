import {useCallback, useEffect, useState} from 'react'
import {type Volume} from "../../gen/docker/v1/docker_pb.ts";
import {callRPC, useDockerClient} from "../../lib/api";
import {useSnackbar} from "../../hooks/snackbar.ts";
import {useHost} from "../home/home.tsx";

export function useDockerVolumes() {
    const dockerService = useDockerClient()
    const {showWarning} = useSnackbar()

    const selectedHost = useHost()

    const [volumes, setVolumes] = useState<Volume[]>([])
    const [loading, setLoading] = useState(true)

    const fetchVolumes = useCallback(async () => {
        setLoading(true)

        const {val, err} = await callRPC(() => dockerService.volumeList({}))
        if (err) {
            showWarning(`Failed to refresh containers: ${err}`)
            setVolumes([])
            return
        }

        setVolumes(val?.volumes || [])
    }, [dockerService, selectedHost])

    const loadVolumes = useCallback(() => {
        fetchVolumes().finally(() => setLoading(false))
    }, [fetchVolumes])

    const deleteSelected = async (ids: string[]) => {
        const {err} = await callRPC(() => dockerService.volumeDelete({
            host: selectedHost,
            volumeIds: ids
        }))
        if (err) showWarning(`Error occurred while deleting volumes: ${err}`)
        loadVolumes()
    }

    const deleteUnunsed = async () => {
        const {err} = await callRPC(() => dockerService.volumeDelete({
            host: selectedHost,
            unused: true
        }))
        if (err) showWarning(`Error occurred while deleting volumes: ${err}`)
        loadVolumes()
    }

    const deleteAnonynomous = async () => {
        const {err} = await callRPC(() => dockerService.volumeDelete({
            host: selectedHost,
            anon: true
        }))
        if (err) showWarning(`Error occurred while deleting volumes: ${err}`)
        loadVolumes()
    }

    useEffect(() => {
        loadVolumes()
    }, [loadVolumes])

    return {volumes, loadVolumes, loading, deleteUnunsed, deleteSelected, deleteAnonynomous}
}