import {useCallback, useEffect, useState} from 'react'
import {DockerService, type Volume} from "../../gen/docker/v1/docker_pb.ts";
import {callRPC, useHostClient} from "../../lib/api";
import {useSnackbar} from "../../hooks/snackbar.ts";
import {useHostStore} from "../compose/state/files.ts";

export function useDockerVolumes() {
    const dockerService = useHostClient(DockerService)
    const {showWarning} = useSnackbar()

    const selectedHost = useHostStore(state => state.host)

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