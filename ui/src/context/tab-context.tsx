import {type ReactNode, useCallback, useEffect, useState} from 'react'
import {useLocation, useNavigate, useParams} from 'react-router-dom';
import {type TabDetails, TabsContext} from "../hooks/tabs.ts";
import {useHost} from "../hooks/host.ts";
import {useConfig} from "../hooks/config.ts";
import {getEditorUrl} from "../lib/editor.ts";

interface TabsProviderProps {
    children: ReactNode
}

export function TabsProvider({children}: TabsProviderProps) {
    const {selectedHost} = useHost()
    const {dockYaml} = useConfig()
    const tabLimit = dockYaml?.tabLimit ?? 5

    const navigate = useNavigate();
    const location = useLocation(); // current location
    const {file, child} = useParams<{ file: string; child?: string }>();
    const filename = child ? `${file}/${child}` : file;

    const [curTab, setCurTab] = useState("")
    const [openTabs, setOpenTabs] = useState<Record<string, TabDetails>>({})

    useEffect(() => {
        // reset tabs on changing host
        setOpenTabs({})
        setCurTab("")
    }, [selectedHost])

    // handler for when someone clicks on a tab
    const handleTabClick = useCallback((filename: string) => {
        // capture current row and col

        const tabDetail = openTabs[filename];
        const url = getEditorUrl(filename, tabDetail);
        navigate(url);
    }, [openTabs, navigate]);

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
            // Enforce tab limit
            const keys = Object.keys(newTabs);
            if (keys.length >= tabLimit) {
                const firstKey = keys[0];
                delete newTabs[firstKey];
            }

            // Add new tab with default subTabIndex
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
        localStorage.removeItem(filename)

        setOpenTabs(prevTabs => {
            const newTabs = {...prevTabs};
            const tabKeys = Object.keys(prevTabs);
            const currentIndex = tabKeys.indexOf(filename);

            delete newTabs[filename];

            if (Object.keys(newTabs).length < 1) {
                setCurTab("")
                navigate("/stacks")
            } else {
                if (filename == curTab) {
                    // Try right tab first, then left, then first
                    const nextIndex = currentIndex < tabKeys.length - 1 ? currentIndex : currentIndex - 1;
                    const next = tabKeys[nextIndex] !== filename ? tabKeys[nextIndex] : Object.keys(newTabs)[0];
                    navigate("/stacks/" + next);
                }
            }

            return newTabs;
        });
    }, [curTab, navigate]);

    const handleTabRename = useCallback((oldFilename: string, newFilename: string) => {
        setOpenTabs(prevTabs => {
            const tab = prevTabs[oldFilename];
            if (!tab) return prevTabs; // nothing to rename

            const newTabs = {...prevTabs, [newFilename]: tab};
            delete newTabs[oldFilename];

            navigate(`/stacks/${newFilename}?tab=${tab.subTabIndex}`);

            return newTabs;
        });
    }, [navigate]);


    // This effect syncs the URL with the open tabs.
    // When the `filename` in the URL changes, it adds it as a new tab if not already open.
    useEffect(() => {
        if (!location.pathname.startsWith("/stacks")) return;

        if (!filename) {
            // No file in URL → clear active tab
            setCurTab("");
            return;
        }

        // Open file in tabs if not already present
        handleOpenTab(filename);

        // Sync active tab with URL
        setCurTab(filename);
    }, [filename, handleOpenTab, location.pathname])

    // const activeTabName = filename ? !!openTabs[filename] : false;

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
