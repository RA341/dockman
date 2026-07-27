import {MonacoEditor} from "./editor.tsx";
import {useCallback, useEffect, useState} from "react";
import {useSnackbar} from "../../../hooks/snackbar.ts";
import {Alert, AlertTitle, Box, Button, CircularProgress, Link, Typography} from '@mui/material';
import {ErrorOutline, WarningAmber} from '@mui/icons-material';
import {type SaveState, useSaveStatus} from "../hooks/status-hook.tsx";
import {useEditorSave} from "../state/save.ts";
import {ErrFileNotSupported} from "../../../context/file-context.tsx";

interface TextEditorProps {
    filename: string
    // returns str err
    saveFile: (filename: string, contents: string) => Promise<string>
    getFile: (filename: string) => Promise<{ contents: string; err: string }>

    setFileSaveStatus: (status: SaveState) => void
}

function EditorCommon({filename, setFileSaveStatus, saveFile, getFile}: TextEditorProps) {
    const {showError} = useSnackbar();

    const [contents, setContents] = useState<string>("");
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState("");

    const registerSaver = useEditorSave(state => state.registerSaver);
    const unregisterSaver = useEditorSave(state => state.unregisterSaver);

    const saveContents = useCallback(async (newContent: string): Promise<SaveState> => {
        const err = await saveFile(filename, newContent);
        if (err) {
            showError(`Could not save contents: ${err}`);
            return 'error'
        } else {
            return 'success'
        }
    }, [filename, saveFile, showError]);

    const {status, handleContentChange, saveNow, setBaseline} = useSaveStatus(500, filename, saveContents);

    const refreshFile = async () => {
        await getFile(filename)
    }

    const loadFile = async () => {
        setErr("")
        setLoading(true)

        const {contents, err} = await getFile(filename)

        if (!err) {
            // the on-disk content is the baseline used to decide whether the
            // file has unsaved changes (reverting edits clears "unsaved")
            setBaseline(contents)
        }

        // prefer an in-memory draft (unsaved edits from before a tab switch)
        // over the persisted content coming from the backend
        const draft = useEditorSave.getState().drafts[filename];
        if (draft !== undefined) {
            setContents(draft)
        } else if (err) {
            setErr(err)
        } else {
            setContents(contents)
        }

        setLoading(false);
    };

    useEffect(() => {
        setFileSaveStatus(status)
    }, [status]);

    useEffect(() => {
        loadFile().then();
        // reload content when switching to a different file
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filename]);

    // expose the manual save so toolbar buttons (diskette) can trigger it
    useEffect(() => {
        registerSaver(filename, saveNow);
        return () => unregisterSaver(filename);
    }, [filename, saveNow, registerSaver, unregisterSaver]);

    // CTRL+S / CMD+S saves pending changes, even when auto-save is enabled
    // (flushes the debounce immediately)
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 's') {
                e.preventDefault();
                if (!e.repeat) {
                    saveNow().then();
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [saveNow]);

    // warn before closing the browser tab with unsaved changes
    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (useEditorSave.getState().dirtyFiles[filename]) {
                e.preventDefault();
            }
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [filename]);

    const onContentChange = (value: string | undefined) => {
        if (value === undefined) return;
        handleContentChange(value)
    }

    if (loading) {
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
                {
                    err.startsWith(ErrFileNotSupported) ?
                        <BinaryErrView err={err}/> :
                        <NormalErrView
                            err={err}
                            retry={refreshFile}
                        />
                }
            </Box>
        );
    }

    return (
        <Box sx={{flexGrow: 1, position: 'relative'}}>
            <MonacoEditor
                selectedFile={filename}
                fileContent={contents}
                handleEditorChange={onContentChange}
            />
        </Box>
    );
}

const NormalErrView = ({err, retry}: { err: string, retry: () => void }) => {
    return (
        <Alert
            severity="error"
            variant="outlined"
            icon={<ErrorOutline/>}
            sx={{borderRadius: 2, bgcolor: 'background.paper'}}
        >
            <AlertTitle sx={{fontWeight: 700}}>
                Download Failed
            </AlertTitle>
            <Typography variant="body2">
                An error occurred while trying to retrieve the file content.
            </Typography>
            <Button variant='outlined' onClick={retry}>
                Reload
            </Button>
            <Box sx={{
                mt: 1,
                p: 1,
                borderRadius: 1,
                fontFamily: 'monospace',
                fontSize: '0.7rem'
            }}>
                {err}
            </Box>
        </Alert>
    )
}

const BinaryErrView = ({err}: { err: string }) => {
    return (
        <Alert
            severity="warning"
            variant="outlined"
            icon={<WarningAmber/>}
            sx={{borderRadius: 2, bgcolor: 'background.paper'}}
        >
            <AlertTitle sx={{fontWeight: 700}}>Binary File Detected</AlertTitle>
            <Typography variant="body1" sx={{mb: 1.5}}>
                Dockman has determined that this is not a valid text file. To prevent accidental
                corruption, editing binary files is not allowed.
            </Typography>
            <Typography variant="caption" color="text.secondary" display="block">
                If you believe this file should be editable,{' '}
                <Link
                    href="https://github.com/ra341/dockman/issues"
                    target="_blank"
                    rel="noopener"
                    sx={{fontWeight: 700, textDecoration: 'underline'}}
                >
                    submit an issue
                </Link>
                .
            </Typography>
            <Box sx={{
                mt: 1,
                p: 1,
                borderRadius: 1,
                fontFamily: 'monospace',
                fontSize: '0.8rem'
            }}>
                {err}
            </Box>
        </Alert>
    )
}

export default EditorCommon;
