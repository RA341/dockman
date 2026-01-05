import {type Client, ConnectError, createClient} from "@connectrpc/connect";
import {createConnectTransport} from "@connectrpc/connect-web";
import type {DescService} from "@bufbuild/protobuf";
import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import {useParams} from "react-router-dom";

export const API_BASE_URL = import.meta.env.MODE === 'development'
    ? "http://localhost:8866"
    : window.location.origin;

export type ApiScope = 'auth' | 'public' | 'protected' | 'host';

export function getBaseUrl(scope: ApiScope, host?: string): string {
    switch (scope) {
        case 'auth':
            return `${API_BASE_URL}/api/auth`;
        case 'public':
            return `${API_BASE_URL}/api`;
        case 'protected':
            return `${API_BASE_URL}/api/protected`;
        case 'host':
            if (!host) {
                throw new Error("Host scope requires a hostname");
            }
            return `${API_BASE_URL}/api/protected/${host}`;
        default:
            return API_BASE_URL;
    }
}

export function getWSUrl(input: string) {
    const url = new URL(input)
    const baseUrl = url.host
    const proto = url.protocol == "http:" ? "ws" : "wss";
    const path = url.pathname
    return `${proto}://${baseUrl}${path}${url.search}`
}

export function useContainerLogsWsUrl() {
    const getBase = useHostUrl()
    return useCallback((containerId: string) => {
        return getWSUrl(getBase(`/docker/logs/${containerId}`))
    }, [getBase])
}

export function useContainerExecWsUrl() {
    const getBase = useHostUrl()
    return useCallback((containerId: string, entrypoint: string, debuggerImage?: string) => {
        let params: Record<string, string> = {
            "cmd": entrypoint,
        }
        if (debuggerImage) {
            params["debug"] = "true"
            params["image"] = debuggerImage
        }

        const urlParam = new URLSearchParams(params)
        return getWSUrl(getBase(`/docker/exec/${containerId}?${urlParam.toString()}`))
    }, [getBase]);
}

export function withAuthAPI(url: string = "/") {
    return `${getBaseUrl('auth')}${url}`
}

export function withPublicAPI(url: string = "/") {
    return `${getBaseUrl('public')}${url}`
}

export function withProtectedAPI(url: string = "/") {
    return `${getBaseUrl('protected')}${url}`
}

// converts to /api/protected/:host/<url>
export function useHostUrl() {
    const {host} = useParams<{ host: string }>();
    return useCallback((url: string = "/") => {
        return `${getBaseUrl('host', host)}${url}`
    }, [host]);
}

console.log(`API url: ${API_BASE_URL} `)

export function useTransport(scope: ApiScope) {
    const {host} = useParams<{ host: string }>();
    return useMemo(() => {
        return createConnectTransport({
            baseUrl: getBaseUrl(scope, host),
            useBinaryFormat: true,
            // You can add interceptors here (e.g., for adding JWT tokens)
            interceptors: [],
        });
    }, [scope, host]);
}

// Generic client hook
export function useClient<T extends DescService>(
    service: T,
    scope: ApiScope = 'protected'
): Client<T> {
    const transport = useTransport(scope);
    return useMemo(() => createClient(
            service,
            transport
        ),
        [service, transport]
    );
}

// Specialized hook for host-specific routes
export function useHostClient<T extends DescService>(service: T): Client<T> {
    return useClient(service, 'host');
}

// Specialized hook for auth
export function useAuthClient<T extends DescService>(service: T): Client<T> {
    return useClient(service, 'auth');
}

export const useRPCRunner = <T>(
    exec: () => Promise<T>
) => {
    const [loading, setLoading] = useState(false)
    const [err, setErr] = useState("")
    const [val, setVal] = useState<null | T>(null)

    const execRef = useRef(exec);
    useEffect(() => {
        execRef.current = exec;
    }, [exec]);

    const runner = useCallback(async () => {
        setLoading(true)
        setErr("")

        const {val, err} = await callRPC(execRef.current)
        if (err) {
            setVal(null)
            setErr(err)
        } else {
            setVal(val)
        }

        setLoading(false)
    }, []);

    return {runner, val, loading, err}
}

export async function callRPC<T>(exec: () => Promise<T>): Promise<{ val: T | null; err: string; }> {
    try {
        const val = await exec()
        return {val, err: ""}
    } catch (error: unknown) {
        if (error instanceof ConnectError) {
            console.error(`Error: ${error.message}`);
            // todo maybe ?????
            // if (error.code == Code.Unauthenticated) {
            //     nav("/")
            //
            return {val: null, err: `${error.rawMessage}`};
        }

        return {val: null, err: `Unknown error while calling api: ${(error as Error).toString()}`};
    }
}

export async function pingWithAuth() {
    try {
        console.log("Checking authentication status with server...");
        const response = await fetch(withProtectedAPI("/ping"), {
            redirect: 'follow'
        });

        if (response.status == 302) {
            const location = await response.text();
            console.log(`oidc is enabled redirecting to oidc auth: ${location}`);
            window.location.assign(location)

            return false
        }

        console.log(`Server response isOK: ${response.ok}`);
        return response.ok
    } catch (error) {
        console.error("Authentication check failed:", error);
        return false
    }
}

export function formatDate(timestamp: bigint | number | string) {
    const numericTimestamp = typeof timestamp === 'bigint' ?
        // convert to ms from seconds
        Number(timestamp) * 1000 :
        timestamp;
    return new Date(numericTimestamp).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

