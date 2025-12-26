import React, {useEffect, useRef, useState} from "react"
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
} from "@mui/material"
import {Cancel, ChevronRight, DriveFileRenameOutline, EditOutlined} from "@mui/icons-material"
import {create} from "zustand";
import {useFiles} from "../../../context/file-context.tsx";
import {grey} from "@mui/material/colors";

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
    const {renameFile} = useFiles()

    const [name, setName] = useState('')
    const [error, setError] = useState('')

    const inputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        if (filename) {
            setName(filename)
            setError('')
            // Small timeout to ensure the dialog is mounted before focusing
            setTimeout(() => inputRef.current?.focus(), 100)
        }
    }, [filename])

    const handleConfirm = () => {
        const newFilename = name.trim()
        if (!newFilename || newFilename === filename) return

        renameFile(filename, newFilename).then()
        close()
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault()
            handleConfirm()
        }
        if (e.key === 'Escape') close()
    }

    // Disable button if name is empty, has error, or is identical to the old name
    const isRenameDisabled = !name.trim() || !!error || name.trim() === filename

    return (
        <Dialog
            open={!!filename}
            onClose={close}
            fullWidth
            maxWidth="sm"
            onKeyDown={handleKeyDown}
            slotProps={{
                paper: {
                    sx: {borderRadius: 3, backgroundImage: 'none'}
                }
            }}
        >
            <DialogTitle sx={{p: 3, pb: 2}}>
                <Stack direction="row" alignItems="center" spacing={1.5}>
                    <Box sx={{
                        p: 1,
                        borderRadius: 1.5,
                        bgcolor: 'primary.lighter',
                        color: 'primary.main',
                        display: 'flex'
                    }}>
                        <DriveFileRenameOutline fontSize="small"/>
                    </Box>
                    <Box>
                        <Typography variant="h6" sx={{fontWeight: 800, lineHeight: 1.2}}>
                            Rename Item
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                            Original: <code style={{color: grey[700]}}>{filename}</code>
                        </Typography>
                    </Box>
                </Stack>
            </DialogTitle>

            <DialogContent sx={{p: 3, pt: 1}}>
                <Stack spacing={3} sx={{mt: 1}}>
                    <Box>
                        <Typography variant="overline" sx={{color: 'text.secondary', fontWeight: 700}}>
                            New Name
                        </Typography>
                        <TextField
                            inputRef={inputRef}
                            fullWidth
                            variant="outlined"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            error={!!error}
                            helperText={error}
                            sx={{mt: 0.5}}
                            slotProps={{
                                input: {
                                    startAdornment: (
                                        <InputAdornment position="start">
                                            <EditOutlined fontSize="small" color="action"/>
                                        </InputAdornment>
                                    ),
                                }
                            }}
                        />
                    </Box>

                    {name.trim() && name.trim() !== filename && (
                        <Box>
                            <Typography variant="overline" sx={{color: 'text.secondary', fontWeight: 700}}>
                                Change Preview
                            </Typography>
                            <Paper
                                variant="outlined"
                                sx={{
                                    p: 2,
                                    mt: 0.5,
                                    borderStyle: 'dashed',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: 1.5
                                }}
                            >
                                <Typography variant="caption" sx={{
                                    fontFamily: 'monospace',
                                    color: 'text.disabled',
                                    textDecoration: 'line-through'
                                }}>
                                    {filename}
                                </Typography>
                                <ChevronRight sx={{color: 'text.disabled', fontSize: 16}}/>
                                <Typography variant="subtitle2"
                                            sx={{fontFamily: 'monospace', fontWeight: 700, color: 'primary.main'}}>
                                    {name}
                                </Typography>
                            </Paper>
                        </Box>
                    )}
                </Stack>
            </DialogContent>

            <Divider/>

            <DialogActions sx={{p: 2.5}}>
                <Button
                    variant="outlined"
                    color="inherit"
                    onClick={close}
                    startIcon={<Cancel/>}
                    sx={{borderRadius: 2, textTransform: 'none', fontWeight: 700}}
                >
                    Cancel
                </Button>

                <Box sx={{flex: 1}}/>

                <Button
                    variant="contained"
                    disabled={isRenameDisabled}
                    onClick={handleConfirm}
                    startIcon={<DriveFileRenameOutline/>}
                    sx={{
                        borderRadius: 2,
                        px: 4,
                        textTransform: 'none',
                        fontWeight: 700,
                        boxShadow: 'none',
                        '&:hover': {boxShadow: 'none'}
                    }}
                >
                    Rename
                </Button>
            </DialogActions>
        </Dialog>
    )
}

export default FileRename