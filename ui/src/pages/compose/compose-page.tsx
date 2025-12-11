import React, {type ReactNode, type SyntheticEvent, useEffect, useMemo, useState} from 'react';
import {useNavigate, useParams, useSearchParams} from 'react-router-dom';
import TabEditor from "./tab-editor.tsx";
import {TabDeploy} from "./tab-deploy.tsx";
import {Box, CircularProgress, Fade, IconButton, Tab, Tabs, Tooltip, Typography} from '@mui/material';
import {TabStat} from "./tab-stats.tsx";
import {callRPC, useClient} from "../../lib/api.ts";
import {FileService} from "../../gen/files/v1/files_pb.ts";
import {FileList} from "./components/file-bar.tsx";
import {Close, ErrorOutline} from '@mui/icons-material';
import {ShortcutFormatter} from "./components/shortcut-formatter.tsx";
import {FilesProvider} from "../../context/file-context.tsx";
import {AddFilesProvider} from "./dialogs/add/add-context.tsx";
import {TelescopeProvider} from "./dialogs/search/search-context.tsx";
import {DeleteFileProvider} from "./dialogs/delete/delete-context.tsx";
import {isComposeFile} from "../../lib/editor.ts";
import {useTabs} from "../../hooks/tabs.ts";
import {type SaveState, useSaveStatus} from "./hooks/status-hook.ts";
import ActionBar from "./components/action-bar.tsx";
import CoreComposeEmpty from "./compose-empty.tsx";
import {LogsPanel} from "./components/logs-panel.tsx";
import {useActiveComposeFile, useOpenFiles} from "./state/state.tsx";
import CenteredMessage from "../../components/centered-message.tsx";

export const ComposePage = () => {
    return (
        <FilesProvider>
            <TelescopeProvider>
                <AddFilesProvider>
                    <DeleteFileProvider>
                        <ComposePageInner/>
                    </DeleteFileProvider>
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

                {/* LogsPanel at the bottom */}
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

enum TabType {
    // noinspection JSUnusedGlobalSymbols
    EDITOR,
    DEPLOY,
    STATS,
}

function parseTabType(input: string | null): TabType {
    const tabValueInt = parseInt(input ?? '0', 10)
    const isValidTab = TabType[tabValueInt] !== undefined
    return isValidTab ? tabValueInt : TabType.EDITOR
}

interface TabDetails {
    label: string;
    component: React.ReactElement;
    shortcut: React.ReactElement;
}

const indicatorMap: Record<SaveState, { color: string, component: ReactNode }> = {
    typing: {
        color: "primary.main",
        component: <Typography variant="button" color="primary.main">Typing</Typography>
    },
    saving: {
        color: "info.main",
        component: <Typography variant="button" color="info.main">Saving</Typography>
    },
    success: {
        color: "success.main",
        component: <Typography variant="button" color="success.main">Saved</Typography>
    },
    error: {
        color: "error.main",
        component: <Typography variant="button" color="error.main">Save Failed</Typography>
    },
    idle: {
        color: "primary.secondary",
        component: <></>
    }
};

function CoreCompose() {
    const filename = useActiveComposeFile(state => state.activeComposeFile)!

    const fileService = useClient(FileService);

    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const selectedTab = parseTabType(searchParams.get('tab'))

    const [isLoading, setIsLoading] = useState(true);
    const [fileError, setFileError] = useState("");

    const recursiveOpen = useOpenFiles(state => state.recursiveOpen)

    useEffect(() => {
        setIsLoading(true);
        setFileError("");

        callRPC(() => fileService.exists({filename: filename}))
            .then(value => {
                if (value.err) {
                    console.error("API error checking file existence:", value.err);
                    setFileError(`An API error occurred: ${value.err}`);
                }
            })
            .finally(() => {
                setIsLoading(false);
                recursiveOpen(filename)
            });
    }, [filename, fileService]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const path = `/stacks/${filename}`
            if (e.altKey && !e.repeat) {
                switch (e.code) {
                    case "KeyZ":
                        e.preventDefault();
                        navigate(`${path}?tab=0`);
                        break;
                    case "KeyX":
                        if (isComposeFile(filename)) {
                            e.preventDefault();
                            navigate(`${path}?tab=1`);
                        }
                        break;
                    case "KeyC":
                        if (isComposeFile(filename)) {
                            e.preventDefault();
                            navigate(`${path}?tab=2`);
                        }
                        break;
                }
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown)
    }, [filename, navigate]);

    const {status, setStatus, handleContentChange} = useSaveStatus(500, filename);

    const tabsList: TabDetails[] = useMemo(() => {
        if (!filename) return [];

        const map: TabDetails[] = []

        map.push({
            label: 'Editor',
            component: <TabEditor
                selectedPage={filename}
                setStatus={setStatus}
                handleContentChange={handleContentChange}
            />,
            shortcut: <ShortcutFormatter title={"Editor"} keyCombo={["ALT", "Z"]}/>,
        })

        if (isComposeFile(filename)) {
            map.push({
                label: 'Deploy',
                component: <TabDeploy selectedPage={filename}/>,
                shortcut: <ShortcutFormatter title={"Editor"} keyCombo={["ALT", "X"]}/>,
            });
            map.push({
                label: 'Stats',
                component: <TabStat selectedPage={filename}/>,
                shortcut: <ShortcutFormatter title={"Editor"} keyCombo={["ALT", "C"]}/>,
            });
        }

        return map;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filename]);

    const currentTab = selectedTab ?? 'editor';

    const handleTabChange = (_event: SyntheticEvent, newKey: string) => {
        navigate(`/stacks/${filename}?tab=${newKey}`);
    };

    useEffect(() => {
        if (selectedTab && tabsList.length > 0) {
            navigate(`/stacks/${filename}?tab=${selectedTab}`, {replace: true});
        }
    }, [filename, selectedTab, tabsList, navigate]);

    if (isLoading) {
        return <CenteredMessage icon={<CircularProgress/>} title=""/>;
    }

    if (fileError) {
        return (
            <CenteredMessage
                icon={<ErrorOutline color="error" sx={{fontSize: 60}}/>}
                title={`Unable to load file: ${filename}`}
                message={fileError}
            />
        );
    }

    const activePanel = tabsList[currentTab].component;
    return (
        <>
            <Box sx={{borderBottom: 1, borderColor: 'divider'}}>
                <Tabs
                    value={currentTab}
                    onChange={handleTabChange}
                    slotProps={{
                        indicator: {
                            sx: {
                                transition: '0.09s',
                                backgroundColor: indicatorMap[status].color,
                            }
                        }
                    }}
                >
                    {tabsList.map((details, key) => (
                        <Tooltip title={details.shortcut} key={key}>
                            <Tab
                                value={key}
                                sx={{
                                    color: (key == 0) ? indicatorMap[status].color : "primary.secondary",
                                }}
                                label={
                                    key === 0 ? (
                                        <Box sx={{display: 'flex', alignItems: 'center', gap: 1}}>
                                            {status === 'idle' ?
                                                <span>{details.label}</span> :
                                                indicatorMap[status]?.component
                                            }
                                        </Box>
                                    ) : details.label
                                }
                            />
                        </Tooltip>
                    ))}
                </Tabs>
            </Box>
            {activePanel && (
                <Fade in={true} timeout={200} key={currentTab}>
                    <Box sx={{
                        flexGrow: 1,
                        overflow: 'auto',
                        display: 'flex',
                        flexDirection: 'column',
                        width: '100%',
                    }}>
                        {activePanel}
                    </Box>
                </Fade>
            )}
        </>
    );
}
