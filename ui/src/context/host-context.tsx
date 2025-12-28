import {createContext, type ReactNode, useCallback, useContext, useEffect, useState} from 'react'
import {callRPC, useClient} from '../lib/api'
import {useSnackbar} from '../hooks/snackbar'
import {useLocation, useNavigate} from "react-router-dom";
import {HostManagerService} from "../gen/host/v1/host_pb.ts";

interface HostContextType {
    getHost: () => string;
    availableHosts: string[];
    isLoading: boolean;
    setHost: (machine: string) => void;
    fetchHosts: () => Promise<void>;
}

export const HostContext = createContext<HostContextType | undefined>(undefined);

export function useHostManager() {
    const context = useContext(HostContext);
    if (context === undefined) {
        throw new Error('useHostManager must be used within a HostProvider');
    }
    return context;
}

const HostKey = 'host';

function HostProvider({children}: { children: ReactNode }) {
    const hostManagerClient = useClient(HostManagerService)
    const {showError} = useSnackbar()

    const [availableHosts, setAvailableHosts] = useState<string[]>([])
    const [isLoading, setLoading] = useState(true)
    const [selectedHost,] = useState("")

    const fetchHosts = useCallback(async () => {
        setLoading(true)
        const {val, err} = await callRPC(() => hostManagerClient.listConnectedHosts({}))
        if (err) {
            showError(err)
            setLoading(false)
            return
        }

        setAvailableHosts(val?.hosts || [])
        setLoading(false)
    }, [hostManagerClient]);

    useEffect(() => {
        fetchHosts().then()
    }, [fetchHosts])

    const nav = useNavigate()
    const {pathname} = useLocation()

    const setHost = (host: string) => {
        // Example: "/local/containers" -> ["", "local", "containers"]
        const segments = pathname.split('/');
        // Replace the host segment (which is index 1)
        segments[1] = host;
        // Example: "/remote/containers"
        const newPath = segments.join('/');
        nav(newPath);
    }

    const value = {availableHosts, selectedHost, isLoading, setHost, fetchHosts, getHost}
    return (
        <HostContext.Provider value={value}>
            {children}
        </HostContext.Provider>
    )
}

export const getHost = () => {
    return localStorage.getItem(HostKey) ?? "local";
}

export default HostProvider
