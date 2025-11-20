import {Box, Fade, IconButton, Tooltip} from "@mui/material";
import {type JSX, useCallback, useEffect, useMemo, useState} from "react";
import {callRPC, downloadFile, uploadFile, useClient} from "../../lib/api";
import {MonacoEditor} from "./components/editor.tsx";
import {useSnackbar} from "../../hooks/snackbar.ts";
import {type SaveState} from "./hooks/status-hook.ts";
import {CloudUploadOutlined, ErrorOutlineOutlined} from "@mui/icons-material";
import {DockerService} from "../../gen/docker/v1/docker_pb.ts";
import {isComposeFile} from "../../lib/editor.ts";
import EditorErrorWidget from "./editor-widget-errors.tsx";
import EditorDeployWidget from "./editor-widget-deploy.tsx";
import useResizeBar from "./hooks/resize-hook.ts";

interface EditorProps {
    selectedPage: string;
    setStatus: (status: SaveState) => void;
    handleContentChange: (value: string, onSave: (value: string) => void) => void;
}

type ActionItem = {
    element: JSX.Element;
    icon: JSX.Element;
    label: string;
};

function TabEditor({selectedPage, setStatus, handleContentChange}: EditorProps) {
    const {showError, showWarning} = useSnackbar();
    const dockerClient = useClient(DockerService)

    const [errors, setErrors] = useState<string[]>([])

    const [fileContent, setFileContent] = useState("")
    const fetchDataCallback = useCallback(async () => {
        if (selectedPage !== "") {
            const {file, err} = await downloadFile(selectedPage)
            if (err) {
                showError(`Error downloading file ${err}`)
            } else {
                setFileContent(file)
            }
        }
        // eslint-disable-next-line
    }, [selectedPage]);

    const actions: Record<string, ActionItem> = useMemo(() => {
        const baseActions: Record<string, ActionItem> = {
            errors: {
                element: <EditorErrorWidget errors={errors}/>,
                icon: <ErrorOutlineOutlined/>,
                label: 'Show validation errors',
            },
        };

        if (isComposeFile(selectedPage)) {
            baseActions["deploy"] = {
                element: <EditorDeployWidget/>,
                icon: <CloudUploadOutlined/>,
                label: 'Deploy project',
            };
        }

        return baseActions;
    }, [selectedPage, errors]);

    useEffect(() => {
        fetchDataCallback().then()
    }, [fetchDataCallback]);

    const [activeAction, setActiveAction] = useState<keyof typeof actions | null>(null);

    const saveFile = useCallback(async (val: string) => {
        const err = await uploadFile(selectedPage, val);
        if (err) {
            setStatus('error');
            showError(`Autosave failed: ${err}`);
        } else {
            setStatus('success');
        }

        if (isComposeFile(selectedPage)) {
            const {val: errs, err: err2} = await callRPC(
                () => dockerClient.composeValidate({
                    filename: selectedPage
                }))
            if (err2) {
                showWarning(`Error validating file ${err2}`);
            }
            const ssd = errs?.errs.map((err) => err.toString())

            if (ssd && ssd.length !== 0) {
                setErrors(ssd)
                setActiveAction('errors')
            } else {
                setErrors([])
                setActiveAction(null)
            }
        }
        // eslint-disable-next-line
    }, [selectedPage, setStatus]);

    const {panelSize, panelRef, handleMouseDown, isResizing} = useResizeBar('left')

    function handleEditorChange(value: string | undefined): void {
        const newValue = value!
        handleContentChange(newValue, saveFile)
    }

    return (
        <>
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
                    }}>
                        <Fade in={true} key={'diff'} timeout={280}>
                            <Box
                                sx={{
                                    position: 'absolute',
                                    top: 0,
                                    left: 0,
                                    right: 0,
                                    bottom: 0,
                                    p: 0.1,
                                    display: 'flex'
                                }}
                            >
                                <MonacoEditor
                                    selectedFile={selectedPage}
                                    fileContent={fileContent}
                                    handleEditorChange={handleEditorChange}
                                />
                            </Box>
                        </Fade>
                    </Box>

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
                        <Box sx={{p: 2, width: '100%'}}>
                            {(activeAction) && actions[activeAction].element}
                        </Box>
                    </Box>

                    {/*  Side Widget Panel */}
                    <Box
                        sx={{
                            display: 'flex',
                            flexDirection: 'column',
                            backgroundColor: '#252727',
                            borderLeft: '1px solid',
                            borderColor: 'rgba(255, 255, 255, 0.23)',
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
                                        onClick={() => setActiveAction(isActive ? null : (key as keyof typeof actions))}
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
                </Box>
            </Box>
        </>
    );
}

export default TabEditor



