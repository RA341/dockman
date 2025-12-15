import {ArrowDownward, ArrowUpward, PlayArrow, RestartAlt, Stop, Update} from "@mui/icons-material";
import {create} from 'zustand'
import {type ComposeFile, type LogsMessage} from "../../../gen/docker/v1/docker_pb.ts";
import type {CallOptions} from "@connectrpc/connect";
import type {Terminal} from "@xterm/xterm";
import {useParams} from "react-router-dom";

export const useFileComponents = (): { host: string; alias: string; filename: string; } => {
    const params = useParams()
    const param = params["*"];
    const host = params.host;
    if (!param || !host) {
        return {host: "", alias: "", filename: ""}
    }

    const [alias, relpath] = param.split("/", 2)
    // if the path has more than the host and alias
    // "local/compose/foo/bar":	"local", "compose", "foo/bar"
    return {
        host: host ?? "",
        alias: alias ?? "",
        filename: relpath ? param : ""
    }
}

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

type ActiveAction = typeof deployActionsConfig[number]['name'];
type ComposeFileClean = Omit<ComposeFile, "$typeName" | "$unknown">;
type ComposeActionStreamFn = (request: ComposeFileClean, options?: CallOptions) => AsyncIterable<LogsMessage>;

const writeTermErr = (term: Terminal, err: string) => {
    console.error("Error", err);
    term.write('\r\n\x1b[31m*** Error ***\n');
    term.write(`${err}\x1b[0m\r`);
}

function makeID(length: number = 15): string {
    let result = '';
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const charactersLength = characters.length;
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }
    return result;
}

export function createTab(wsUrl: string, title: string, interactive: boolean) {
    let ws: WebSocket | undefined;

    const tab: TabTerminal = {
        id: makeID(),
        title: title,
        interactive: interactive,
        onTerminal: term => {
            try {
                ws = new WebSocket(wsUrl);
                ws.binaryType = "arraybuffer";

                ws.onopen = () => {
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
                    console.log(`Closing connection`)
                    // onClose?.()
                };

                ws.onerror = (err) => {
                    writeTermErr(term, err.toString());
                };

                term.onData((data) => {
                    if (ws?.readyState === WebSocket.OPEN) {
                        ws?.send(data);
                    }
                });
            } catch (e: unknown) {
                // @ts-expect-error: dumbass language
                writeTermErr(term, e.toString());
            }
        },
        onClose: () => {
            ws?.close();
        },
    }
    return tab;
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

        const tab = createTab(wsUrl, title, interactive);

        useTerminalTabs.getState().addTab(title, tab)
    },
}))

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

export interface TabTerminal {
    id: string;
    title: string;
    onTerminal: (term: Terminal) => void;
    onClose: () => void;
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

export const useOpenFiles = create<{
    openFiles: Set<string>;
    toggle: (dir: string) => void
    delete: (dir: string) => void
    recursiveOpen: (dir: string) => void
    isOpen: (dir: string) => boolean;

}>((set, get) => ({
    openFiles: new Set<string>(),
    isOpen: dir => get().openFiles.has(dir),
    delete: (dir: string) => get().openFiles.delete(dir),
    recursiveOpen: dir => {
        set(state => {
            let acc = ""
            const newOpenFiles = new Set(state.openFiles);

            for (const ele of dir.split("/")) {
                const hasExt = ele.split(".").length
                if (hasExt < 2) {
                    // only add dirs not files
                    acc += ele
                    newOpenFiles.add(acc)
                    acc += "/"
                }
            }
            return {
                openFiles: newOpenFiles
            }
        })
    },
    toggle: (dir) => {
        set(state => {
            const newOpenFiles = new Set(state.openFiles);
            if (newOpenFiles.has(dir)) {
                newOpenFiles.delete(dir);
            } else {
                newOpenFiles.add(dir);
            }

            return {
                openFiles: newOpenFiles,
            }
        })
    },
}));
