import {create} from 'zustand'
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


export interface TabTerminal {
    id: string;
    title: string;
    onTerminal: (term: Terminal) => void;
    onClose: () => void;
    interactive: boolean;
}

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
