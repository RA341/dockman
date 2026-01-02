import {type JSX, useEffect, useMemo} from 'react';
import {Navigate, Outlet, useNavigate} from 'react-router-dom';
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
import {useAliasStore, useHostStore} from "./state/files.ts";
import AliasProvider, {useAlias} from "../../context/alias-context.tsx";
import {useEditorUrl} from "../../lib/editor.ts";
import AliasDialog from "./components/add-alias-dialog.tsx";

export function FilesLayout() {
    return (
        <AliasProvider>
            <TabsProvider>
                <Outlet/>
            </TabsProvider>
        </AliasProvider>
    );
}

export function FileIndexRedirect() {
    const lastOpened = useTabsStore(state => state.lastOpened);
    const tabs = useTabsStore(state => state.allTabs);

    const editorUrl = useEditorUrl()
    const {aliases} = useAlias()

    const path = lastOpened
        ? editorUrl(lastOpened, tabs[lastOpened])
        : aliases.at(0)?.alias ?? '';

    if (!path) {
        return <InvalidAlias/>
    }

    return <Navigate to={path} replace/>;
}

export const ComposePage = () => {
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
    const {filename, alias} = useFileComponents()
    const setAlias = useAliasStore(state => state.setAlias)
    useEffect(() => {
        setAlias(alias)
    }, [alias]);

    const clearTabs = useTerminalTabs(state => state.clearAll)
    const host = useHostStore(state => state.host)
    useEffect(() => {
        clearTabs()
    }, [clearTabs, host]);

    console.log("compose nav to ", filename)

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

                    <Box sx={{
                        flexGrow: 1,
                        display: 'flex',
                        flexDirection: 'column',
                        overflow: 'hidden'
                    }}>
                        <FileTabBar/>
                        <Box sx={{
                            flexGrow: 1,
                            overflow: 'auto',
                            display: 'flex',
                            flexDirection: 'column'
                        }}>
                            {!filename ?
                                <CoreComposeEmpty/> :
                                <CoreCompose/>
                            }
                        </Box>
                    </Box>
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

const FileTabBar = () => {
    const {filename} = useFileComponents()

    const navigate = useNavigate();
    const {closeTab, onTabClick} = useTabs();

    const {host} = useHostStore.getState();
    const {alias} = useAliasStore.getState();
    const contextKey = `${host}/${alias}`;

    const tabs = useTabsStore(state => state.contextTabs)[contextKey] ?? {}
    const activeTab = useTabsStore(state => state.lastOpened)

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const tabNames = Object.keys(tabs);

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
                onTabClick(name);
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [navigate, tabs, activeTab, onTabClick])

    const tablist = useMemo(() => {
        return Array.from(tabs);
    }, [tabs])

    return (
        <Box sx={{borderBottom: 1, borderColor: 'divider', flexShrink: 0}}>
            <Tabs
                value={filename}
                onChange={(_event, value) => onTabClick(value as string)}
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
                                        closeTab(tabFilename)
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

const CoreCompose = () => {
    const {host, alias, filename} = useFileComponents()

    if (filename === formatDockyaml(alias, host)) {
        return <ViewerDockyaml/>
    }

    const ext = getExt(filename!)
    const specialFileSupport: Map<string, JSX.Element> = new Map([
        ["db", <ViewerSqlite/>],
    ])

    const viewer = specialFileSupport.get(ext)
    if (viewer) {
        return viewer
    }

    return <ViewerText/>;
};
