import {Delete, PlayArrow, RestartAlt, Stop, Update} from "@mui/icons-material";
import {atom} from "jotai";
import {create} from 'zustand'
import {type ComposeFile, type ContainerLogsRequest, type LogsMessage} from "../../../gen/docker/v1/docker_pb.ts";
import type {CallOptions} from "@connectrpc/connect";
import {transformAsyncIterable} from "../../../lib/api.ts";
import type {ITerminalInitOnlyOptions, ITerminalOptions} from "@xterm/xterm";

interface ActiveComposeFileState {
    activeComposeFile: string | null;
    setFile: (composeFile: string) => void;
}

export const useActiveComposeFile = create<ActiveComposeFileState>((set) => ({
    activeComposeFile: null,
    setFile: (composeFile: string) => set({activeComposeFile: composeFile}),
}));

export const deployActionsConfig = [
    {
        name: 'start', rpcName: 'composeStart', message: "started", icon: <PlayArrow/>,
    },
    {
        name: 'stop', rpcName: 'composeStop', message: "stopped", icon: <Stop/>,
    },
    {
        name: 'remove', rpcName: 'composeRemove', message: "removed", icon: <Delete/>,
    },
    {
        name: 'restart', rpcName: 'composeRestart', message: "restarted", icon: <RestartAlt/>,
    },
    {
        name: 'update', rpcName: 'composeUpdate',
        message: "updated", icon: <Update/>,
    },
] as const;

type ActiveAction = typeof deployActionsConfig[number]['name'];
type ComposeFileClean = Omit<ComposeFile, "$typeName" | "$unknown">;
type ComposeActionStreamFn = (request: ComposeFileClean, options?: CallOptions) => AsyncIterable<LogsMessage>;

type ContainerLogsClean = Omit<ContainerLogsRequest, "$typeName" | "$unknown">;
type ContainerLogsStreamFn = (request: ContainerLogsClean, options?: CallOptions) => AsyncIterable<LogsMessage>;

export const terminalConfig: ITerminalOptions & ITerminalInitOnlyOptions = {
    theme: {
        background: '#1E1E1E',
        foreground: '#CCCCCC'
    },
    // theme: {background: '#1E1E1E', foreground: '#CCCCCC'},
    scrollback: 5000,
    fontSize: 13,
    lineHeight: 1.2,
    fontFamily: 'monospace, Menlo, Monaco, "Courier New"',
}
export const containerClassName = 'logs-terminal-container';
export const scrollbarStyles = `
        .${containerClassName} .xterm-viewport::-webkit-scrollbar { width: 8px; height: 8px; }
        .${containerClassName} .xterm-viewport::-webkit-scrollbar-track { background: rgba(255, 255, 255, 0.1); border-radius: 4px; }
        .${containerClassName} .xterm-viewport::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.3); border-radius: 4px; }
        .${containerClassName} .xterm-viewport::-webkit-scrollbar-thumb:hover { background: rgba(255, 255, 255, 0.5); }
        .${containerClassName} .xterm-viewport { scrollbar-width: thin; scrollbar-color: rgba(255, 255, 255, 0.3) rgba(255, 255, 255, 0.1); }
    `;


export const useContainerExec = create<{
    execParams: (
        title: string,
        wsUrl: string,
    ) => void
}>(() => ({
    execParams: (title, wsUrl) => {
        useTerminalAction.getState().open()

        const term: TabTerminal = {
            id: title,
            title: title,
            wsUrl: wsUrl,
            // cache: [],
            // error: null,
        }

        useTerminalTabs.getState().addTab(title, term)
    },
}))


export const useContainerLogs = create<{
    streamLogs: (
        title: string,
        input: ContainerLogsClean,
        streamFn: ContainerLogsStreamFn,
    ) => void
}>(() => ({
    streamLogs: (title, input, streamFn) => {
        useTerminalAction.getState().open()

        const abort = new AbortController();
        const stream = streamFn(input, {signal: abort.signal});

        const term: TabTerminal = {
            id: title,
            title: title,
            controller: abort,
            stream: null,
            // cache: [],
            // error: null,
        }

        useTerminalTabs.getState().addTab(title, term)

        const transformedStream = transformAsyncIterable(stream, {
            transform: item => {
                const message = item.message;
                // useTerminalTabs.getState().updateTab(title, curTab => ({
                //     ...curTab,
                //     cache: [...curTab.cache, message]
                // }))
                return message
            },
            onComplete: () => {
                useTerminalTabs.getState().updateTab(title, curTab => ({
                    ...curTab,
                    stream: null,
                }))
            },
            onError: (err) => {
                console.log("Error while streaming", err)
                const message = `Error streaming logs: ${err}`;
                useTerminalTabs.getState().updateTab(title, curTab => ({
                    ...curTab,
                    error: message
                }))
            },
        });

        useTerminalTabs.getState().updateTab(title, curTab => ({
            ...curTab,
            stream: transformedStream,
        }))
    },
}))

