import {Box, IconButton, Tooltip} from "@mui/material";
import {type JSX, useMemo, useState} from "react";
import {callRPC, useHostClient} from "../../lib/api";
import {useSnackbar} from "../../hooks/snackbar.ts";
import {type SaveState} from "./hooks/status-hook.tsx";
import {CloudUploadOutlined, ConstructionRounded, ErrorOutlineOutlined, MoveDownRounded} from "@mui/icons-material";
import {isComposeFile} from "../../lib/editor.ts";
import useResizeBar from "./hooks/resize-hook.ts";
import {useFiles} from "../../context/file-context.tsx";
import ComposerizeWidget from "./editor-widgets/composerize.tsx";
import EditorErrorWidget from "./editor-widgets/errors.tsx";
import EditorDeployWidget from "./editor-widgets/deploy.tsx";
import ItToolsWidget from "./editor-widgets/it-tools.tsx";
import {DockerService} from "../../gen/docker/v1/docker_pb.ts";
import EditorCommon from "./components/editor-common.tsx";

type ActionItem = {
    element: JSX.Element;
    icon: JSX.Element;
    label: string;
};

interface EditorProps {
    selectedPage: string;
    setFileSaveStatus: (status: SaveState) => void;
}

function TabEditor({selectedPage, setFileSaveStatus}: EditorProps) {
    const {showWarning} = useSnackbar();
    const dockerClient = useHostClient(DockerService)
    const {uploadFile, downloadFile} = useFiles()

    const [errors, setErrors] = useState<string[]>([])

    const getFile = async (filename: string) => {
        const {file, err} = await downloadFile(filename)
        return {contents: file, err: err}
    };

    const saveFile = async (filename: string, contents: string) => {
        const err = await uploadFile(filename, contents);
        if (err) {
            return err
        }

        await validateFile();
        return ""
    }

    const [activeAction, setActiveAction] = useState<string | null>(null);

    async function validateFile() {
        if (isComposeFile(selectedPage)) {
            const {val: errs, err: err2} = await callRPC(() =>
                dockerClient.composeValidate({
                    filename: selectedPage,
                }))
            if (err2) {
                showWarning(`Error validating file ${err2}`);
            }
            const errList = errs?.errs.map((err) => err.toString())

            if (errList && errList.length !== 0) {
                setErrors([...errList])
                setActiveAction('errors')
            } else {
                setErrors([])
                setActiveAction(prevState => {
                    if (prevState && prevState === 'errors') {
                        return null
                    }

                    return prevState
                })
            }
        }
    }

    const actions: Record<string, ActionItem> = useMemo(() => {
        const baseActions: Record<string, ActionItem> = {
            errors: {
                element: <EditorErrorWidget errors={errors}/>,
                icon: <ErrorOutlineOutlined/>,
                label: 'Show validation errors',
            },
            "it-tools": {
                element: <ItToolsWidget/>,
                icon: <ConstructionRounded/>,
                label: 'Use IT tools',
            }
        };

        if (isComposeFile(selectedPage)) {
            baseActions["deploy"] = {
                element: <EditorDeployWidget/>,
                icon: <CloudUploadOutlined/>,
                label: 'Deploy project',
            };

            baseActions["composerize"] = {
                element: <ComposerizeWidget/>,
                icon: <MoveDownRounded/>,
                label: 'Convert Docker run to compose',
            };

        }

        return baseActions;
    }, [selectedPage, errors]);

    return (
        <Box sx={{
            p: 0.7,
            height: '100%',
            flexGrow: 1,
            display: 'flex',
            flexDirection: 'column'
        }}>
            <Box sx={{
                flexGrow: 1,
                display: 'flex',
                flexDirection: 'row',
                border: '1px solid',
                borderColor: 'rgba(255, 255, 255, 0.23)',
                borderRadius: 1,
                backgroundColor: 'rgba(0,0,0,0.1)',
                overflow: 'hidden'
            }}>
                {/* Editor Container */}
                <Box sx={{
                    flexGrow: 1,
                    position: 'relative',
                    display: 'flex',
                    minWidth: 0,
                }}>
                    <EditorCommon
                        filename={selectedPage}
                        saveFile={saveFile}
                        getFile={getFile}
                        setFileSaveStatus={setFileSaveStatus}
                    />
                </Box>

                <SidebarContent
                    actions={actions}
                    activeAction={activeAction}
                />

                <SideBar
                    activeAction={activeAction}
                    actions={actions}
                    setActiveAction={setActiveAction}
                />
            </Box>
        </Box>
    )
}

const SideBar = (
    {
        actions,
        activeAction,
        setActiveAction
    }: {
        activeAction: string | null;
        actions: Record<string, ActionItem>
        setActiveAction: (activeAction: string | null) => void;
    }) => {
    return (
        <Box
            sx={{
                display: 'flex',
                flexDirection: 'column',
                backgroundColor: '#252727',
                borderLeft: '1px solid',
                borderColor: 'rgba(255, 255, 255, 0.23)',
                width: '45px',
                flexShrink: 0,
            }}
        >
            {Object.entries(actions).map(([key, {icon, label}]) => {
                const isActive = activeAction === key;

                return (
                    <Tooltip key={key} title={label} placement="left">
                        <Box
                            sx={{
                                backgroundColor: isActive ? 'rgba(255,255,255,0.08)' : 'transparent',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                borderBottom: '1px solid rgba(255,255,255,0.1)',
                                cursor: 'pointer',
                                '&:hover': {
                                    backgroundColor: 'rgba(255, 255, 255, 0.08)',
                                },
                            }}
                            onClick={() => setActiveAction(isActive ? null : key)}
                        >
                            <IconButton
                                size="small"
                                aria-label={label}
                                sx={{
                                    color: isActive ? 'primary.main' : 'white', // change colors here
                                }}
                            >
                                {icon}
                            </IconButton>
                        </Box>
                    </Tooltip>
                );
            })}
        </Box>
    );
};

const SidebarContent = (
    {
        actions,
        activeAction
    }: {
        activeAction: string | null;
        actions: Record<string, ActionItem>
    }) => {
    const {panelSize, panelRef, handleMouseDown, isResizing} = useResizeBar('left', 450)

    return (
        <Box ref={panelRef}
             sx={{
                 width: activeAction !== null ? `${panelSize}px` : '0px',
                 transition: isResizing ? 'none' : 'width 0.1s ease-in-out',
                 overflow: 'hidden',
                 backgroundColor: '#1E1E1E',
                 position: 'relative',
             }}>
            {/* Resize handle */}
            {activeAction !== null && (
                <Box
                    onMouseDown={handleMouseDown}
                    sx={{
                        position: 'absolute',
                        left: 0,
                        top: 0,
                        bottom: 0,
                        width: '4px',
                        cursor: 'ew-resize',
                        backgroundColor: isResizing ? 'rgba(255,255,255,0.1)' : 'transparent',
                        '&:hover': {
                            backgroundColor: 'rgba(255,255,255,0.1)',
                        },
                        zIndex: 10,
                    }}
                />
            )}

            {/* Content */}
            <Box sx={{
                p: activeAction ? 2 : 0,
                width: '100%',
                overflow: 'hidden',
            }}>
                {(activeAction) && actions[activeAction].element}
            </Box>
        </Box>
    );
};

export default TabEditor
