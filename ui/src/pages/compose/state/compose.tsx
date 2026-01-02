import {ArrowDownward, ArrowUpward, PlayArrow, RestartAlt, Stop, Update} from "@mui/icons-material";
import {create} from 'zustand'
import type {ComposeFile, LogsMessage} from "../../../gen/docker/v1/docker_pb.ts";
import type {CallOptions} from "@connectrpc/connect";
import {makeID, type TabTerminal, useTerminalAction, useTerminalTabs} from "./terminal.tsx";

type ComposeFileClean = Omit<ComposeFile, "$typeName" | "$unknown">;
type ActiveAction = typeof deployActionsConfig[number]['name'];
type ComposeActionStreamFn = (request: ComposeFileClean, options?: CallOptions) => AsyncIterable<LogsMessage>;


export const deployActionsConfig = [
    {
        name: 'up', rpcName: 'composeUp', message: "started", icon: <ArrowUpward/>,
    },
    {
        name: 'down', rpcName: 'composeDown', message: "started", icon: <ArrowDownward/>,
    },
    {
        name: 'start', rpcName: 'composeStart', message: "started", icon: <PlayArrow/>,
    },
    {
        name: 'stop', rpcName: 'composeStop', message: "stopped", icon: <Stop/>,
    },
    {
        name: 'restart', rpcName: 'composeRestart', message: "restarted", icon: <RestartAlt/>,
    },
    {
        name: 'update', rpcName: 'composeUpdate',
        message: "updated", icon: <Update/>,
    },
] as const;

export const useComposeAction = create<{
    activeAction: ActiveAction | null
    runAction: (
        composeFile: string,
        streamFn: ComposeActionStreamFn,
        action: ActiveAction,
        selectedService: string[],
        onDone?: () => void,
    ) => void
    reset: () => void
}>((set, get) => ({
    activeAction: null,
    runAction: (
        composeFile: string,
        streamFn: ComposeActionStreamFn,
        action: ActiveAction,
        selectedService: string[] = [],
        onDone?: () => void,
    ) => {
        set({activeAction: action})

        useTerminalAction.getState().open()

        const abort = new AbortController();
        const stream = streamFn({
            filename: composeFile,
            selectedServices: selectedService,
        }, {signal: abort.signal});

        const title = `${composeFile}-${action}`;
        const tab: TabTerminal = {
            id: makeID(),
            title: title,
            interactive: false,
            onClose: () => {
                // abort.abort("User closed the connection")
            },
            onTerminal: term => {
                const asyncStream = async () => {
                    // console.log("starting stream")
                    try {
                        for await (const item of stream) {
                            term.write(item.message);
                        }
                        onDone?.();
                    } catch (error: unknown) {
                        let err: string
                        if (error instanceof Error && error.name !== 'AbortError') {
                            err = error.message
                        } else {
                            // @ts-expect-error: fuck this dumbass error handling
                            err = error.toString()
                        }

                        term.write(`\r\n\x1b[31mError: ${err}\x1b[0m`);
                    }

                    get().reset()
                };

                asyncStream().then();
            },
        }

        useTerminalTabs.getState().close(title)
        useTerminalTabs.getState().addTab(title, tab)
    },
    reset: () => {
        set({activeAction: null})
    },
}))
