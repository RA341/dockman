import {type Client, Code, ConnectError, createClient} from "@connectrpc/connect";
import {createConnectTransport} from "@connectrpc/connect-web";
import type {DescService} from "@bufbuild/protobuf";
import {useMemo} from "react";

export const API_URL = import.meta.env.MODE === 'development'
    ? "http://localhost:8866"
    : window.location.origin;

export function getWSUrl(path: string) {
    const url = new URL(API_URL);
    const baseUrl = url.host
    const proto = url.protocol == "http:" ? "wss" : "ws";

    return `${proto}://${baseUrl}/${path}`
}

console.log(`API url: ${API_URL} `)

const transport = createConnectTransport({
    baseUrl: API_URL,
    useBinaryFormat: true,
})

export function useClient<T extends DescService>(service: T): Client<T> {
    return useMemo(() => createClient(service, transport), [service]);
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


export async function uploadFile(filename: string, contents: string): Promise<string> {
    try {
        const formData = new FormData();
        const file = new File([contents], filename);

        formData.append('contents', file, btoa(filename));

        const response = await fetch(`${API_URL}/api/file/save`, {
            method: 'POST',
            body: formData,
        });

        if (!response.ok) {
            const errorText = await response.text();
            return `Server error: ${response.status} ${response.statusText} - ${errorText}`
        }

        console.log(`Uploaded ${file}, response status: ${response.status}`);
        return "";
    } catch (error: any) {
        console.error(`Error: ${error.message}`);
        return `Server error: ${error.message}`;
    }
}

export async function pingWithAuth() {
    try {
        console.log("Checking authentication status with server...");
        const response = await fetch('/auth/ping');
        console.log(`Server response isOK: ${response.ok}`);
        return response.ok
    } catch (error) {
        console.error("Authentication check failed:", error);
        return false
    }
}

export async function downloadFileAtCommit(filename: string, commitId: string): Promise<{ file: string; err: string }> {
    return download(`api/git/load/${encodeURIComponent(filename)}/${encodeURIComponent(commitId)}`);
}

export async function downloadFile(filename: string): Promise<{ file: string; err: string }> {
    return download(`api/file/load/${encodeURIComponent(filename)}`)
}

async function download(subPath: string) {
    try {
        const response = await fetch(
            `${API_URL}/${subPath}`,
            {cache: 'no-cache'}
        );
        if (!response.ok) {
            return {file: "", err: `Failed to download file: ${response.status} ${response.statusText}`};
        }
        const fileData = await response.text()
        return {file: fileData, err: ""};
    } catch (error: unknown) {
        console.error(`Error: ${(error as Error).toString()}`);
        return {file: "", err: (error as Error).toString()};
    }
}

interface TransformAsyncIterableOptions<T, U> {
    transform: (item: T) => U | Promise<U>;
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
            yield await transform(item);
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

