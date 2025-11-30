import {Delete, PlayArrow, RestartAlt, Stop, Update} from "@mui/icons-material";
import {atom} from "jotai";
import {create} from 'zustand'
import {type ComposeFile, type LogsMessage} from "../../../gen/docker/v1/docker_pb.ts";
import type {CallOptions} from "@connectrpc/connect";
import type {Terminal} from "@xterm/xterm";

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

const writeTermErr = (term: Terminal, err: string) => {
    console.error("Error", err);
    term.write('\r\n\x1b[31m*** Error ***\n');
    term.write(`${err}\x1b[0m\r`);
}

export function interactiveTermFn(term: Terminal, wsUrl: string) {
    try {
        const ws = new WebSocket(wsUrl);
        ws.binaryType = "arraybuffer";

        ws.onopen = () => {
            term.write('\x1b[32m*** Connected to Container ***\x1b[0m\r\n');
            term.focus();
        };

        ws.onmessage = (event) => {
            term.write(
                typeof event.data === 'string' ?
                    event.data :
                    new Uint8Array(event.data)
            );
        };

        ws.onclose = () => {
            term.write('\r\n\x1b[31m*** Connection Closed ***\x1b[0m\r\n');
            // onClose?.()
        };

        ws.onerror = (err) => {
            writeTermErr(term, err.toString());
        };

        term.onData((data) => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(data);
            }
        });
    } catch (e: unknown) {
        // @ts-expect-error: dumbass language
        writeTermErr(term, e.toString());
    }
}

export const useContainerExec = create<{
    execParams: (
        title: string,
        wsUrl: string,
        interactive: boolean,
    ) => void
}>(() => ({
    execParams: (title, wsUrl, interactive) => {
        useTerminalAction.getState().open()

        const tab: TabTerminal = {
            id: window.crypto.randomUUID(),
            title: title,
            interactive: interactive,
            onTerminal: term => {
                interactiveTermFn(term, wsUrl);
            },

        }

        useTerminalTabs.getState().addTab(title, tab)
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
        const tab: TabTerminal = {
            id: window.crypto.randomUUID(),
            title: title,
            interactive: false,
            onTerminal: term => {
                const asyncStream = async () => {
                    console.log("starting stream")
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

                        term.write(`\r\n\x1b[31mStream Error: ${err}\x1b[0m`);
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

export interface TabTerminal {
    id: string;
    title: string;
    onTerminal: (term: Terminal) => void;
    interactive: boolean;
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
