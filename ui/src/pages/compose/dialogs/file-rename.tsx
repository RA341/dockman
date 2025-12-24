import React, {useEffect, useRef, useState} from "react"
import {
    Alert,
    Box,
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    TextField,
    Typography
} from "@mui/material"
import {Cancel, DriveFileRenameOutline, DriveFileRenameOutlineRounded, ErrorOutline} from "@mui/icons-material"
import {create} from "zustand";
import {useFiles} from "../../../context/file-context.tsx";

export const useFileRename = create<{
    filename: string
    open: (filename: string) => void
    close: () => void
}>(setState => ({
    filename: "",
    open: (filename) => {
        setState({filename})
    },
    close: () => {
        setState({filename: ""})
    }
}))

function FileRename() {
    const filename = useFileRename(state => state.filename)
    const close = useFileRename(state => state.close)

    const [name, setName] = useState('')
    const [error, setError] = useState('')

    const inputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        if (filename) {
            setName(filename)
            setError('')
            inputRef.current?.focus()
        }
    }, [filename])

    const handleKeyDown = (e: React.KeyboardEvent) => {
        // Check for Alt+B shortcut to go back to preset selection (only if no parent)
        if (e.altKey && e.key.toLowerCase() === 'b' && !filename) {
            e.preventDefault()
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

    const {renameFile} = useFiles()

    const handleConfirm = () => {
        let newFilename = name.trim()
        if (!newFilename) return

        renameFile(filename, newFilename).then()
        close()
    }

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value
        setName(value)
    }

    const getPreviewText = () => {
        if (!name.trim()) return ""
        return `${name}`
    }

    const isCreateDisabled = () => {
        return !name.trim() || !!error
    }

    return (
        <Dialog
            open={!!filename}
            onClose={close}
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
                <DriveFileRenameOutline color="primary" sx={{fontSize: '1.5rem'}}/>
                <Typography variant="h6">{`Rename "${filename}"`}</Typography>
            </DialogTitle>

            <DialogContent dividers sx={{pt: 3, pb: 3, minHeight: '350px'}}>
                {(
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
                                helperText={error}
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
                                severity="warning"
                                icon={<DriveFileRenameOutlineRounded/>}
                                sx={{
                                    mb: 2,
                                    '& .MuiAlert-message': {
                                        width: '100%'
                                    }
                                }}
                            >
                                <Typography variant="subtitle2" sx={{mb: 0.5}}>
                                    Rename:
                                </Typography>

                                <Box sx={{display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap'}}>
                                    <Typography
                                        variant="h6"
                                        sx={{
                                            // textDecoration: 'line-through',
                                            fontFamily: 'monospace',
                                            fontWeight: 'bold',
                                            color: 'primary.warn'
                                        }}
                                    >
                                        {filename}
                                    </Typography>

                                    <Typography variant="h6" sx={{
                                        fontFamily: 'monospace',
                                        fontWeight: 'bold',
                                        color: 'primary.warn'
                                    }}>
                                        {"->"}
                                    </Typography>

                                    <Typography
                                        variant="h6"
                                        sx={{
                                            fontFamily: 'monospace',
                                            fontWeight: 'bold',
                                            color: 'primary.warn'
                                        }}
                                    >
                                        {getPreviewText()}
                                    </Typography>
                                </Box>
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
                    onClick={close}
                    startIcon={<Cancel/>}
                    size="large"
                >
                    {'Cancel'}
                </Button>

                {(
                    <Button
                        onClick={handleConfirm}
                        variant="contained"
                        disabled={isCreateDisabled()}
                        startIcon={<DriveFileRenameOutline/>}
                        size="large"
                        sx={{minWidth: '120px'}}
                    >
                        Rename
                    </Button>
                )}
            </DialogActions>
        </Dialog>
    )
}

export default FileRename