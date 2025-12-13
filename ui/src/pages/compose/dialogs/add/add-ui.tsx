import React, {useEffect, useRef, useState} from "react"
import {
    Alert,
    Box,
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Paper,
    TextField,
    Typography
} from "@mui/material"
import {Add, AddCircleOutline, ArrowBack, Cancel, ErrorOutline, Folder, InsertDriveFile} from "@mui/icons-material"
import {DockerFolderIcon} from "../../components/file-bar-icon.tsx";
import {amber} from "@mui/material/colors";

interface AddFileDialogProps {
    open: boolean
    onClose: () => void
    onConfirm: (name: string, isDir: boolean) => void
    parentName: string
}

type PresetType = 'file' | 'folder' | 'compose-directory'
type CreationStep = 'preset-selection' | 'name-input'

interface FilePreset {
    type: PresetType
    title: string
    description: string
    icon: React.ReactNode
    extensions?: string[]
}

const FILE_PRESETS: FilePreset[] = [
    {
        type: 'file',
        title: 'File',
        description: 'Create files: somefile.txt, docs/readme.md, directories are created automatically',
        icon: <InsertDriveFile color="primary" sx={{fontSize: '2rem'}}/>,
        extensions: []
    },
    {
        type: 'folder',
        title: 'Folder',
        description: 'Create folder: somefolder/nestedfolder, directories are created automatically',
        icon: <Folder sx={{fontSize: '2rem', color: amber[800]}}/>,
        extensions: []
    },
    {
        type: 'compose-directory',
        title: 'Compose Directory',
        description: 'Create directory with compose file: router/router-compose.yaml',
        icon: <DockerFolderIcon/>
    }
]

