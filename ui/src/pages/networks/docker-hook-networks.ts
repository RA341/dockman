import {useCallback, useEffect, useState} from 'react'
import {callRPC, useHostClient} from "../../lib/api.ts";
import {DockerService, type Network} from "../../gen/docker/v1/docker_pb.ts";
import {useSnackbar} from "../../hooks/snackbar.ts";
import {useHostStore} from "../compose/state/files.ts";

export function useDockerNetwork() {
    const dockerService = useHostClient(DockerService)
    const {showWarning} = useSnackbar()
    const selectedHost = useHostStore(state => state.host)

    const [networks, setNetworks] = useState<Network[]>([])
    const [loading, setLoading] = useState(true)

    const fetchNetworks = useCallback(async () => {
        setLoading(true)

        const {val, err} = await callRPC(() => dockerService.networkList({}))
        if (err) {
            showWarning(`Failed to refresh networks: ${err}`)
            setNetworks([])
            return
        }

        setNetworks(val?.networks || [])
    }, [dockerService, selectedHost])

    const deleteSelected = async (networkIDs: string[]) => {
        const {err} = await callRPC(() => dockerService.networkDelete({
                networkIds: networkIDs
            })
        )
        if (err) {
            showWarning(`Failed to delete networks: ${err}`)
        }

        loadNetworks()
    }

    const networkPrune = async () => {
        const {err} = await callRPC(() => dockerService.networkDelete({
            prune: true
        }))
        if (err) {
            showWarning(`Failed to delete networks: ${err}`)
        }

        loadNetworks()
    }

    const loadNetworks = useCallback(() => {
        fetchNetworks().finally(() => setLoading(false))
    }, [fetchNetworks])

    useEffect(() => {
        loadNetworks()
    }, [loadNetworks])

    return {networks, loading, loadNetworks, networkPrune, deleteSelected}
}