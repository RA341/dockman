import {type Client, Code, ConnectError, createClient} from "@connectrpc/connect";
import {createConnectTransport} from "@connectrpc/connect-web";
import type {DescService} from "@bufbuild/protobuf";
import {useEffect, useMemo} from "react";
import {DockerService} from "../gen/docker/v1/docker_pb.ts";
import {useHost} from "../pages/home/home.tsx";
import {FileService} from "../gen/files/v1/files_pb.ts";
import {CleanerService} from "../gen/cleaner/v1/cleaner_pb.ts";

export const API_URL = import.meta.env.MODE === 'development'
    ? "http://localhost:8866"
    : window.location.origin;

export function getWSUrl(path: string) {
    const url = new URL(API_URL);
    const baseUrl = url.host
    const proto = url.protocol == "http:" ? "ws" : "wss";

    return `${proto}://${baseUrl}/${path}`
}

console.log(`API url: ${API_URL} `)

export const DOCKER_HOST = "DOCKER_HOST";
const transport = createConnectTransport({
    baseUrl: API_URL,
    useBinaryFormat: true,
    interceptors: [(next) => async (req) => {
        req.header.set(DOCKER_HOST, hosRef.dockerHost);
        return await next(req);
    }],
})

export function useClient<T extends DescService>(service: T): Client<T> {
    return useMemo(() => createClient(service, transport), [service]);
}

export const hosRef = {
    dockerHost: ""
}

export const useCleanerClient = () => {
    const host = useHost()
    useEffect(() => {
        hosRef.dockerHost = host
    }, [host]);
    return useClient(CleanerService);
};

export const useDockerClient = () => {
    const host = useHost()
    useEffect(() => {
        hosRef.dockerHost = host
    }, [host]);

    return useClient(DockerService);
};

export const useFileClient = () => {
    const host = useHost()
    useEffect(() => {
        hosRef.dockerHost = host
    }, [host]);
    return useClient(FileService);
};


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
        const response = await fetch('/auth/ping', {
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

interface TransformAsyncIterableOptions<T, U> {
    transform: (item: T) => U;
    onComplete?: () => void;
    onError?: (error: string) => void;
    onFinally?: () => void;
}

/**
 * A generic function to transform items from a source async iterable,
 * with callbacks for handling completion, errors, and final cleanup.
 *
 * @param source The source async iterable.
 * @param options An object containing the transform function and optional lifecycle callbacks.
 * @returns A new async iterable with transformed items.
 */
export async function* transformAsyncIterable<T, U>(
    source: AsyncIterable<T>,
    options: TransformAsyncIterableOptions<T, U>
): AsyncIterable<U> {
    const {transform, onComplete, onError, onFinally} = options;

    try {
        for await (const item of source) {
            yield transform(item);
        }
        // The stream completed without any errors.
        onComplete?.();
    } catch (error: unknown) {
        if (error instanceof ConnectError && error.code === Code.Canceled) {
            console.log("Stream was cancelled:", error.message);
            return; // Don't show an error dialog for user-cancellation.
        }

        let errMessage = "An error occurred while streaming.";
        if (error instanceof ConnectError) {
            errMessage += `\n${error.code} ${error.name}: ${error.message}`;
        } else if (error instanceof Error) {
            errMessage += `\nUnknown Error: ${error.toString()}`;
        }

        onError?.(errMessage);
        // throw error;
    } finally {
        onFinally?.();
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

