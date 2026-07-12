import {useCallback, useEffect, useRef, useState} from 'react';
import {callRPC, useHostClient} from '../lib/api.ts';
import {type ContainerStats, DockerService, ORDER, SORT_FIELD} from '../gen/docker/v1/docker_pb.ts';
import {useSnackbar} from "./snackbar.ts";
import {useHostStore} from "../pages/compose/state/files.ts";
import {useConfig} from "./config.ts";

// This map remains very useful for clean, client-side sorting.
const sortFieldToKeyMap: Record<SORT_FIELD, keyof ContainerStats> = {
    [SORT_FIELD.NAME]: 'name',
    [SORT_FIELD.CPU]: 'cpuUsage',
    [SORT_FIELD.MEM]: 'memoryUsage',
    [SORT_FIELD.NETWORK_RX]: 'networkRx',
    [SORT_FIELD.NETWORK_TX]: 'networkTx',
    [SORT_FIELD.DISK_R]: 'blockRead',
    [SORT_FIELD.DISK_W]: 'blockWrite',
};

// Maps a dockman.yml `stats.sort.field` string to a SORT_FIELD. Accepts the
// column labels and a few obvious aliases, case-insensitively. Falls back to
// MEM, preserving the historical default.
const configFieldToSortField = (field?: string): SORT_FIELD => {
    switch ((field ?? '').trim().toLowerCase()) {
        case 'name':
        case 'container':
            return SORT_FIELD.NAME;
        case 'cpu':
        case 'cpu usage':
            return SORT_FIELD.CPU;
        case 'mem':
        case 'memory':
        case 'memory usage':
            return SORT_FIELD.MEM;
        case 'network_rx':
        case 'rx':
            return SORT_FIELD.NETWORK_RX;
        case 'network_tx':
        case 'tx':
            return SORT_FIELD.NETWORK_TX;
        case 'disk_r':
        case 'disk read':
            return SORT_FIELD.DISK_R;
        case 'disk_w':
        case 'disk write':
            return SORT_FIELD.DISK_W;
        default:
            return SORT_FIELD.MEM;
    }
};

const configOrderToOrder = (order?: string): ORDER =>
    (order ?? '').trim().toLowerCase() === 'asc' ? ORDER.ASC : ORDER.DSC;

export function useDockerStats(selectedPage?: string) {
    const dockerService = useHostClient(DockerService)
    const {showError} = useSnackbar();
    const selectedHost = useHostStore(state => state.host)
    const {dockYaml} = useConfig();

    const [rawContainers, setRawContainers] = useState<ContainerStats[]>([]);
    const [loading, setLoading] = useState(true);

    const [sortField, setSortField] = useState(SORT_FIELD.MEM);
    const [sortOrder, setSortOrder] = useState(ORDER.DSC);
    const [refreshInterval, setRefreshInterval] = useState(2500);
    const isInitialLoad = useRef(true);
    const resort = useRef(false)
    // Once the user sorts by hand we stop applying the dockman.yml default so a
    // late-arriving (or per-host) config never clobbers their choice.
    const userSorted = useRef(false)

    // Seed the sort from dockman.yml (stats.sort) until the user sorts manually.
    useEffect(() => {
        if (userSorted.current) return;
        const cfg = dockYaml?.statsPage?.sort;
        if (!cfg) return;
        setSortField(configFieldToSortField(cfg.sortField));
        setSortOrder(configOrderToOrder(cfg.sortOrder));
    }, [dockYaml]);

    useEffect(() => {
        let isCancelled = false;

        const fetchData = async () => {
            const {val, err} = await callRPC(() => dockerService.containerStats({
                sortBy: sortField,
                order: sortOrder,
                host: selectedHost,
                file: selectedPage ? {filename: selectedPage} : undefined
            }));

            if (isCancelled) return;

            if (err) {
                showError(err);
            } else {
                setRawContainers(val?.containers || []);
            }

            if (isInitialLoad.current) {
                setLoading(false);
                isInitialLoad.current = false;
            }
        };

        fetchData();

        const intervalId = setInterval(fetchData, refreshInterval);

        return () => {
            clearInterval(intervalId);
            isCancelled = true;
        };
    }, [selectedHost, dockerService, selectedPage, sortField, sortOrder, refreshInterval]);

    useEffect(() => {
        // clear containers on host change
        setRawContainers([])
        setLoading(true)
        isInitialLoad.current = true;
        // re-apply the configured default for the newly selected host
        userSorted.current = false;
    }, [selectedHost]);

    // Optimistic Client-Side Sorting
    // This useMemo provides the INSTANT sort feedback to the UI.
    // It runs immediately whenever `rawContainers` or the sort state changes.
    useEffect(() => {
        if (resort.current) {
            // sort and let the server handle subsequent sorts until order is changed
            resort.current = false
            const key = sortFieldToKeyMap[sortField];
            const res = [...rawContainers].sort((a, b) => {
                const valA = a[key];
                const valB = b[key];
                let comparison = 0;

                if (typeof valA === 'bigint' && typeof valB === 'bigint') {
                    if (valA < valB) comparison = -1;
                    if (valA > valB) comparison = 1;
                } else if (typeof valA === 'number' && typeof valB === 'number') {
                    comparison = valA - valB;
                } else {
                    comparison = String(valA).localeCompare(String(valB));
                }

                return sortOrder === ORDER.ASC ? comparison : -comparison;
            })
            setRawContainers(res)
        }
    }, [rawContainers, sortField, sortOrder]);


    const handleSortChange = useCallback((newField: SORT_FIELD, newOrderBy: ORDER) => {
        userSorted.current = true
        setSortField(newField)
        setSortOrder(newOrderBy)
        // immediate resort for ui
        resort.current = true
    }, []);

    return {
        containers: rawContainers,
        loading,
        sortField,
        sortOrder,
        handleSortChange,
        setRefreshInterval,
        refreshInterval,
    };
}
