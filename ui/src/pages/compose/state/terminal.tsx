import {create} from 'zustand'
import type {Terminal} from "@xterm/xterm";
import {useLocation, useParams} from "react-router-dom";

export const useFileComponents = (): { host: string; alias: string; filename: string; splitFilename: string | null } => {
    const params = useParams()
    const {search} = useLocation()
    const query = new URLSearchParams(search)
    const splitFilename = query.get("split")

    const param = params["*"];
    const host = params.host;
    if (!host) {
        return {host: "", alias: "", filename: "", splitFilename}
    }

    if (host && !param) {
        return {host: host, alias: "", filename: "", splitFilename}
    }

    const [alias, relpath] = param!.split("/", 2)
    // if the path has more than the host and alias
    // "local/compose/foo/bar":	"local", "compose", "foo/bar"
    return {
        host: host ?? "",
        alias: alias ?? "",
        filename: relpath ? param! : "",
        splitFilename
    }
}

const writeTermErr = (term: Terminal, err: string) => {
    console.error("Error", err);
    term.write('\r\n\x1b[31m*** Error ***\n');
    term.write(`${err}\x1b[0m\r`);
}

export function makeID(length: number = 15): string {
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

    // host shells are PTY-backed: keystrokes go out as text frames, while
    // size updates travel as binary JSON so they can't collide with input
    const isHostShell = wsUrl.includes('/docker/shell')
    const sendDims = (term: Terminal) => {
        if (ws?.readyState === WebSocket.OPEN) {
            ws.send(new TextEncoder().encode(JSON.stringify({cols: term.cols, rows: term.rows})))
        }
    }

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
                    if (isHostShell) {
                        sendDims(term)
                    }
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

                if (isHostShell) {
                    term.onResize(() => sendDims(term));
                }
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

// tabs are stored under an explicit unique key (host/alias/file/container)
// while title stays the short display name — short names may collide across
// stacks, keys must not
export const useContainerExec = create<{
    execParams: (
        key: string,
        title: string,
        wsUrl: string,
        interactive: boolean,
    ) => void
}>(() => ({
    execParams: (key, title, wsUrl, interactive) => {
        useTerminalAction.getState().open()

        const tabsStore = useTerminalTabs.getState()
        if (tabsStore.tabs.has(key)) {
            // never replace a live shell session, just focus it
            tabsStore.setActiveTab(key)
            return
        }

        tabsStore.addTab(key, createTab(wsUrl, title, interactive))
    },
}))

// opens (or re-activates) a structured log viewer tab in the bottom panel
export const useLogsPanel = create<{
    openLogs: (key: string, title: string, containers: { id: string; name?: string }[]) => void
}>(() => ({
    openLogs: (key, title, containers) => {
        useTerminalAction.getState().open()

        const tabsStore = useTerminalTabs.getState()
        if (tabsStore.tabs.has(key)) {
            // keep the buffer, but refresh the container set: ids go stale
            // when a stack is redeployed (recreated containers get new ids)
            tabsStore.updateTab(key, tab => ({...tab, title, logsContainers: containers}))
            tabsStore.setActiveTab(key)
            return
        }

        tabsStore.addTab(key, {
            id: makeID(),
            title,
            interactive: false,
            onTerminal: () => {
            },
            onClose: () => {
            },
            logsContainers: containers,
        })
    },
}))


export interface TabTerminal {
    id: string;
    title: string;
    onTerminal: (term: Terminal) => void;
    onClose: () => void;
    interactive: boolean;
    // when set, the tab hosts the structured log viewer instead of a terminal
    logsContainers?: { id: string; name?: string }[];
}

const FLOAT_MODE_KEY = 'dockman-panel-float';

export const useTerminalAction = create<{
    isTerminalOpen: boolean;
    // floating panel: only a slim header stays docked at the bottom, the
    // body overlays the content while hovered
    floatMode: boolean;
    // bumped on every open(): all tab openers (logs, exec, last action,
    // docker run) go through open(), so the floating body can pop up when
    // content is requested even though the pointer never touched the panel
    revealNonce: number;
    toggleFloat: () => void;
    toggle: () => void;
    open: () => void
    close: () => void
}>(set => ({
    isTerminalOpen: false,
    revealNonce: 0,
    floatMode: localStorage.getItem(FLOAT_MODE_KEY) === '1',
    toggleFloat: () => set(state => {
        const next = !state.floatMode;
        localStorage.setItem(FLOAT_MODE_KEY, next ? '1' : '0');
        return {floatMode: next};
    }),
    toggle: () => set(state => ({
        isTerminalOpen: !state.isTerminalOpen
    })),
    open: () => set(state => ({
        isTerminalOpen: true,
        revealNonce: state.revealNonce + 1,
    })),
    close: () => set(() => ({
        isTerminalOpen: false
    })),
}));

export const useTerminalTabs = create<{
    tabs: Map<string, TabTerminal>;
    activeTab: string | null;
    clearAll: () => void;
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
        clearAll: () => {
            set({
                activeTab: null,
                tabs: new Map<string, TabTerminal>,
            })
            // an empty panel has nothing to show: collapse it
            useTerminalAction.getState().close()
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

            // closing the last tab collapses the panel instead of leaving
            // an empty shell open
            if (get().tabs.size === 0) {
                useTerminalAction.getState().close()
            }
        },
    })
)
