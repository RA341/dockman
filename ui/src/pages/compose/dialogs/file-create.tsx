import React, {useEffect, useRef, useState} from "react";
import {
    Box,
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Divider,
    InputAdornment,
    Paper,
    Stack,
    TextField,
    Typography
} from "@mui/material";
import {
    AddCircleOutline,
    ArrowBack,
    Cancel,
    ChevronRight,
    ContentCopy,
    CreateNewFolder,
    Folder,
    InsertDriveFile,
    Terminal
} from "@mui/icons-material";
import {amber, grey} from "@mui/material/colors";
import {create} from "zustand";
import {useFiles} from "../../../context/file-context.tsx";

export type PresetType = 'file' | 'folder' | 'compose-directory';
export type CreationStep = 'preset-selection' | 'name-input';

interface FilePreset {
    type: PresetType;
    title: string;
    description: string;
    icon: React.ReactNode;
}

const FILE_PRESETS: FilePreset[] = [
    {
        type: 'file',
        title: 'New File',
        description: 'Create a single file. Directories in path are created automatically.',
        icon: <InsertDriveFile color="primary"/>
    },
    {
        type: 'folder',
        title: 'New Folder',
        description: 'Create a new directory for organizing your projects.',
        icon: <Folder sx={{color: amber[700]}}/>
    },
    {
        type: 'compose-directory',
        title: 'Compose Project',
        description: 'Creates a folder with a boilerplate compose.yaml inside.',
        icon: <Terminal color="secondary"/>
    }
];

interface FileCreateState {
    copyMode: boolean;
    rootPath: string; // The directory where the action happens
    srcPath: string;  // The original file path (used for copying)
    isDir: boolean;   // Whether the item being created/copied is a directory
    open: (root: string, copy?: boolean, src?: string, isDir?: boolean) => void;
    closeDialog: () => void;
}

export const useFileCreate = create<FileCreateState>((set) => ({
    copyMode: false,
    rootPath: "",
    srcPath: "",
    isDir: false,
    open: (root, copy = false, src = "", isDir = false) => {
        set({
            rootPath: root,
            copyMode: copy,
            srcPath: src,
            isDir: isDir
        });
    },
    closeDialog: () => {
        set({
            rootPath: "",
            copyMode: false,
            srcPath: "",
            isDir: false
        });
    }
}));

