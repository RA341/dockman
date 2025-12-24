import React, {type ReactElement, type ReactNode, useEffect, useMemo, useState} from 'react';
import {useNavigate, useSearchParams} from 'react-router-dom';
import {Box, Button, CircularProgress, Fade, Tab, Tabs, Tooltip, Typography} from '@mui/material';
import {useFileComponents} from "../state/terminal.tsx";
import {callRPC, useFileClient} from "../../../lib/api.ts";
import {isComposeFile, useEditorUrl} from "../../../lib/editor.ts";
import {type SaveState, useSaveStatus} from "../hooks/status-hook.ts";
import TabEditor from "../tab-editor.tsx";
import {ShortcutFormatter} from "./shortcut-formatter.tsx";
import {TabDeploy} from "../tab-deploy.tsx";
import {TabStat} from "../tab-stats.tsx";
import CenteredMessage from "../../../components/centered-message.tsx";
import {ErrorOutline, RefreshRounded} from "@mui/icons-material";
import {useConfig} from "../../../hooks/config.ts";
import {useOpenFiles} from "../state/files.ts";

export enum TabType {
    // noinspection JSUnusedGlobalSymbols
    EDITOR,
    DEPLOY,
    STATS,
}

export function parseTabType(input: string | null): TabType {
    const tabValueInt = parseInt(input ?? '0', 10)
    const isValidTab = TabType[tabValueInt] !== undefined
    return isValidTab ? tabValueInt : TabType.EDITOR
}

export interface TabDetails {
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

interface ActionButtons {
    title: string;
    icon: ReactElement;
    onClick: () => void;
}

function isDockmanYaml(filename: string) {
    return filename.endsWith(".dockman.yaml") ||
        filename.endsWith(".dockman.yml");
}

function TextEditor() {
    const {filename: fn} = useFileComponents()
    const filename = fn! // file will never be null if we reached this point
    const {fetchDockmanYaml} = useConfig()

    const fileService = useFileClient();

    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const selectedTab = parseTabType(searchParams.get('tab'))

    const [isLoading, setIsLoading] = useState(true);
    const [fileError, setFileError] = useState("");

    const recursiveOpen = useOpenFiles(state => state.recursiveOpen)
    const {alias: activeAlias} = useFileComponents()

    useEffect(() => {
        const checkExists = async () => {
            setIsLoading(true);
            setFileError("");

            const {err} = await callRPC(() => fileService.exists({
                filename: filename,
            }))
            if (err) {
                console.error("API error checking file existence:", err);
                setFileError(`An API error occurred: ${err}`);
            }
            setIsLoading(false);
            recursiveOpen(filename)
        }

        checkExists().then()
    }, [filename, fileService, activeAlias]);

    const editorUrl = useEditorUrl()

    const changeTab = (tabId: string) => {
        const url = editorUrl(filename, parseInt(tabId))
        navigate(url);
    };

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.altKey && !e.repeat) {
                switch (e.code) {
                    case "KeyZ":
                        e.preventDefault();
                        changeTab('0')
                        break;
                    case "KeyX":
                        if (isComposeFile(filename)) {
                            e.preventDefault();
                            changeTab('1')
                        }
                        break;
                    case "KeyC":
                        if (isComposeFile(filename)) {
                            e.preventDefault();
                            changeTab('2')
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

    const buttonList: ActionButtons[] = useMemo(() => {
        if (!filename) return [];

        const map: ActionButtons[] = []

        // todo action is not available outside of the editor
        // if (isComposeFile(filename)) {
        //     map.push({
        //         title: "Format",
        //         icon: <CleaningServicesRounded/>,
        //         onClick: () => {
        //             fs.format({filename: filename}).then()
        //         },
        //     })
        // }

        if (isDockmanYaml(filename)) {
            map.push({
                title: "Reload",
                icon: <RefreshRounded/>,
                onClick: () => {
                    fetchDockmanYaml().then()
                },
            })
        }

        return map;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filename, fetchDockmanYaml]);


    const currentTab = selectedTab ?? 'editor';

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
            <Box sx={{
                display: 'flex',
                alignItems: 'center',
                borderBottom: 1,
                borderColor: 'divider'
            }}>
                <Tabs
                    value={currentTab}
                    onChange={(_event, value) => changeTab(value)}
                    sx={{minHeight: '48px'}}
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
                                    color: (key === 0) ? indicatorMap[status].color : "text.secondary",
                                    minHeight: '48px'
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

                {selectedTab === TabType.EDITOR &&
                    <Box sx={{display: 'flex', gap: 1, px: 2}}>
                        {buttonList.map((details) => (
                            <Button
                                size="small"
                                variant="outlined"
                                onClick={details.onClick}
                                startIcon={details.icon}
                            >
                                {details.title}
                            </Button>
                        ))}
                    </Box>
                }
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

export default TextEditor;