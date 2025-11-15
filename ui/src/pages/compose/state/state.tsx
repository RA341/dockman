import {Delete, PlayArrow, RestartAlt, Stop, Update} from "@mui/icons-material";
import {atom} from "jotai";
import {create} from 'zustand'
import {type ComposeFile, type LogsMessage} from "../../../gen/docker/v1/docker_pb.ts";
import type {CallOptions} from "@connectrpc/connect";
import {transformAsyncIterable} from "../../../lib/api.ts";

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

export const useComposeAction = create<{
    activeAction: ActiveAction | null
    error: string | null
    abortController: AbortController | null
    actionStream: AsyncIterable<string> | null
    runAction: (
        streamFn: ComposeActionStreamFn,
        action: ActiveAction,
        selectedService: string[]
    ) => void
    cancel: (message: string) => void
    reset: () => void
    clearErr: () => void
}>((set, get) => ({
    activeAction: null,
    abortController: null,
    error: null,
    actionStream: null,
    runAction: (
        streamFn: ComposeActionStreamFn,
        action: ActiveAction,
        selectedService: string[] = []
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
            cache: [],
            error: null,
        }

        useTerminalTabs.getState().addTab(title, term)

        const transformedStream = transformAsyncIterable(stream, {
            transform: item => {
                const message = item.message;
                useTerminalTabs.getState().updateTab(title, curTab => ({
                    ...curTab,
                    cache: [...curTab.cache, message]
                }))
                return message
            },
            onComplete: () => {
                useTerminalTabs.getState().updateTab(title, curTab => ({
                    ...curTab,
                    stream: null,
                }))
            },
            onFinally: get().reset,
            onError: (err) => {
                const message = `Error streaming logs: ${err}`;
                useTerminalTabs.getState().updateTab(title, curTab => ({
                    ...curTab,
                    error: message
                }))
                get().cancel(message)
            },
        });

        useTerminalTabs.getState().updateTab(title, curTab => ({
            ...curTab,
            stream: transformedStream,
        }))

    },
    cancel: (reason: string) => {
        if (get().abortController) {
            get().abortController?.abort(reason)
            console.info(`cancelling action ${get().activeAction}`)
        } else {
            console.warn("Empty abort controller")
        }

        get().reset()
    },
    reset: () => {
        set({activeAction: null, actionStream: null, abortController: null})
    },
    clearErr: () => {
        set({error: null})
    }
}))

export interface TabTerminal {
    id: string;
    title: string;
    stream: AsyncIterable<string> | null;
    cache: string[]; // stores the logs from the async iterable
    error: string | null;
    controller: AbortController;
    inputFn?: (cmd: string) => void,
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
