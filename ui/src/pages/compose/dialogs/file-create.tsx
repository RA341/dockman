import React, {useEffect, useRef, useState} from "react";
import {
    Alert,
    Box,
    Button,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Divider,
    Grid,
    InputAdornment,
    Link,
    Paper,
    Stack,
    TextField,
    Typography
} from "@mui/material";
import {
    AddCircleOutline,
    ArrowBack,
    AutoAwesome,
    Cancel,
    CheckCircleOutline,
    ChevronRight,
    ContentCopy,
    CreateNewFolder,
    DescriptionOutlined,
    Folder,
    HelpOutline,
    InsertDriveFile,
    SettingsSuggestOutlined,
    Terminal
} from "@mui/icons-material";
import {amber, grey} from "@mui/material/colors";
import {create} from "zustand";
import {useFiles} from "../../../context/file-context.tsx";
import {callRPC, useHostClient, useRPCRunner} from "../../../lib/api.ts";
import {FileService, type Template} from "../../../gen/files/v1/files_pb.ts";

import scrollbarStyles from "../../../components/scrollbar-style.tsx";
import {useSnackbar} from "../../../hooks/snackbar.ts";

export type PresetType = 'file' | 'folder' | 'templates';
export type CreationStep = 'preset-selection' | 'name-input' | 'template-create';

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
        type: 'templates',
        title: 'Template',
        description: 'Create using a template',
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

    useEffect(() => {
        if (rootPath) {
            setStep(copyMode ? 'name-input' : 'preset-selection');
            setName(initialName);
            setSelectedPresetIndex(0);
        }
    }, [rootPath, initialName, copyMode]);

    useEffect(() => {
        if (step === 'name-input' && rootPath) {
            const timer = setTimeout(() => inputRef.current?.focus(), 100);
            return () => clearTimeout(timer);
        }
    }, [step, rootPath]);

    const handlePresetSelection = (index: number) => {
        setSelectedPresetIndex(index);
        const preset = FILE_PRESETS[index];

        if (preset.type === 'templates') {
            setStep('template-create');
        } else {
            setStep('name-input');
        }
    };

    const handleConfirm = async () => {
        const trimmedName = name.trim();
        if (!trimmedName) return;

        let finalPath = rootPath ? `${rootPath.replace(/\/$/, '')}/${trimmedName}` : trimmedName;
        const selectedPreset = FILE_PRESETS[selectedPresetIndex].type;

        try {
            if (copyMode) {
                await copyFile(srcPath, finalPath, isDir);
            } else {
                await addFile(finalPath, selectedPreset === 'folder');
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
                handlePresetSelection(selectedPresetIndex);
            }
        } else if (step === 'name-input') {
            if (e.key === 'Enter') handleConfirm();
            else if (e.key === 'Escape') setStep('preset-selection');
        }

        if (e.key === 'Escape' && step === 'preset-selection') closeDialog();
    };

    const currentPreset = FILE_PRESETS[selectedPresetIndex];

    return (
        <Dialog
            open={!!rootPath}
            onClose={closeDialog}
            fullWidth
            maxWidth={step === 'template-create' ? "sm" : "sm"} // Templates might need more width
            onKeyDown={handleKeyDown}
            slotProps={{
                paper: {sx: {borderRadius: 3, backgroundImage: 'none', transition: 'max-width 0.2s'}}
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
                        {copyMode ? <ContentCopy fontSize="small"/> :
                            step === 'template-create' ? <AutoAwesome fontSize="small"/> :
                                <AddCircleOutline fontSize="small"/>}
                    </Box>
                    <Box>
                        <Typography variant="h6" sx={{fontWeight: 800, lineHeight: 1.2}}>
                            {copyMode ? 'Duplicate Item' : step === 'template-create' ? 'Select Template' : 'Create New'}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            Location: <code style={{color: grey[400]}}>{rootPath || '/'}</code>
                        </Typography>
                    </Box>
                </Stack>
            </DialogTitle>

            <DialogContent sx={{p: 3, pt: 1}}>
                {step === 'preset-selection' && (
                    <Stack spacing={1.5} sx={{mt: 1}}>
                        <Typography variant="overline" sx={{color: 'text.secondary', fontWeight: 700}}>
                            Select Type
                        </Typography>
                        {FILE_PRESETS.map((preset, index) => (
                            <Paper
                                key={preset.type}
                                variant="outlined"
                                onClick={() => handlePresetSelection(index)}
                                sx={{
                                    p: 2,
                                    cursor: 'pointer',
                                    transition: 'all 0.1s',
                                    borderWidth: 2,
                                    borderColor: index === selectedPresetIndex ? 'primary.main' : 'divider',
                                    bgcolor: index === selectedPresetIndex ? 'action.selected' : 'background.paper',
                                    '&:hover': {borderColor: 'primary.main'}
                                }}
                            >
                                <Stack direction="row" alignItems="center" spacing={2}>
                                    <Box sx={{p: 1, bgcolor: 'background.default', borderRadius: 1}}>{preset.icon}</Box>
                                    <Box sx={{flex: 1}}>
                                        <Typography variant="subtitle2"
                                                    sx={{fontWeight: 700}}>{preset.title}</Typography>
                                        <Typography variant="caption"
                                                    color="text.secondary">{preset.description}</Typography>
                                    </Box>
                                    <ChevronRight
                                        sx={{color: index === selectedPresetIndex ? 'primary.main' : 'text.disabled'}}/>
                                </Stack>
                            </Paper>
                        ))}
                    </Stack>
                )}

                {step === 'name-input' && (
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
                                </Typography>
                            </Paper>
                        </Box>
                    </Stack>
                )}

                {step === 'template-create' && (
                    <Box sx={{mt: 1}}>
                        <TemplateCreate
                            rootPath={rootPath}
                            onClose={closeDialog}
                            onBack={() => setStep('preset-selection')}
                        />
                    </Box>
                )}
            </DialogContent>

            <Divider/>


            <DialogActions sx={{p: 2.5}}>
                <Button
                    variant="outlined"
                    color="inherit"
                    onClick={step === 'name-input' || step === 'template-create' && !copyMode ?
                        () => setStep('preset-selection') :
                        closeDialog
                    }
                    startIcon={step === 'name-input' || step === 'template-create' && !copyMode ?
                        <ArrowBack/> :
                        <Cancel/>}
                >
                    {step === 'name-input' || step === 'template-create' && !copyMode ? 'Back' : 'Cancel'}
                </Button>
                <Box sx={{flex: 1}}/>

                {step !== 'template-create' && (
                    <Button
                        variant="contained"
                        disabled={!name.trim()}
                        onClick={handleConfirm}
                        sx={{px: 4, fontWeight: 700}}
                    >
                        {copyMode ? 'Duplicate' : 'Create'}
                    </Button>
                )}
            </DialogActions>
        </Dialog>
    );
}

const TemplateCreate = ({rootPath, onClose}: {
    rootPath: string;
    onClose: () => void;
    onBack: () => void;
}) => {
    const {listFiles} = useFiles()

    const {showError} = useSnackbar()
    const fileService = useHostClient(FileService);
    const [selectedTmpl, setSelectedTmpl] = useState<Template | null>(null);
    const [formVars, setFormVars] = useState<{ [key: string]: string }>({});
    const [isSubmitting, setIsSubmitting] = useState(false);

    const runner = useRPCRunner(() => fileService.getTmpls({
        alias: rootPath,
    }));

    useEffect(() => {
        runner.runner().then();
    }, [rootPath]);

    const handleSelectTemplate = (tmpl: Template) => {
        setSelectedTmpl(tmpl);
        setFormVars({...tmpl.vars});
    };

    const handleConfirm = async () => {
        if (!selectedTmpl) return;
        setIsSubmitting(true);

        const {err} = await callRPC(() => fileService.writeTmpl({
            dir: rootPath,
            tmpl: {
                Name: selectedTmpl.Name,
                vars: formVars
            }
        }));
        if (err) showError(err);

        setIsSubmitting(false);
        onClose()
        await listFiles("", [])
    };

    if (runner.loading) {
        return (
            <Stack alignItems="center" justifyContent="center" sx={{py: 10, gap: 2}}>
                <CircularProgress size={40} thickness={5}/>
                <Typography variant="body2" sx={{fontWeight: 700, color: 'text.secondary'}}>
                    Scanning for local templates...
                </Typography>
            </Stack>
        );
    }

    if (runner.err) {
        return (
            <Box sx={{py: 4}}>
                <Alert severity="error" variant="outlined" sx={{borderRadius: 2}}>
                    {runner.err}
                    <Button size="small" color="inherit" sx={{ml: 2, fontWeight: 700}} onClick={() => runner.runner()}>
                        Retry
                    </Button>
                </Alert>
            </Box>
        );
    }

    if (!runner.val?.templs || runner.val.templs.length === 0) {
        return (
            <Paper
                variant="outlined"
                sx={{
                    p: 4, textAlign: 'center', borderRadius: 3, borderStyle: 'dashed',
                    display: 'flex', flexDirection: 'column', alignItems: 'center'
                }}
            >
                <Box sx={{
                    p: 2,
                    borderRadius: '50%',
                    bgcolor: 'background.paper',
                    border: '1px solid',
                    borderColor: 'divider',
                    mb: 2
                }}>
                    <SettingsSuggestOutlined sx={{fontSize: 32, color: 'text.disabled'}}/>
                </Box>
                <Typography variant="subtitle1" sx={{fontWeight: 800}}>No Templates Found</Typography>
                <Typography variant="body2" color="text.secondary" sx={{mb: 3, maxWidth: 350}}>
                    To use this feature, create a <code style={{color: amber[900]}}>templates </code>
                    dir in your root and add some <code>.tmpl</code> template files.
                </Typography>
                <Button
                    component={Link}
                    href="https://dockman.radn.dev/docs/templates"
                    target="_blank"
                    endIcon={<HelpOutline fontSize="small"/>}
                >
                    View Documentation
                </Button>
            </Paper>
        );
    }

    if (selectedTmpl) {
        return (
            <Stack spacing={3}>
                <Paper variant="outlined" sx={{p: 3, borderRadius: 2,}}>
                    <Typography variant="overline"
                                sx={{color: 'text.secondary', fontWeight: 800, mb: 2, display: 'block'}}>
                        Template Variables
                    </Typography>
                    <Grid container spacing={2}>
                        {Object.keys(selectedTmpl.vars).map((key) => (
                            <Grid size={{xs: 12}} key={key}>
                                <TextField
                                    fullWidth
                                    size="small"
                                    label={key}
                                    value={formVars[key]}
                                    onChange={(e) => setFormVars({...formVars, [key]: e.target.value})}
                                    sx={{bgcolor: 'background.paper'}}
                                    slotProps={{
                                        input: {
                                            sx: {fontFamily: 'monospace', fontSize: '0.85rem'}
                                        }
                                    }}
                                />
                            </Grid>
                        ))}
                    </Grid>
                </Paper>

                <Stack direction="row" spacing={2} justifyContent="space-between" sx={{mt: 2}}>
                    <Button color="inherit" onClick={() => setSelectedTmpl(null)} sx={{fontWeight: 700}}>
                        template select
                    </Button>
                    <Button
                        variant="contained"
                        onClick={handleConfirm}
                        disabled={isSubmitting}
                        startIcon={isSubmitting ? <CircularProgress size={16} color="inherit"/> : <CheckCircleOutline/>}
                        sx={{borderRadius: 2, px: 4, fontWeight: 700}}
                    >
                        Create from Template
                    </Button>
                </Stack>
            </Stack>
        );
    }

    return (
        <Stack spacing={2}>
            <Typography variant="overline" sx={{px: 1, fontWeight: 800, color: 'text.secondary'}}>
                Available Templates
            </Typography>
            <Box sx={{maxHeight: '400px', overflowY: 'auto', ...scrollbarStyles, px: 0.5}}>
                <Stack spacing={1.5}>
                    {runner.val.templs.map((tmpl, idx) => (
                        <Paper
                            key={idx}
                            variant="outlined"
                            onClick={() => handleSelectTemplate(tmpl)}
                            sx={{
                                p: 2, cursor: 'pointer', transition: 'all 0.2s',
                                borderLeft: '4px solid transparent',
                                '&:hover': {
                                    borderColor: 'primary.main',
                                    bgcolor: 'primary.lighter',
                                    transform: 'translateX(4px)'
                                }
                            }}
                        >
                            <Stack direction="row" alignItems="center" spacing={2}>
                                <Box sx={{
                                    p: 1,
                                    bgcolor: 'background.paper',
                                    borderRadius: 1.5,
                                    border: '1px solid',
                                    borderColor: 'divider',
                                    display: 'flex'
                                }}>
                                    <DescriptionOutlined color="primary"/>
                                </Box>
                                <Box sx={{flex: 1}}>
                                    <Typography variant="subtitle2" sx={{fontWeight: 800}}>{tmpl.Name}</Typography>
                                    <Typography variant="caption" color="text.secondary">
                                        {Object.keys(tmpl.vars).length} variables required
                                    </Typography>
                                </Box>
                                <ChevronRight sx={{color: 'divider'}}/>
                            </Stack>
                        </Paper>
                    ))}
                </Stack>
            </Box>
        </Stack>
    );
};


export default FileCreate;
