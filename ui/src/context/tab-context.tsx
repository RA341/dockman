import {createContext, type ReactNode, useCallback, useContext, useEffect, useState} from 'react'
import {useLocation, useNavigate} from 'react-router-dom';
import {useConfig} from "../hooks/config.ts";
import {useEditorUrl} from "../lib/editor.ts";
import {useFileComponents} from "../pages/compose/state/state.tsx";

export interface TabDetails {
    subTabIndex: number;
    row: number;
    col: number;
}

export interface TabsContextType {
    tabs: Record<string, TabDetails>;
    activeTab: string;
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
    const {host, filename} = useFileComponents()

    const [curTab, setCurTab] = useState("")

    const [openTabs, setOpenTabs] = useState<Record<string, TabDetails>>(() => {
        const saved = localStorage.getItem(`tabs_${host}`);
        return saved ? JSON.parse(saved) : {};
    });

    useEffect(() => {
        if (host) {
            localStorage.setItem(`tabs_${host}`, JSON.stringify(openTabs));
        }
    }, [openTabs, host]);

    useEffect(() => {
        const saved = localStorage.getItem(`tabs_${host}`);
        const loadedTabs = saved ? JSON.parse(saved) : {};
        setOpenTabs(loadedTabs);

        if (location.pathname.startsWith(editorUrl()) && filename) {
            setCurTab(filename);
        } else {
            setCurTab("");
        }
    }, [host])

    const handleTabClick = useCallback((filename: string) => {
        const tabDetail = openTabs[filename];
        const url = editorUrl(filename, tabDetail);
        navigate(url);
    }, [openTabs, editorUrl, navigate]);

    const handleOpenTab = useCallback((filename: string) => {
        const params = new URLSearchParams(location.search);

        setOpenTabs(prevTabs => {
            if (prevTabs[filename]) {
                const tab = Number(params.get("tab") ?? "0")
                return {
                    ...prevTabs,
                    [filename]: {...prevTabs[filename], subTabIndex: tab},
                }
            }

            const newTabs = {...prevTabs};
            const keys = Object.keys(newTabs);
            if (keys.length >= tabLimit) {
                const firstKey = keys[0];
                delete newTabs[firstKey];
            }

            newTabs[filename] = {subTabIndex: 0, col: 1, row: 1};
            return newTabs;
        });
    }, [location.search, tabLimit]);

    const setTabDetails = useCallback((filename: string, details: Partial<TabDetails>) => {
        setOpenTabs(prevTabs => {
            if (!prevTabs[filename]) return prevTabs;
            return {
                ...prevTabs,
                [filename]: {...prevTabs[filename], ...details},
            };
        });
    }, []);

    const handleCloseTab = useCallback((filename: string) => {
        setOpenTabs(prevTabs => {
            const newTabs = {...prevTabs};
            const tabKeys = Object.keys(prevTabs);
            const currentIndex = tabKeys.indexOf(filename);

            delete newTabs[filename];

            if (Object.keys(newTabs).length < 1) {
                setCurTab("")
                navigate(editorUrl())
            } else if (filename === curTab) {
                const nextIndex = currentIndex < tabKeys.length - 1 ? currentIndex : currentIndex - 1;
                const next = tabKeys[nextIndex] !== filename ? tabKeys[nextIndex] : Object.keys(newTabs)[0];
                navigate(editorUrl(next, newTabs[next]));
            }
            return newTabs;
        });
    }, [curTab, editorUrl, navigate]);

    const handleTabRename = useCallback((oldFilename: string, newFilename: string) => {
        setOpenTabs(prevTabs => {
            const tab = prevTabs[oldFilename];
            if (!tab) return prevTabs;

            const newTabs = {...prevTabs, [newFilename]: tab};
            delete newTabs[oldFilename];
            navigate(editorUrl(newFilename, tab));
            return newTabs;
        });
    }, [navigate, editorUrl]);

    useEffect(() => {
        if (!location.pathname.startsWith(editorUrl())) return;

        if (!filename) {
            setCurTab("");
            return;
        }

        handleOpenTab(filename);
        setCurTab(filename);
    }, [filename, handleOpenTab, editorUrl, location.pathname])

    const value = {
        tabs: openTabs,
        activeTab: curTab,
        openTab: handleOpenTab,
        closeTab: handleCloseTab,
        renameTab: handleTabRename,
        onTabClick: handleTabClick,
        setTabDetails: setTabDetails,
    }

    return (
        <TabsContext.Provider value={value}>
            {children}
        </TabsContext.Provider>
    )
}