export function FileDialogCreate({open, onClose, onConfirm, parentName}: AddFileDialogProps) {
    const [step, setStep] = useState<CreationStep>('preset-selection')
    const [selectedPreset, setSelectedPreset] = useState<PresetType>('file')
    const [presetIndex, setPresetIndex] = useState(0)
    const [name, setName] = useState('')
    const [error, setError] = useState('')

    const inputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        if (open) {
            setStep('preset-selection')
            setSelectedPreset('file')
            setPresetIndex(0)

            setName('')
            setError('')
        }
    }, [open, parentName])

    // Focus input when moving to name input step
    useEffect(() => {
        if (step === 'name-input' && inputRef.current) {
            setTimeout(() => inputRef.current?.focus(), 100)
        }
    }, [step])

    const handlePresetSelection = (preset: PresetType) => {
        setSelectedPreset(preset)
        setStep('name-input')
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (step === 'preset-selection') {
            switch (e.key) {
                case 'ArrowUp': {
                    e.preventDefault()
                    const newUpIndex = presetIndex > 0 ? presetIndex - 1 : FILE_PRESETS.length - 1
                    setPresetIndex(newUpIndex)
                    setSelectedPreset(FILE_PRESETS[newUpIndex].type)
                    break
                }
                case 'ArrowDown': {
                    e.preventDefault()
                    const newDownIndex = presetIndex < FILE_PRESETS.length - 1 ? presetIndex + 1 : 0
                    setPresetIndex(newDownIndex)
                    setSelectedPreset(FILE_PRESETS[newDownIndex].type)
                    break
                }
                case 'Enter':
                    e.preventDefault()
                    handlePresetSelection(selectedPreset)
                    break
                case 'Escape':
                    onClose()
                    break
            }
        } else if (step === 'name-input') {
            // Check for Alt+B shortcut to go back to preset selection (only if no parent)
            if (e.altKey && e.key.toLowerCase() === 'b' && !parentName) {
                e.preventDefault()
                setStep('preset-selection')
                setName('')
                setError('')
                return
            }
            switch (e.key) {
                case 'Enter':
                    e.preventDefault()
                    handleConfirm()
                    break
            }
        }
    }

    const handleConfirm = () => {
        let finalName = name.trim()
        if (!finalName) return

        if (selectedPreset === 'compose-directory') {
            finalName = `${finalName}/${finalName}-compose.yaml`
        }

        if (parentName) {
            finalName = `${parentName}/${finalName}`
        }

        onConfirm(finalName, selectedPreset === 'folder')
        onClose()
    }

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value
        setName(value)
    }

    const getDialogTitle = () => {
        if (step === 'preset-selection') {
            return parentName ? `Add to "${parentName}"` : "Create New"
        }

        const preset = FILE_PRESETS.find(p => p.type === selectedPreset)
        const baseTitle = preset ? `Create ${preset.title}` : "Create"
        return parentName ? `${baseTitle} in "${parentName}"` : baseTitle
    }

    const getHelperText = () => {
        if (selectedPreset === 'file') {
            return "Examples: file.js, config.yaml, docs/readme.md."
        } else if (selectedPreset === 'compose-directory') {
            return "Enter name (e.g., 'router'). Will create: router/router-compose.yaml"
        }
        return ""
    }

    const getPreviewText = () => {
        if (!name.trim()) return ""

        switch (selectedPreset) {
            case 'compose-directory':
                return `${name}/${name}-compose.yaml`
            default:
                return `${parentName}/${name}`
        }
    }

    const isCreateDisabled = () => {
        return !name.trim() || !!error
    }

    return (
        <Dialog
            open={open}
            onClose={onClose}
            fullWidth
            maxWidth="md"
            onKeyDown={handleKeyDown}
            slotProps={{
                paper: {
                    sx: {minHeight: '500px'}
                }
            }}
        >
            <DialogTitle sx={{display: 'flex', alignItems: 'center', gap: 1, pb: 1}}>
                <AddCircleOutline color="primary" sx={{fontSize: '1.5rem'}}/>
                <Typography variant="h6">{getDialogTitle()}</Typography>
            </DialogTitle>

            <DialogContent dividers sx={{pt: 3, pb: 3, minHeight: '350px'}}>
                {step === 'preset-selection' ? (
                    <Box>
                        <Typography variant="body1" color="text.secondary" sx={{mb: 3}}>
                            Choose what you want to create (use ↑↓ arrows, Enter to select):
                        </Typography>

                        <Box sx={{display: 'flex', gap: 2, flexDirection: 'column'}}>
                            {FILE_PRESETS.map((preset, index) => (
                                <Paper
                                    key={preset.type}
                                    elevation={index === presetIndex ? 3 : 1}
                                    sx={{
                                        p: 3,
                                        cursor: 'pointer',
                                        border: 2,
                                        borderColor: index === presetIndex ? 'primary.main' : 'transparent',
                                        transition: 'all 0.2s',
                                        '&:hover': {
                                            elevation: 2,
                                            borderColor: 'primary.light'
                                        }
                                    }}
                                    onClick={() => {
                                        setPresetIndex(index)
                                        setSelectedPreset(preset.type)
                                        handlePresetSelection(preset.type)
                                    }}
                                >
                                    <Box sx={{display: 'flex', alignItems: 'center', gap: 2}}>
                                        {preset.icon}
                                        <Box sx={{flex: 1}}>
                                            <Typography variant="h6" sx={{mb: 0.5}}>
                                                {preset.title}
                                            </Typography>
                                            <Typography variant="body2" color="text.secondary">
                                                {preset.description}
                                            </Typography>
                                        </Box>
                                    </Box>
                                </Paper>
                            ))}
                        </Box>
                    </Box>
                ) : (
                    <Box>
                        <Box sx={{position: 'relative', mb: 3}}>
                            <TextField
                                ref={inputRef}
                                autoFocus
                                fullWidth
                                label="Name"
                                variant="outlined"
                                value={name}
                                onChange={handleChange}
                                error={!!error}
                                helperText={error || getHelperText()}
                                size="medium"
                                sx={{
                                    '& .MuiInputBase-root': {
                                        fontSize: '1.1rem'
                                    }
                                }}
                            />
                        </Box>

                        {/* Preview Section */}
                        {getPreviewText() && (
                            <Alert
                                severity="info"
                                icon={<InsertDriveFile/>}
                                sx={{
                                    mb: 2,
                                    '& .MuiAlert-message': {
                                        width: '100%'
                                    }
                                }}
                            >
                                <Typography variant="subtitle2" sx={{mb: 0.5}}>
                                    Will create:
                                </Typography>
                                <Typography
                                    variant="h6"
                                    sx={{
                                        fontFamily: 'monospace',
                                        fontWeight: 'bold',
                                        color: 'primary.main'
                                    }}
                                >
                                    {getPreviewText()}
                                </Typography>
                            </Alert>
                        )}

                        {error && (
                            <Alert severity="error" icon={<ErrorOutline/>} sx={{mb: 2}}>
                                {error}
                            </Alert>
                        )}
                    </Box>
                )}
            </DialogContent>

            <DialogActions sx={{px: 3, py: 2.5, gap: 2}}>
                <Button
                    onClick={step === 'name-input' && !parentName ? () => {
                        setStep('preset-selection');
                        setName('');
                        setError('');
                    } : onClose}
                    startIcon={step === 'name-input' && !parentName ? <ArrowBack/> : <Cancel/>}
                    size="large"
                >
                    {step === 'name-input' && !parentName ? 'Back' : 'Cancel'}
                </Button>

                {step === 'name-input' && (
                    <Button
                        onClick={handleConfirm}
                        variant="contained"
                        disabled={isCreateDisabled()}
                        startIcon={<Add/>}
                        size="large"
                        sx={{minWidth: '120px'}}
                    >
                        Create
                    </Button>
                )}
            </DialogActions>
        </Dialog>
    )
}
