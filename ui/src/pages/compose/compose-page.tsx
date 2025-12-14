import {type JSX, useEffect, useMemo} from 'react';
import {useNavigate, useParams} from 'react-router-dom';
import {Box, IconButton, Tab, Tabs} from '@mui/material';
import {FileList} from "./components/file-bar.tsx";
import {Close} from '@mui/icons-material';
import {FilesProvider} from "../../context/file-context.tsx";
import {AddFilesProvider} from "./dialogs/add/add-context.tsx";
import {TelescopeProvider} from "./dialogs/search/search-context.tsx";
import {DeleteFileProvider} from "./dialogs/delete/delete-context.tsx";
import {useTabs} from "../../hooks/tabs.ts";
import ActionBar from "./components/action-bar.tsx";
import CoreComposeEmpty from "./compose-empty.tsx";
import {LogsPanel} from "./components/logs-panel.tsx";
import {useActiveComposeFile} from "./state/state.tsx";
import {RenameFilesProvider} from "./dialogs/rename/rename-context.tsx";
import {getExt} from "./components/file-bar-icon.tsx";
import ViewerSqlite from "./components/viewer-sqlite.tsx";
import TextEditor from "./components/viewer-text.tsx";

export const ComposePage = () => {
    return (
        <FilesProvider>
            <TelescopeProvider>
                <AddFilesProvider>
                    <RenameFilesProvider>
                        <DeleteFileProvider>
                            <ComposePageInner/>
                        </DeleteFileProvider>
                    </RenameFilesProvider>
                </AddFilesProvider>
            </TelescopeProvider>
        </FilesProvider>
    )
}

export const ComposePageInner = () => {
    const params = useParams();
    const filename = params['*'] ?? "";
    const setFile = useActiveComposeFile((state) => state.setFile)
    setFile(filename)

    return (
        <Box sx={{
            display: 'flex',
            height: '100vh',
            width: '100%',
            overflow: 'hidden'
        }}>
            <ActionBar/>

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

const FileTabBar = () => {
    const filename = useActiveComposeFile(state => state.activeComposeFile)!

    const navigate = useNavigate();
    const {tabs, closeTab, onTabClick, activeTab} = useTabs();

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
        return Object.keys(tabs)
    }, [tabs])

    return (
        tablist.length > 0 && (
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
                                    <span>{tabFilename}</span>
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
        )
    );
};

const CoreCompose = () => {
    const filename = useActiveComposeFile(state => state.activeComposeFile)!

    const ext = getExt(filename)

    const specialFileSupport: Map<string, JSX.Element> = new Map([
        ["db", <ViewerSqlite/>],
        ["sqlite", <ViewerSqlite/>],
    ])

    const viewer = specialFileSupport.get(ext)
    if (viewer) {
        return viewer
    }

    return <TextEditor/>;
};
