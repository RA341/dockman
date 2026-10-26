import {type JSX, useEffect, useMemo, useRef, useState} from 'react';
import {Navigate, Outlet, useLocation, useNavigate} from 'react-router-dom';
import {Box, CircularProgress, IconButton, Tab, Tabs, Tooltip, Typography} from '@mui/material';
import {FileList} from "./components/file-list.tsx";
import {Close} from '@mui/icons-material';
import ActionSidebar from "./components/action-sidebar.tsx";
import CoreComposeEmpty, {InvalidAlias} from "./compose-empty.tsx";
import {LogsPanel} from "./components/logs-panel.tsx";
import {getExt} from "./components/file-icon.tsx";
import ViewerSqlite from "./components/viewer-sqlite.tsx";
import ViewerText from "./components/viewer-text.tsx";
import ViewerDockyaml, {formatDockyaml} from "./components/viewer-dockyml.tsx";
import {useFileComponents, useTerminalTabs} from "./state/terminal.tsx";
import {TabsProvider, useTabs, useTabsStore} from "../../context/tab-context.tsx";
import FilesProvider from "../../context/file-context.tsx";
import FileSearch from "./dialogs/file-search.tsx";
import FileCreate from "./dialogs/file-create.tsx";
import FileDelete from "./dialogs/file-delete.tsx";
import FileRename from "./dialogs/file-rename.tsx";
import {useAliasStore, useHostStore, useLastOpened} from "./state/files.ts";
import AliasProvider, {useAlias} from "../../context/alias-context.tsx";
import AliasDialog from "./components/add-alias-dialog.tsx";
import useResizeBar from "./hooks/resize-hook.ts";

export function FilesLayout() {
    return (
        <AliasProvider>
            <TabsProvider>
                <Outlet/>
            </TabsProvider>
        </AliasProvider>
    );
}

function FileIndexRedirect() {
    const lastUrl = useLastOpened(state => state.lastEditorUrl)
    const {aliases} = useAlias()

    const path = lastUrl
        ? lastUrl
        : aliases.at(0)?.alias ?? '';

    console.log("last path", path, aliases.at(0)?.alias)

    if (!path) {
        return <InvalidAlias/>
    }

    console.log(`Nav to ${path}`)

    return <Navigate to={path} replace/>;
}

export default FileIndexRedirect

export const ComposePage = () => {
    const location = useLocation()
    const setLast = useLastOpened(state => state.setUrl)

    useEffect(() => {
        const fullPath = location.pathname + location.search + location.hash;
        setLast(fullPath)
    }, [location.pathname, location.search, location.hash]);

    const {aliases, isLoading} = useAlias();
    const {host, alias} = useFileComponents();

    const isEmpty = aliases.length === 0;
    if (isLoading && isEmpty) {
        return (
            <Box sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100vh',
            }}>
                <CircularProgress size={40} thickness={5}/>
                <Typography variant="body2" sx={{mt: 2, fontWeight: 700}} color="text.secondary">
                    Loading aliases...
                </Typography>
            </Box>
        );
    }

    const validAlias = aliases.find(value => value.alias === alias);
    if (isEmpty || !alias || !validAlias) {
        return <InvalidAlias/>
    }

    return (
        <FilesProvider>
            <Box sx={{
                display: 'flex',
                flexDirection: 'column',
                height: '100vh',
                overflow: 'hidden',
                bgcolor: 'background.default'
            }}>
                <Box sx={{flexGrow: 1, minHeight: 0, position: 'relative'}}>
                    <ComposePageInner/>
                </Box>
                <FileCreate/>
                <FileSearch/>
                <FileDelete/>
                <FileRename/>
            </Box>
            <AliasDialog host={host}/>
        </FilesProvider>
    )
}