function FileCreate({initialName = ""}: { initialName?: string }) {
    const {rootPath, srcPath, isDir, copyMode, closeDialog} = useFileCreate();
    const {addFile, copyFile} = useFiles();

    const [step, setStep] = useState<CreationStep>('preset-selection');
    const [selectedPresetIndex, setSelectedPresetIndex] = useState(0);
    const [name, setName] = useState('');

    const inputRef = useRef<HTMLInputElement>(null);

    // Sync state when dialog opens
    useEffect(() => {
        if (rootPath) {
            setStep(copyMode ? 'name-input' : 'preset-selection');
            setName(initialName);
            setSelectedPresetIndex(0);
        }
    }, [rootPath, initialName, copyMode]);

    // Auto-focus logic
    useEffect(() => {
        if (step === 'name-input' && rootPath) {
            const timer = setTimeout(() => inputRef.current?.focus(), 100);
            return () => clearTimeout(timer);
        }
    }, [step, rootPath]);

    const handleConfirm = async () => {
        const trimmedName = name.trim();
        if (!trimmedName) return;

        // Construct final path
        let finalPath = rootPath ? `${rootPath.replace(/\/$/, '')}/${trimmedName}` : trimmedName;

        const selectedPreset = FILE_PRESETS[selectedPresetIndex].type;

        try {
            if (copyMode) {
                // srcPath: original full path, finalPath: new full path
                await copyFile(srcPath, finalPath, isDir);
            } else {
                if (selectedPreset === 'compose-directory') {
                    // Custom logic for compose projects
                    const composePath = `${finalPath}/${trimmedName}-compose.yaml`;
                    await addFile(composePath, false);
                } else {
                    await addFile(finalPath, selectedPreset === 'folder');
                }
            }
            closeDialog();
        } catch (err) {
            console.error("File operation failed", err);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (step === 'preset-selection') {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSelectedPresetIndex(prev => (prev + 1) % FILE_PRESETS.length);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSelectedPresetIndex(prev => (prev - 1 + FILE_PRESETS.length) % FILE_PRESETS.length);
            } else if (e.key === 'Enter') {
                setStep('name-input');
            }
        } else if (step === 'name-input') {
            if (e.key === 'Enter') {
                handleConfirm().then();
            } else if (e.key === 'Escape') {
                if (copyMode) closeDialog();
                else setStep('preset-selection');
            }
        }

        if (e.key === 'Escape' && step === 'preset-selection') closeDialog();
    };

    const currentPreset = FILE_PRESETS[selectedPresetIndex];

    return (
        <Dialog
            open={!!rootPath}
            onClose={closeDialog}
            fullWidth
            maxWidth="sm"
            onKeyDown={handleKeyDown}
            slotProps={{
                paper: {sx: {borderRadius: 3, backgroundImage: 'none'}}
            }}
        >
            <DialogTitle sx={{p: 3, pb: 2}}>
                <Stack direction="row" alignItems="center" spacing={1.5}>
                    <Box sx={{
                        p: 1,
                        borderRadius: 1.5,
                        bgcolor: copyMode ? 'info.dark' : 'primary.dark',
                        color: 'white',
                        display: 'flex'
                    }}>
                        {copyMode ? <ContentCopy fontSize="small"/> : <AddCircleOutline fontSize="small"/>}
                    </Box>
                    <Box>
                        <Typography variant="h6" sx={{fontWeight: 800, lineHeight: 1.2}}>
                            {copyMode ? 'Duplicate Item' : 'Create New'}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            Location: <code style={{color: grey[400]}}>{rootPath || '/'}</code>
                        </Typography>
                    </Box>
                </Stack>
            </DialogTitle>

            <DialogContent sx={{p: 3, pt: 1}}>
                {step === 'preset-selection' ? (
                    <Stack spacing={1.5} sx={{mt: 1}}>
                        <Typography variant="overline" sx={{color: 'text.secondary', fontWeight: 700}}>
                            Select Type (Use arrows ↑↓)
                        </Typography>
                        {FILE_PRESETS.map((preset, index) => {
                            const isSelected = index === selectedPresetIndex;
                            return (
                                <Paper
                                    key={preset.type}
                                    variant="outlined"
                                    onClick={() => {
                                        setSelectedPresetIndex(index);
                                        setStep('name-input');
                                    }}
                                    sx={{
                                        p: 2,
                                        cursor: 'pointer',
                                        transition: 'all 0.1s',
                                        borderWidth: 2,
                                        borderColor: isSelected ? 'primary.main' : 'divider',
                                        bgcolor: isSelected ? 'action.selected' : 'background.paper',
                                        '&:hover': {
                                            borderColor: 'primary.main',
                                        }
                                    }}
                                >
                                    <Stack direction="row" alignItems="center" spacing={2}>
                                        <Box sx={{p: 1, bgcolor: 'background.default', borderRadius: 1}}>
                                            {preset.icon}
                                        </Box>
                                        <Box sx={{flex: 1}}>
                                            <Typography variant="subtitle2" sx={{fontWeight: 700}}>
                                                {preset.title}
                                            </Typography>
                                            <Typography variant="caption" color="text.secondary">
                                                {preset.description}
                                            </Typography>
                                        </Box>
                                        <ChevronRight sx={{color: isSelected ? 'primary.main' : 'text.disabled'}}/>
                                    </Stack>
                                </Paper>
                            );
                        })}
                    </Stack>
                ) : (
                    <Stack spacing={3} sx={{mt: 1}}>
                        <Box>
                            <Typography variant="overline" sx={{color: 'text.secondary', fontWeight: 700}}>
                                {copyMode ? 'New Name' : `${currentPreset?.title} Name`}
                            </Typography>
                            <TextField
                                inputRef={inputRef}
                                fullWidth
                                placeholder="Enter name..."
                                variant="outlined"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                sx={{mt: 0.5}}
                                InputProps={{
                                    startAdornment: (
                                        <InputAdornment position="start">
                                            {copyMode ? (isDir ? <Folder fontSize="small"/> :
                                                    <InsertDriveFile fontSize="small"/>) :
                                                (currentPreset.type === 'folder' ? <CreateNewFolder fontSize="small"/> :
                                                    <InsertDriveFile fontSize="small"/>)}
                                        </InputAdornment>
                                    ),
                                }}
                            />
                        </Box>

                        <Box>
                            <Typography variant="overline" sx={{color: 'text.secondary', fontWeight: 700}}>
                                Destination Preview
                            </Typography>
                            <Paper variant="outlined"
                                   sx={{p: 2, mt: 0.5, borderStyle: 'dashed', bgcolor: 'action.hover'}}>
                                <Typography variant="body2" sx={{fontFamily: 'monospace', wordBreak: 'break-all'}}>
                                    {rootPath || '/'}{rootPath.endsWith('/') ? '' : '/'}<span
                                    style={{color: '#90caf9'}}>{name || '...'}</span>
                                    {currentPreset.type === 'compose-directory' && !copyMode && `/${name || '...'}-compose.yaml`}
                                </Typography>
                            </Paper>
                        </Box>
                    </Stack>
                )}
            </DialogContent>

            <Divider/>

            <DialogActions sx={{p: 2.5}}>
                <Button
                    variant="outlined"
                    color="inherit"
                    onClick={step === 'name-input' && !copyMode ? () => setStep('preset-selection') : closeDialog}
                    startIcon={step === 'name-input' && !copyMode ? <ArrowBack/> : <Cancel/>}
                >
                    {step === 'name-input' && !copyMode ? 'Back' : 'Cancel'}
                </Button>
                <Box sx={{flex: 1}}/>
                <Button
                    variant="contained"
                    disabled={!name.trim()}
                    onClick={handleConfirm}
                    sx={{px: 4, fontWeight: 700}}
                >
                    {copyMode ? 'Duplicate' : 'Create'}
                </Button>
            </DialogActions>
        </Dialog>
    );
}

export default FileCreate;
