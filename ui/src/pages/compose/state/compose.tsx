import {ArrowDownward, ArrowUpward, PlayArrow, RestartAlt, Stop, Update} from "@mui/icons-material";
import {create} from 'zustand'
import type {ComposeFile, LogsMessage} from "../../../gen/docker/v1/docker_pb.ts";
import type {CallOptions} from "@connectrpc/connect";
import {makeID, type TabTerminal, useTerminalAction, useTerminalTabs} from "./terminal.tsx";

type ComposeFileClean = Omit<ComposeFile, "$typeName" | "$unknown">;
// 'redeploy' is triggered from the monitor view (compose up with force
// flags); it has no entry in the deploy button config
type ActiveAction = typeof deployActionsConfig[number]['name'] | 'redeploy';
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

// cap on the retained raw output of one action run
const OUTPUT_CAP = 1024 * 1024;

export interface ActionRun {
    file: string;
    action: ActiveAction;
    // raw ANSI output, replayable into a terminal at any time
    output: string;
    running: boolean;
    failed: boolean;
}

// Compose actions run in the background: the stream is consumed into a
// capped buffer instead of force-opening a terminal tab, the caller gets a
// completion callback for toasts, and openOutput replays (and follows) the
// captured output in the bottom panel only when the user asks for it.
export const useComposeAction = create<{
    activeAction: ActiveAction | null
    // last (or current) run per compose file
    runs: Record<string, ActionRun>
    runAction: (
        composeFile: string,
        streamFn: ComposeActionStreamFn,
        action: ActiveAction,
        selectedService: string[],
        onDone?: (error?: string) => void,
    ) => void
    openOutput: (composeFile: string) => void
    reset: () => void
}>((set, get) => ({
    activeAction: null,
    runs: {},

    runAction: (
        composeFile: string,
        streamFn: ComposeActionStreamFn,
        action: ActiveAction,
        selectedService: string[] = [],
        onDone?: (error?: string) => void,
    ) => {
        set(state => ({
            activeAction: action,
            runs: {
                ...state.runs,
                [composeFile]: {file: composeFile, action, output: '', running: true, failed: false},
            },
        }))

        const append = (text: string) => {
            set(state => {
                const run = state.runs[composeFile];
                if (!run) return state;
                let output = run.output + text;
                if (output.length > OUTPUT_CAP) output = output.slice(-OUTPUT_CAP);
                return {runs: {...state.runs, [composeFile]: {...run, output}}};
            })
        }

        const finish = (failed: boolean) => {
            set(state => {
                const run = state.runs[composeFile];
                const runs = run
                    ? {...state.runs, [composeFile]: {...run, running: false, failed}}
                    : state.runs;
                return {activeAction: null, runs};
            })
        }

        const stream = streamFn({
            filename: composeFile,
            selectedServices: selectedService,
        });

        const consume = async () => {
            try {
                for await (const item of stream) {
                    append(item.message);
                }
                finish(false);
                onDone?.();
            } catch (error: unknown) {
                const err = error instanceof Error ? error.message : String(error);
                append(`\r\n\x1b[31mError: ${err}\x1b[0m\r\n`);
                finish(true);
                onDone?.(err);
            }
        };
        void consume();
    },

    // opens (or focuses) a terminal tab in the bottom panel that replays the
    // captured output and keeps following it while the action still runs
    openOutput: (composeFile: string) => {
        useTerminalAction.getState().open()
        const tabsStore = useTerminalTabs.getState()
        const key = `action-output:${composeFile}`

        if (tabsStore.tabs.has(key)) {
            tabsStore.setActiveTab(key)
            return
        }

        let unsub: (() => void) | null = null;
        const tab: TabTerminal = {
            id: makeID(),
            title: `${composeFile}: actions`,
            interactive: false,
            onClose: () => {
                unsub?.()
            },
            onTerminal: term => {
                let written = 0;
                const sync = (run?: ActionRun) => {
                    if (!run) return;
                    if (run.output.length < written) {
                        // a new action started over: replay from scratch
                        term.clear();
                        written = 0;
                    }
                    if (run.output.length > written) {
                        term.write(run.output.slice(written));
                        written = run.output.length;
                    }
                };
                sync(get().runs[composeFile]);
                unsub = useComposeAction.subscribe(state => sync(state.runs[composeFile]));
            },
        }
        tabsStore.addTab(key, tab)
    },

    reset: () => {
        set({activeAction: null})
    },
}))