export const useComposeAction = create<{
    activeAction: ActiveAction | null
    runAction: (
        streamFn: ComposeActionStreamFn,
        action: ActiveAction,
        selectedService: string[],
        onDone?: () => void
    ) => void
    reset: () => void
}>((set, get) => ({
    activeAction: null,
    runAction: (
        streamFn: ComposeActionStreamFn,
        action: ActiveAction,
        selectedService: string[] = [],
        onDone?: () => void
    ) => {
        const composeFile = useActiveComposeFile.getState().activeComposeFile;
        if (!composeFile) {
            console.warn("No file selected")
            return;
        }

        set({activeAction: action})

        useTerminalAction.getState().open()

        const abort = new AbortController();
        const stream = streamFn({
            filename: composeFile,
            selectedServices: selectedService,
        }, {signal: abort.signal});

        const title = `${composeFile}-${action}`;

        const term: TabTerminal = {
            id: title,
            title: title,
            controller: abort,
            stream: null,
            // cache: [],
            // error: null,
        }

        useTerminalTabs.getState().addTab(title, term)

        const transformedStream = transformAsyncIterable(stream, {
            transform: item => {
                const message = item.message;
                // useTerminalTabs.getState().updateTab(title, curTab => ({
                //     ...curTab,
                //     cache: [...curTab.cache, message]
                // }))
                return message
            },
            onComplete: () => {
                useTerminalTabs.getState().updateTab(title, curTab => ({
                    ...curTab,
                    stream: null,
                }))

                onDone?.()
            },
            onFinally: get().reset,
            onError: (err) => {
                const message = `Error streaming logs: ${err}`;
                useTerminalTabs.getState().updateTab(title, curTab => ({
                    ...curTab,
                    error: message
                }))
            },
        });

        useTerminalTabs.getState().updateTab(title, curTab => ({
            ...curTab,
            stream: transformedStream,
        }))
    },
    reset: () => {
        set({activeAction: null})
    },
}))

export interface TabTerminal {
    id: string;
    title: string;
    stream?: AsyncIterable<string> | null;
    controller?: AbortController;
    wsUrl?: string;

    // cache: string[]; // stores the logs from the async iterable
    // error: string | null;
}

export const useTerminalTabs = create<{
    tabs: Map<string, TabTerminal>;
    activeTab: string | null;
    setActiveTab: (tabId: string) => void;
    addTab: (id: string, term: TabTerminal) => void;
    updateTab: (id: string, term: (curTab: TabTerminal) => TabTerminal) => void;
    close: (tabId: string) => void;
}>(
    (set, get) => ({
        tabs: new Map<string, TabTerminal>(),
        activeTab: null,
        setActiveTab: (tabId: string) => {
            set(() => ({
                activeTab: tabId
            }))
        },
        updateTab: (id, term) => {
            const tab = get().tabs.get(id)
            if (!tab) {
                console.warn(`Unable to update: No tab with id found ${id}`)
                return
            }

            const updatedTab = term(tab)

            set(state => {
                const newTabs = new Map(state.tabs);
                newTabs.set(id, updatedTab)
                return {
                    tabs: newTabs,
                };
            })
        },
        addTab: (id, term) => {
            set(state => {
                const newTabs = new Map(state.tabs);
                newTabs.set(id, term)
                return {
                    tabs: newTabs,
                    activeTab: id
                };
            })
        },
        close: tabId => {
            set(state => {
                const newTabs = new Map(state.tabs);
                newTabs.delete(tabId);

                // If closing active tab, switch to another or null
                const newActiveTab = state.activeTab === tabId
                    ? (newTabs.size > 0 ? Array.from(newTabs.keys())[0] : null)
                    : state.activeTab;

                return {
                    tabs: newTabs,
                    activeTab: newActiveTab
                };
            });
        },
    })
)

// interface ComposeActionStreamArgs<T> {
//     id: string;
//     getStream: (signal: AbortSignal) => AsyncIterable<T>;
//     transform: (item: T) => string;
//     title: string;
//     inputFn?: (cmd: string) => void,
//     onSuccess?: () => void;
//     onFinalize?: () => void;
// }
//
// const useComposeActionStream = create((set) => ({
//     activeStream: null,
//     error: null,
//     runAction: async () => {
//         const newController = new AbortController();
//
//         const sourceStream = getStream(newController.signal);
//
//         const transformedStream = transformAsyncIterable(sourceStream, {
//             transform,
//             onComplete: () => onSuccess?.(),
//             onError: (err) => {
//                 // Don't show an error dialog if the stream was intentionally aborted
//                 if (!newController.signal.aborted) {
//                     set({activeAction: null, err: `Error streaming logs: ${err}`})
//                 }
//             },
//             onFinally: () => onFinalize?.(),
//         });
//
//         const newTab: LogTab = {
//             id,
//             title,
//             stream: transformedStream,
//             controller: newController,
//             inputFn: inputFn
//         };
//
//         setLogTabs(prev => [...prev, newTab]);
//         setActiveTabId(id);
//         setIsLogPanelMinimized(false); // Always expand panel for a new tab
//     },
// }))

export const useTerminalAction = create<{
    isTerminalOpen: boolean;
    toggle: () => void;
    open: () => void
    close: () => void
}>(set => ({
    isTerminalOpen: false,
    toggle: () => set(state => ({
        isTerminalOpen: !state.isTerminalOpen
    })),
    open: () => set(() => ({
        isTerminalOpen: true
    })),
    close: () => set(() => ({
        isTerminalOpen: false
    })),
}));

export const useSideBarAction = create<{ isSidebarOpen: boolean; toggle: () => void }>(set => ({
    isSidebarOpen: false,
    toggle: () => set(state => ({
        isSidebarOpen: !state.isSidebarOpen
    })),
}));

export const openFiles = atom(new Set<string>())

// todo refactor sidebar
export const useOpenFiles = create<{
    openFiles: Set<string>;
    add: (file: string) => void,
    del: (file: string) => void
}>((set) => ({
    openFiles: new Set<string>(),
    add: (file: string) => {
        set((state) => {
            const newOpenFiles = new Set(state.openFiles);
            newOpenFiles.add(file);
            return {openFiles: newOpenFiles};
        });
    },
    del: (file: string) => {
        set((state) => {
            const newOpenFiles = new Set(state.openFiles);
            newOpenFiles.delete(file);
            return {openFiles: newOpenFiles};
        });
    }
}));
