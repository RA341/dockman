import React, {type ReactNode, type SyntheticEvent, useEffect, useMemo, useState} from 'react';
import {useNavigate, useSearchParams} from 'react-router-dom';
import {Box, CircularProgress, Fade, Tab, Tabs, Tooltip, Typography} from '@mui/material';
import {useActiveComposeFile, useOpenFiles} from "../state/state.tsx";
import {FileService} from "../../../gen/files/v1/files_pb.ts";
import {callRPC, useClient} from "../../../lib/api.ts";
import {useAlias} from "../../../context/alias-context.tsx";
import {isComposeFile} from "../../../lib/editor.ts";
import {type SaveState, useSaveStatus} from "../hooks/status-hook.ts";
import TabEditor from "../tab-editor.tsx";
import {ShortcutFormatter} from "./shortcut-formatter.tsx";
import {TabDeploy} from "../tab-deploy.tsx";
import {TabStat} from "../tab-stats.tsx";
import CenteredMessage from "../../../components/centered-message.tsx";
import {ErrorOutline} from "@mui/icons-material";


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

function TextEditor() {
    const filename = useActiveComposeFile(state => state.activeComposeFile)!

    const fileService = useClient(FileService);

    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const selectedTab = parseTabType(searchParams.get('tab'))

    const [isLoading, setIsLoading] = useState(true);
    const [fileError, setFileError] = useState("");

    const recursiveOpen = useOpenFiles(state => state.recursiveOpen)
    const {activeAlias} = useAlias()

    useEffect(() => {
        const checkExists = async () => {
            setIsLoading(true);
            setFileError("");

            const {err} = await callRPC(() => fileService.exists({
                filename: filename,
                alias: activeAlias,
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

export default TextEditor;