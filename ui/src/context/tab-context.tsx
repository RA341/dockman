import {createContext, type ReactNode, useCallback, useContext, useEffect} from 'react'
import {useLocation, useNavigate} from 'react-router-dom';
import {useEditorUrl} from "../lib/editor.ts";
import {create} from "zustand";
import {immer} from "zustand/middleware/immer";
import {useAliasStore, useHostStore} from "../pages/compose/state/files.ts";
import {useFileComponents} from "../pages/compose/state/terminal.tsx";

export interface TabDetails {
    subTabIndex: number;
    row: number;
    col: number;
}

interface EditorState {
    // Stores the actual data: { "file1.ts": { row: 1, col: 5... } }
    allTabs: Record<string, TabDetails>;
    // Stores the grouping: { "localhost/projectA": { 0: Set(["file1.ts"]), 1: Set(["file2.ts"]) } }
    contextTabs: Record<string, Record<number, Set<string>>>;

    lastOpened: Record<number, string>;

    update: (filename: string, details: Partial<TabDetails>) => void;
    create: (filename: string, track?: number, tabIndex?: number) => void;
    close: (filename: string, track?: number) => { next: string, wasActive: boolean };
    rename: (oldFilename: string, newFilename: string) => string;
    active: (filename: string, track?: number) => void;
    load: (filename: string) => TabDetails | undefined;
}

export const getContextKey = () => {
    const splits = window.location.pathname.split("/");
    const host = splits[1]
    const alias = splits[3]
    return `${host}/${alias}`;
};

export const useTabsStore = create<EditorState>()(
    immer((set, get) => ({
        allTabs: {},
        contextTabs: {},
        lastOpened: {0: '', 1: ''},

        load: (filename: string) => {
            return get().allTabs[filename];
        },

        create: (filename, track = 0, tabIndex = 0) => {
            const key = getContextKey();
            set((state) => {
                if (!state.allTabs[filename]) {
                    state.allTabs[filename] = {
                        subTabIndex: tabIndex,
                        row: 1,
                        col: 1,
                    };
                } else {
                    // set the tab state
                    state.allTabs[filename] = {
                        ...state.allTabs[filename],
                        subTabIndex: tabIndex,
                    };
                }

                if (!state.contextTabs[key]) {
                    state.contextTabs[key] = {0: new Set(), 1: new Set()};
                }

                state.contextTabs[key][track].add(filename);
            });
        },

        update: (filename, details) => {
            set((state) => {
                if (state.allTabs[filename]) {
                    state.allTabs[filename] = {
                        ...state.allTabs[filename],
                        ...details
                    };
                }
            });
        },

        close: (filename, track = 0) => {
            let nextActive = ''
            let wasActive = false;
            const key = getContextKey();
            set((state) => {
                wasActive = state.lastOpened[track] === filename;
                if (state.contextTabs[key] && state.contextTabs[key][track]) {
                    state.contextTabs[key][track].delete(filename);
                }

                // If we closed the active tab, find a replacement in the same context and track
                if (wasActive) {
                    const currentContextArray = Array.from(state.contextTabs[key][track] || []);
                    nextActive = currentContextArray.length > 0
                        ? currentContextArray[currentContextArray.length - 1]
                        : '';
                    state.lastOpened[track] = nextActive;
                }

                // Cleanup allTabs if no longer used anywhere
                let stillInUse = false;
                for (const k of Object.keys(state.contextTabs)) {
                    if (state.contextTabs[k][0]?.has(filename) || state.contextTabs[k][1]?.has(filename)) {
                        stillInUse = true;
                        break;
                    }
                }
                if (!stillInUse) {
                    delete state.allTabs[filename];
                }
            });

            return {next: nextActive, wasActive};
        },

        rename: (oldFilename, newFilename) => {
            let next = ''

            set((state) => {
                if (state.allTabs[oldFilename]) {
                    state.allTabs[newFilename] = state.allTabs[oldFilename];
                    delete state.allTabs[oldFilename];
                }
                Object.keys(state.contextTabs).forEach((key) => {
                    [0, 1].forEach(track => {
                        if (state.contextTabs[key][track].has(oldFilename)) {
                            state.contextTabs[key][track].delete(oldFilename);
                            state.contextTabs[key][track].add(newFilename);
                        }
                    });
                });
                [0, 1].forEach(track => {
                    if (state.lastOpened[track] === oldFilename) {
                        state.lastOpened[track] = newFilename;
                    }
                });
                next = newFilename;
            });

            return next;
        },

        active: (filename, track = 0) => {
            set((state) => {
                state.lastOpened[track] = filename;
            });
        },
    }))
);

