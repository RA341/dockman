import {Box, Fade, IconButton, Tooltip, Typography} from "@mui/material";
import {useCallback, useEffect, useState} from "react";
import {callRPC, downloadFile, uploadFile, useClient} from "../../lib/api";
import {MonacoEditor} from "./components/editor.tsx";
import {useSnackbar} from "../../hooks/snackbar.ts";
import {type SaveState} from "./status-hook.ts";
import {ChevronLeftRounded, ChevronRightOutlined} from "@mui/icons-material";
import {DockerService} from "../../gen/docker/v1/docker_pb.ts";
import {isComposeFile} from "../../lib/editor.ts";

interface EditorProps {
    selectedPage: string;
    setStatus: (status: SaveState) => void;
    handleContentChange: (value: string, onSave: (value: string) => void) => void;
}

export function TabEditor({selectedPage, setStatus, handleContentChange}: EditorProps) {
    const {showError, showWarning} = useSnackbar();
    const dockerClient = useClient(DockerService)

    const [isPanelOpen, setIsPanelOpen] = useState(false);
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
    }, [selectedPage]);

    useEffect(() => {
        fetchDataCallback().then()
    }, [fetchDataCallback]);

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
                setIsPanelOpen(true)
            } else {
                setErrors([])
                setIsPanelOpen(false)
            }
        }
    }, [selectedPage, setStatus]);

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

                    {/* Vertical Action Bar for Toggling */}
                    <Tooltip title={"Show validation errors"}>
                        <Box
                            sx={{
                                backgroundColor: '#252727',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                borderLeft: '1px solid',
                                borderColor: 'rgba(255, 255, 255, 0.23)',
                                cursor: 'pointer',
                                '&:hover': {
                                    backgroundColor: 'rgba(255, 255, 255, 0.08)'
                                }
                            }}
                            onClick={() => setIsPanelOpen(!isPanelOpen)}
                        >
                            <IconButton size="small" aria-label="toggle error panel">
                                {isPanelOpen ? <ChevronRightOutlined/> : <ChevronLeftRounded/>}
                            </IconButton>
                        </Box>
                    </Tooltip>


                    {/* Collapsible Panel */}
                    <Box sx={{
                        width: isPanelOpen ? '250px' : '0px',
                        transition: 'width 0.2s ease-in-out',
                        overflow: 'hidden',
                        backgroundColor: '#1E1E1E',
                    }}>
                        {/* Inner wrapper to prevent content from wrapping during animation */}
                        <Box sx={{p: 2, width: '250px'}}>
                            {errors.length === 0 ? (
                                <Typography variant="subtitle1" sx={{mb: 1, fontWeight: 'bold', whiteSpace: 'nowrap'}}>
                                    No errors detected
                                </Typography>
                            ) : <>
                                <Typography
                                    variant="subtitle1"
                                    sx={{mb: 1, fontWeight: 'bold', whiteSpace: 'nowrap'}}
                                >
                                    Errors
                                </Typography>

                                {errors.map((value, index) => (
                                    <Box
                                        key={index}
                                        sx={{
                                            p: 1.5,
                                            mb: 3,
                                            backgroundColor: 'rgba(211, 47, 47, 0.1)', // Faint red background
                                            border: '1px solid rgba(211, 47, 47, 0.4)',
                                            borderRadius: 1,
                                            fontFamily: 'monospace',
                                            fontSize: '0.875rem',
                                            color: '#ffcdd2', // Light red text for dark mode
                                            whiteSpace: 'pre-wrap', // Allows the text to wrap
                                            wordBreak: 'break-all', // Breaks long unbreakable strings (like paths)
                                        }}
                                    >
                                        {value}
                                    </Box>
                                ))}
                            </>}
                        </Box>
                    </Box>
                </Box>
            </Box>
        </>
    );
}
