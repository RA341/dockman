import {MonacoEditor} from "./editor.tsx";
import {useFileComponents} from "../state/terminal.tsx";
import {useEffect, useState} from "react";
import {callRPC, useHostClient} from "../../../lib/api.ts";
import {DockyamlService} from "../../../gen/dockyaml/v1/dockyaml_pb.ts";
import {useSnackbar} from "../../../hooks/snackbar.ts";
import {Alert, AlertTitle, Box, Button, capitalize, CircularProgress, Tooltip, Typography} from '@mui/material';
import {Refresh} from '@mui/icons-material';
import {indicatorMap, type SaveState, useSaveStatus} from "../hooks/status-hook.tsx";
import {useConfig} from "../../../hooks/config.ts";

const dockyamlFilePath = "dockman.yml";

export function formatDockyaml(alias: string, host: string) {
    return `${alias}/${host}.${dockyamlFilePath}`;
}

function DockyamlViewer() {
    const dockYamlClient = useHostClient(DockyamlService);
    const {showError} = useSnackbar();
    const {filename} = useFileComponents();

    const [contents, setContents] = useState<string>("");
    const [loading, setLoading] = useState(true); // Start as true for initial load
    const [err, setErr] = useState("");

    const {status, handleContentChange} = useSaveStatus(500, filename);

    const loadFile = async () => {
        setErr("")
        setLoading(true)

        const {val, err: rpcError} = await callRPC(() => dockYamlClient.get({}))
        if (rpcError) {
            setErr(rpcError)
        } else {
            setContents(arrayBufferLikeToString(val?.contents))
        }

        setLoading(false);
    };

    const saveContents = async (newContent: string): Promise<SaveState> => {
        const {err} = await callRPC(() =>
            dockYamlClient.save({contents: stringToArrayBuffer(newContent)})
        );
        if (err) {
            showError(`Could not save contents: ${err}`);
            return 'error'
        } else {
            return 'success'
        }
    };

    useEffect(() => {
        loadFile().then();
    }, []);

    const onEditorChange = (value: string | undefined) => {
        if (value === undefined) return;
        handleContentChange(value, saveContents)
    }

    if (loading && !contents) {
        return (
            <Box sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                gap: 2
            }}>
                <CircularProgress size={40}/>
                <Typography variant="body2" color="text.secondary">Loading {filename}...</Typography>
            </Box>
        );
    }

    if (err) {
        return (
            <Box sx={{p: 3}}>
                <Alert
                    severity="error"
                    action={
                        <Button color="inherit" size="small" startIcon={<Refresh/>} onClick={loadFile}>
                            Retry
                        </Button>
                    }
                >
                    <AlertTitle>Failed to load configuration</AlertTitle>
                    {err}
                </Alert>
            </Box>
        );
    }

    const {fetchDockmanYaml} = useConfig()

    return (
        <Box sx={{
            height: '100%',
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            bgcolor: '#1e1e1e' // Match Monaco background
        }}>
            {/* Editor Action Bar */}
            <Box sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                px: 2,
                py: 0.75,
                borderBottom: 1,
                borderColor: 'divider',
                bgcolor: 'background.default'
            }}>
                {/* Left Side: Status & Filename */}
                <Box sx={{display: 'flex', alignItems: 'center', gap: 1.5}}>
                    <Tooltip title={"Refetch the file"}>
                        <Button
                            size="small"
                            variant="outlined"
                            color="warning"
                            onClick={() => loadFile()}
                            // startIcon={<Refresh sx={{fontSize: 16}}/>}
                            sx={{fontSize: '0.75rem', textTransform: 'none'}}
                        >
                            Reload
                        </Button>
                    </Tooltip>

                    <Tooltip title={"Apply the new config"}>
                        <Button
                            size="small"
                            variant="outlined"
                            color="info"
                            disableElevation
                            onClick={() => fetchDockmanYaml()}
                            sx={{fontSize: '0.75rem', textTransform: 'none'}}
                        >
                            Apply
                        </Button>
                    </Tooltip>

                    <Typography variant="caption" sx={{
                        px: 1,
                        py: 0.2,
                        borderRadius: 1,
                        bgcolor: 'transparent',
                        borderColor: indicatorMap[status].color,
                        color: indicatorMap[status].color,
                        fontWeight: 'bold',
                        border: '1px solid',
                    }}>
                        {capitalize(status)}
                    </Typography>
                </Box>


                {/* Right Side: Actions */}
                <Box sx={{display: 'flex', gap: 1}}>
                </Box>
            </Box>

            {/* Editor Container */}
            <Box sx={{flexGrow: 1, position: 'relative'}}>
                <MonacoEditor
                    selectedFile={filename}
                    fileContent={contents}
                    handleEditorChange={onEditorChange}
                />
            </Box>
        </Box>
    );
}

export default DockyamlViewer;


function stringToArrayBuffer(str: string): Uint8Array<ArrayBuffer> {
    const encoder = new TextEncoder();
    return encoder.encode(str);
}

function arrayBufferLikeToString(bufferLike?: ArrayBufferLike): string {
    if (!bufferLike) {
        return "";
    }

    // Ensure the input is an ArrayBuffer (or compatible TypedArray)
    const uint8Array = new Uint8Array(bufferLike);
    const decoder = new TextDecoder('utf-8'); // Specify encoding if needed, UTF-8 is default
    return decoder.decode(uint8Array);
}