export const ComposePageInner = () => {
    const {filename, alias, splitFilename} = useFileComponents()

    const setAlias = useAliasStore(state => state.setAlias)
    useEffect(() => {
        setAlias(alias)
    }, [alias]);

    const clearTabs = useTerminalTabs(state => state.clearAll)
    const host = useHostStore(state => state.host)
    useEffect(() => {
        clearTabs()
    }, [host]);

    const containerRef = useRef<HTMLDivElement>(null);
    const [containerWidth, setContainerWidth] = useState(1200);

    useEffect(() => {
        if (!containerRef.current) return;
        const observer = new ResizeObserver(([entry]) => {
            setContainerWidth(entry.contentRect.width);
        });
        observer.observe(containerRef.current);
        return () => observer.disconnect();
    }, []);

    const {panelRef, panelSize, handleMouseDown, cursor} =
        useResizeBar('right',
            800,
            150,
            containerWidth - 150);

    const needSplit = !!splitFilename

    return (
        <Box sx={{
            display: 'flex',
            height: '100vh',
            width: '100%',
            overflow: 'hidden'
        }}>
            <ActionSidebar/>

            <Box sx={{
                flexGrow: 1,
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden'
            }}>
                {/* Main content area */}
                <Box sx={{
                    display: 'flex',
                    flexGrow: 1,
                    overflow: 'hidden'
                }}>
                    <FileList/>

                    {/* Left editor - resizable */}
                    <Box
                        ref={panelRef}
                        sx={{
                            flexGrow: needSplit ? 0 : 1,
                            width: needSplit ? panelSize : 'auto',
                            flexShrink: needSplit ? 0 : 1,
                            display: 'flex',
                            flexDirection: 'column',
                            overflow: 'hidden'
                        }}
                    >
                        <FileTabBar track={0}/>
                        <Box sx={{
                            flexGrow: 1,
                            overflow: 'auto',
                            display: 'flex',
                            flexDirection: 'column'
                        }}>
                            {!filename ?
                                <CoreComposeEmpty/> :
                                <CoreCompose filename={filename} track={0}/>
                            }
                        </Box>
                    </Box>

                    {needSplit && (
                        <>
                            {/* Resize handle */}
                            <Box
                                onMouseDown={handleMouseDown}
                                sx={{
                                    width: '4px',
                                    flexShrink: 0,
                                    cursor: cursor,
                                    backgroundColor: 'divider',
                                    '&:hover': {
                                        backgroundColor: 'primary.main',
                                    },
                                    transition: 'background-color 0.2s',
                                }}
                            />

                            {/* Right editor - takes remaining space */}
                            <Box sx={{
                                flexGrow: 1,
                                display: 'flex',
                                flexDirection: 'column',
                                overflow: 'hidden'
                            }}>
                                <FileTabBar track={1}/>
                                <Box sx={{
                                    flexGrow: 1,
                                    overflow: 'auto',
                                    display: 'flex',
                                    flexDirection: 'column'
                                }}>
                                    {!splitFilename ?
                                        <CoreComposeEmpty/> :
                                        <CoreCompose filename={splitFilename} track={1}/>
                                    }
                                </Box>
                            </Box>
                        </>
                    )}
                </Box>
                <LogsPanel/>
            </Box>
        </Box>
    );
};

function getTabName(filename: string): string {
    const s = filename.split("/").pop() ?? filename;
    return s.slice(0, 19) // max name limit of 19 chars
}

const FileTabBar = ({track}: { track: number }) => {
    const {filename, splitFilename, host, alias} = useFileComponents()
    const currentFilename = track === 0 ? filename : (splitFilename ?? '')

    const navigate = useNavigate();
    const {closeTab, onTabClick} = useTabs();

    const contextKey = `${host}/${alias}`

    const contextTabs = useTabsStore(state => state.contextTabs)[contextKey] ?? {0: new Set(), 1: new Set()}
    const tabs = contextTabs[track] ?? new Set()
    const activeTab = useTabsStore(state => state.lastOpened[track])

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const tabNames = Array.from(tabs);

            if (e.altKey && !e.ctrlKey && !e.shiftKey && !e.repeat && (e.key == "ArrowLeft" || e.key == "ArrowRight")) {
                let currentIndex = tabNames.indexOf(activeTab);

                switch (e.key) {
                    case "ArrowLeft": {
                        e.preventDefault();
                        if (currentIndex > 0) {
                            currentIndex--;
                        }
                        break;
                    }
                    case "ArrowRight": {
                        e.preventDefault();
                        if (currentIndex < tabNames.length - 1) {
                            currentIndex++
                        }
                        break;
                    }
                }

                const name = tabNames[currentIndex]
                onTabClick(name, track);
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [navigate, tabs, activeTab, onTabClick, track])

    const tablist = useMemo(() => {
        return Array.from(tabs);
    }, [tabs])

    return (
        <Box sx={{borderBottom: 1, borderColor: 'divider', flexShrink: 0}}>
            <Tabs
                value={currentFilename}
                onChange={(_event, value) => onTabClick(value as string, track)}
                variant="scrollable"
                scrollButtons="auto"
            >
                {tablist.map((tabFilename) => (
                    <Tab
                        key={tabFilename}
                        value={tabFilename}
                        sx={{textTransform: 'none', p: 0.5}}
                        label={
                            <Box sx={{
                                display: 'flex',
                                alignItems: 'center',
                                px: 1
                            }}>
                                <Tooltip title={tabFilename}>
                                    <span>{getTabName(tabFilename)}</span>
                                </Tooltip>
                                <IconButton
                                    size="small"
                                    component="div"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        closeTab(tabFilename, track)
                                    }}
                                    sx={{ml: 1.5}}
                                >
                                    <Close sx={{fontSize: '1rem'}}/>
                                </IconButton>
                            </Box>
                        }
                    />
                ))}
            </Tabs>
        </Box>
    );
};

const specialFileSupport = (filename: string): Map<string, JSX.Element> => new Map([
    ["db", <ViewerSqlite filename={filename}/>],
])

const CoreCompose = ({filename, track}: { filename: string, track: number }) => {
    const {host, alias} = useFileComponents()

    if (filename === formatDockyaml(alias, host)) {
        return <ViewerDockyaml filename={filename}/>
    }

    const ext = getExt(filename)

    const viewer = specialFileSupport(filename).get(ext)
    if (viewer) {
        return viewer
    }

    return <ViewerText filename={filename} track={track}/>;
};
