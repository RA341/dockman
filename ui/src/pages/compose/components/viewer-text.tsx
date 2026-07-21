import React, {type ReactElement, useCallback, useEffect, useMemo, useState} from 'react';
import {useNavigate, useSearchParams} from 'react-router-dom';
import {Box, Button, CircularProgress, Fade, Tab, Tabs, Tooltip} from '@mui/material';
import {callRPC, useHostClient} from "../../../lib/api.ts";
import {isComposeFile, stackDefaultTab, useEditorUrl} from "../../../lib/editor.ts";
import {useConfig} from "../../../hooks/config.ts";
import TabEditor from "../tab-editor.tsx";
import {ShortcutFormatter} from "./shortcut-formatter.tsx";
import {TabDeploy} from "../tab-deploy.tsx";
import {TabStat} from "../tab-stats.tsx";
import CenteredMessage from "../../../components/centered-message.tsx";
import {ErrorOutlined} from "@mui/icons-material";
import {useCompactMode, useOpenFiles} from "../state/files.ts";
import {FileService} from "../../../gen/files/v1/files_pb.ts";
import {indicatorMap, type SaveState} from "../hooks/status-hook.tsx";

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

interface ActionButtons {
    title: string;
    icon: ReactElement;
    onClick: () => void;
}

function ViewerTextEditor({filename, track}: { filename: string, track: number }) {
    const fileService = useHostClient(FileService);

    const navigate = useNavigate();
    const {dockYaml} = useConfig()
    const [searchParams] = useSearchParams();
    const tabKey = track === 0 ? 'tab' : 'splitTab';
    // no tab selected in the url yet: open on the dockman.yml default tab
    const selectedTab = parseTabType(
        searchParams.get(tabKey) ?? String(stackDefaultTab(dockYaml, filename))
    )

    const [isLoading, setIsLoading] = useState(true);
    const [fileError, setFileError] = useState("");

    const recursiveOpen = useOpenFiles(state => state.recursiveOpen)
    const compact = useCompactMode(state => state.enabled)
    const tabMinHeight = compact ? '34px' : '48px'

    const checkExists = useCallback(async () => {
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
    }, [fileService, filename, recursiveOpen]);

    useEffect(() => {
        checkExists().then()
    }, [checkExists]);

    const editorUrl = useEditorUrl()

    const changeTab = useCallback((tabId: string) => {
        const url = editorUrl(filename, parseInt(tabId), track)
        navigate(url);
    }, [editorUrl, filename, navigate, track]);

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
    }, [changeTab, filename]);

    const [saveStatus, setSaveStatus] = useState<SaveState>('idle')


    const tabsList: TabDetails[] = useMemo(() => {
        if (!filename) return [];

        const map: TabDetails[] = []

        map.push({
            label: 'Editor',
            component: <TabEditor
                selectedPage={filename}
                setFileSaveStatus={setSaveStatus}
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

        return map;
    }, [filename]);

    const currentTab = selectedTab ?? 'editor';

    if (isLoading) {
        return <CenteredMessage icon={<CircularProgress/>} title=""/>;
    }

    if (fileError) {
        return (
            <CenteredMessage
                icon={<ErrorOutlined color="error" sx={{fontSize: 60}}/>}
                title={`Unable to load file: ${filename}`}
                message={fileError}
            />
        );
    }

    const activePanel = (tabsList[currentTab] ?? tabsList[0]).component;
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
                    sx={{minHeight: tabMinHeight}}
                    variant="scrollable"
                    scrollButtons="auto"
                    slotProps={{
                        indicator: {
                            sx: {
                                transition: '0.09s',
                                backgroundColor: indicatorMap[saveStatus].color,
                            }
                        }
                    }}
                >
                    {tabsList.map((details, key) => (
                        <Tooltip title={details.shortcut} key={key}>
                            <Tab
                                value={key}
                                sx={{
                                    color: (key === 0) ? indicatorMap[saveStatus].color : "text.secondary",
                                    minHeight: tabMinHeight
                                }}
                                label={
                                    key === 0 ? (
                                        <Box sx={{display: 'flex', alignItems: 'center', gap: 1}}>
                                            {saveStatus === 'idle' ?
                                                <span>{details.label}</span> :
                                                indicatorMap[saveStatus]?.component
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

export default ViewerTextEditor;