export interface TabsContextType {
    // tabs: Record<string, TabDetails>;
    // activeTab: string;
    setTabDetails: (filename: string, details: Partial<TabDetails>) => void;
    openTab: (filename: string, track?: number) => void;
    closeTab: (filename: string, track?: number) => void;
    renameTab: (oldFilename: string, newFilename: string) => void;
    onTabClick: (filename: string, track?: number) => void;
}

export const TabsContext = createContext<TabsContextType | undefined>(undefined);

export const useTabs = (): TabsContextType => {
    const context = useContext(TabsContext);
    if (!context) {
        throw new Error('useTabs must be used within a TabsProvider');
    }
    return context;
};

export function TabsProvider({children}: { children: ReactNode }) {
    // const {dockYaml} = useConfig()
    // const tabLimit = dockYaml?.tabLimit ?? 5

    const location = useLocation();
    const navigate = useNavigate();
    const editorUrl = useEditorUrl()
    const {filename, splitFilename} = useFileComponents()

    const {active, load, rename, update, create, close} = useTabsStore()

    const handleTabClick = useCallback((filename: string, track: number = 0) => {
        const tabDetail = load(filename)
        const url = editorUrl(filename, tabDetail, track);
        navigate(url);
    }, [editorUrl, navigate, load]);

    const handleOpenTab = useCallback((filename: string, track: number = 0) => {
        const params = new URLSearchParams(location.search);
        create(filename, track, Number(params.get("tab") ?? "0"))
        active(filename, track)
    }, [location.search, create, active]);

    const handleCloseTab = useCallback((filename: string, track: number = 0) => {
        const {next, wasActive} = close(filename, track)
        if (wasActive) {
            const latestAllTabs = useTabsStore.getState().allTabs;
            if (next) {
                navigate(editorUrl(next, latestAllTabs[next], track))
            } else if (track === 1) {
                navigate(editorUrl(undefined, undefined, 1))
            } else {
                const h = useHostStore.getState().host;
                const a = useAliasStore.getState().alias;
                navigate(`/${h}/files/${a}`);
            }
        }
    }, [close, editorUrl, navigate])

    const handleTabRename = useCallback((oldFilename: string, newFilename: string) => {
        rename(oldFilename, newFilename)

        const query = new URLSearchParams(location.search);
        let path = location.pathname;

        if (filename === oldFilename) {
            path = path.replace(oldFilename, newFilename);
        }

        if (query.get("split") === oldFilename) {
            query.set("split", newFilename);
        }

        const queryString = query.toString();
        navigate(queryString ? `${path}?${queryString}` : path);
    }, [navigate, filename, rename, location.pathname, location.search]);

    useEffect(() => {
        if (!location.pathname.includes("/files/") || !filename) return;
        handleOpenTab(filename, 0);
    }, [filename, handleOpenTab, location.pathname])

    useEffect(() => {
        if (splitFilename) {
            handleOpenTab(splitFilename, 1);
        }
    }, [splitFilename, handleOpenTab]);

    const value = {
        openTab: handleOpenTab,
        closeTab: handleCloseTab,
        renameTab: handleTabRename,
        onTabClick: handleTabClick,
        setTabDetails: update,
    }

    return (
        <TabsContext.Provider value={value}>
            {children}
        </TabsContext.Provider>
    )
}
