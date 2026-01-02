import {createContext, type ReactNode, useCallback, useContext, useEffect} from 'react'
import {useLocation, useNavigate} from 'react-router-dom';
import {useConfig} from "../hooks/config.ts";
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
    // Stores the grouping: { "localhost/projectA": Set(["file1.ts", "file2.ts"]) }
    contextTabs: Record<string, Set<string>>;

    lastOpened: string;

    update: (filename: string, details: Partial<TabDetails>) => void;
    create: (filename: string, tabIndex?: number) => void;
    close: (filename: string) => string;
    rename: (oldFilename: string, newFilename: string) => string;
    active: (filename: string) => void;
    load: (filename: string) => TabDetails | undefined;
}

export const getContextKey = () => {
    const {host} = useHostStore.getState();
    const {alias} = useAliasStore.getState();
    return `${host}/${alias}`;
};


export const useTabsStore = create<EditorState>()(
    immer((set, get) => ({
        allTabs: {},
        contextTabs: {},
        lastOpened: '',

        load: (filename: string) => {
            return get().allTabs[filename];
        },

        create: (filename, tabIndex = 0) => {
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
                    state.contextTabs[key] = new Set();
                }

                state.contextTabs[key].add(filename);
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

        close: (filename) => {
            let newFile = ''
            const key = getContextKey();
            set((state) => {
                delete state.allTabs[filename];
                if (state.contextTabs[key]) {
                    state.contextTabs[key].delete(filename);
                }

                // If we closed the active tab, find a replacement in the same context
                if (state.lastOpened === filename) {
                    const currentContextArray = Array.from(state.contextTabs[key] || []);
                    newFile = currentContextArray.length > 0
                        ? currentContextArray[currentContextArray.length - 1]
                        : '';
                }
            });

            return newFile;
        },

        rename: (oldFilename, newFilename) => {
            let next = ''

            set((state) => {
                if (state.allTabs[oldFilename]) {
                    state.allTabs[newFilename] = state.allTabs[oldFilename];
                    delete state.allTabs[oldFilename];
                }
                Object.keys(state.contextTabs).forEach((key) => {
                    if (state.contextTabs[key].has(oldFilename)) {
                        state.contextTabs[key].delete(oldFilename);
                        state.contextTabs[key].add(newFilename);
                    }
                });
                if (state.lastOpened === oldFilename) {
                    next = newFilename;
                }
            });

            return next;
        },

        active: (filename) => {
            set((state) => {
                state.lastOpened = filename;
            });
        },
    }))
);

export interface TabsContextType {
    // tabs: Record<string, TabDetails>;
    // activeTab: string;
    setTabDetails: (filename: string, details: Partial<TabDetails>) => void;
    openTab: (filename: string) => void;
    closeTab: (filename: string) => void;
    renameTab: (oldFilename: string, newFilename: string) => void;
    onTabClick: (filename: string) => void;
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
    const {dockYaml} = useConfig()
    const tabLimit = dockYaml?.tabLimit ?? 5

    const location = useLocation();
    const navigate = useNavigate();
    const editorUrl = useEditorUrl()
    const {filename} = useFileComponents()

    const {allTabs, active, load, rename, update, create, close} = useTabsStore()

    const handleTabClick = useCallback((filename: string) => {
        const tabDetail = load(filename)
        const url = editorUrl(filename, tabDetail);
        navigate(url);
    }, [editorUrl, navigate]);

    const handleOpenTab = useCallback((filename: string) => {
        const params = new URLSearchParams(location.search);
        // todo enforce tab limit
        create(filename, Number(params.get("tab") ?? "0"))
        active(filename)
    }, [location.search, tabLimit]);

    const handleCloseTab = useCallback((filename: string) => {
        const next = close(filename)
        navigate(editorUrl(next, allTabs[next]))
    }, [allTabs, close, editorUrl, navigate])

    const handleTabRename = useCallback((oldFilename: string, newFilename: string) => {
        const next = rename(oldFilename, newFilename)
        navigate(editorUrl(next, allTabs[next]))
    }, [allTabs, navigate, editorUrl]);

    useEffect(() => {
        if (!location.pathname.startsWith(editorUrl()) ||
            !filename) return;

        handleOpenTab(filename);
    }, [filename, handleOpenTab, editorUrl, location.pathname])

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
