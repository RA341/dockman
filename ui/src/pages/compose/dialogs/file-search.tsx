import React, {useEffect, useRef, useState} from 'react'
import {
    Box,
    Dialog,
    DialogContent,
    InputAdornment,
    List,
    ListItemButton,
    Stack,
    TextField,
    Typography,
} from '@mui/material'
import {InsertDriveFileOutlined, Search, SubdirectoryArrowRight} from '@mui/icons-material'
import {useNavigate} from 'react-router-dom'
import {create} from "zustand";
import {useFileComponents} from "../state/terminal.tsx";
import {getWSUrl} from "../../../lib/api.ts";
import {useEditorUrl} from "../../../lib/editor.ts";
import scrollbarStyles from "../../../components/scrollbar-style.tsx";

/**
 * Optimized Highlighting: Groups characters to minimize DOM nodes
 */
const HighlightedText = ({text, indices}: { text: string; indices: number[] }) => {
    if (!indices || indices.length === 0) return <>{text}</>
    const indexSet = new Set(indices)

    return (
        <Typography variant="body2" sx={{fontFamily: 'monospace', letterSpacing: '0.02em'}}>
            {text.split('').map((char, i) => (
                <Box
                    component="span"
                    key={i}
                    sx={{
                        fontWeight: indexSet.has(i) ? 800 : 400,
                        color: indexSet.has(i) ? 'primary.main' : 'inherit',
                        bgcolor: indexSet.has(i) ? 'primary.lighter' : 'transparent',
                        borderRadius: '2px',
                    }}
                >
                    {char}
                </Box>
            ))}
        </Typography>
    )
}

export const useFileSearch = create<{
    isOpen: boolean;
    open: () => void;
    close: () => void;
}>(setState => ({
    isOpen: false,
    open: () => setState({isOpen: true}),
    close: () => setState({isOpen: false})
}))

function FileSearch() {
    const navigate = useNavigate()
    const {alias: activeAlias, host} = useFileComponents()
    const isOpen = useFileSearch(state => state.isOpen)
    const close = useFileSearch(state => state.close)

    const [searchQuery, setSearchQuery] = useState('')
    const [filteredFiles, setFilteredFiles] = useState<SearchResult[]>([])
    const [error, setError] = useState<string | null>(null)
    const [activeIndex, setActiveIndex] = useState<number>(-1)

    const debouncedSearchQuery = useDebounce(searchQuery, 200)
    const ws = useRef<WebSocket | null>(null)
    const listRef = useRef<HTMLUListElement>(null)

    useEffect(() => {
        if (!isOpen) return

        let socket: WebSocket | null = null;
        try {
            socket = new WebSocket(getWSUrl(`api/file/search/${host}/${activeAlias}`))
            socket.onopen = () => {
                setError(null)
                if (debouncedSearchQuery) socket?.send(debouncedSearchQuery)
            }
            socket.onmessage = (e) => {
                const data = JSON.parse(e.data)
                setFilteredFiles(data.results || [])
            }
            socket.onerror = () => setError("Search service unavailable")
            ws.current = socket
        } catch (e) {
            setError("Connection failed")
        }

        return () => {
            socket?.close()
            ws.current = null
        }
    }, [isOpen, activeAlias, host])

    useEffect(() => {
        if (ws.current?.readyState === WebSocket.OPEN) {
            ws.current.send(debouncedSearchQuery)
        }
        setActiveIndex(0)
    }, [debouncedSearchQuery])

    // Scroll active item into view
    useEffect(() => {
        const activeEl = listRef.current?.querySelector('.Mui-selected');
        if (activeEl) activeEl.scrollIntoView({block: 'nearest'});
    }, [activeIndex]);

    const editorUrl = useEditorUrl()
    const handleOpen = (file: string) => {
        navigate(editorUrl(`/${activeAlias}/${file}`))
        handleClose()
    }

    const handleClose = () => {
        setSearchQuery('')
        setActiveIndex(-1)
        close()
    }

    const handleKeyDown = (event: React.KeyboardEvent) => {
        if (event.key === 'ArrowDown') {
            event.preventDefault()
            setActiveIndex(p => (p < filteredFiles.length - 1 ? p + 1 : p))
        } else if (event.key === 'ArrowUp') {
            event.preventDefault()
            setActiveIndex(p => (p > 0 ? p - 1 : 0))
        } else if (event.key === 'Enter' && activeIndex >= 0) {
            event.preventDefault()
            handleOpen(filteredFiles[activeIndex].Value)
        }
    }

    return (
        <Dialog
            open={isOpen}
            onClose={handleClose}
            maxWidth="sm"
            fullWidth
            onKeyDown={handleKeyDown}
            slotProps={{
                paper: {
                    sx: {
                        borderRadius: 3,
                        height: '50vh',
                        width: '120vw',
                        display: 'flex',
                        flexDirection: 'column',
                        backgroundImage: 'none',
                        border: '1px solid',
                        borderColor: 'divider',
                        boxShadow: '0 24px 48px -12px rgba(0,0,0,0.25)'
                    }
                }
            }}
        >
            {/* Search Header */}
            <Box sx={{p: 2, borderBottom: '1px solid', borderColor: 'divider',}}>
                <TextField
                    fullWidth
                    autoFocus
                    variant="standard"
                    placeholder="Search files by name..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    slotProps={{
                        input: {
                            disableUnderline: true,
                            startAdornment: (
                                <InputAdornment position="start">
                                    <Search color="primary"/>
                                </InputAdornment>
                            ),
                            sx: {fontSize: '1.1rem', fontWeight: 500}
                        }

                    }}
                />
            </Box>

            {/* Results List */}
            <DialogContent sx={{p: 0, ...scrollbarStyles}}>
                <List disablePadding ref={listRef}>
                    {error ? (
                        <Box sx={{p: 4, textAlign: 'center'}}>
                            <Typography color="error" variant="body2">{error}</Typography>
                        </Box>
                    ) : filteredFiles.length > 0 ? (
                        filteredFiles.map((result, index) => (
                            <ListItemButton
                                key={index}
                                selected={index === activeIndex}
                                onClick={() => handleOpen(result.Value)}
                                sx={{
                                    py: 1.5,
                                    px: 2,
                                    borderBottom: '1px solid',
                                    borderColor: 'divider',
                                    '&.Mui-selected': {
                                        bgcolor: 'primary.lighter',
                                        borderLeft: '4px solid',
                                        borderColor: 'primary.main'
                                    },
                                    '&:hover': {bgcolor: 'action.hover'},
                                }}
                            >
                                <Stack direction="row" spacing={2} alignItems="center" sx={{width: '100%'}}>
                                    <InsertDriveFileOutlined sx={{fontSize: 18, color: 'text.disabled'}}/>
                                    <Box sx={{flexGrow: 1, minWidth: 0}}>
                                        <HighlightedText text={result.Value} indices={result.Indexes}/>
                                    </Box>
                                    {index === activeIndex && (
                                        <SubdirectoryArrowRight
                                            sx={{fontSize: 16, color: 'primary.main', opacity: 0.7}}/>
                                    )}
                                </Stack>
                            </ListItemButton>
                        ))
                    ) : (
                        <Box sx={{p: 6, textAlign: 'center'}}>
                            <Typography variant="body2" color="text.disabled">
                                {searchQuery ? "No matching files found" : "Start typing to find files..."}
                            </Typography>
                        </Box>
                    )}
                </List>
            </DialogContent>

            {/* Footer / Shortcuts */}
            <Box sx={{
                p: 1.5,
                borderTop: '1px solid',
                borderColor: 'divider',
                display: 'flex',
                gap: 2
            }}>
                <ShortcutHint label="Navigate" keys={["↑", "↓"]}/>
                <ShortcutHint label="Open" keys={["↵"]}/>
                <ShortcutHint label="Close" keys={["esc"]}/>
            </Box>
        </Dialog>
    )
}

function ShortcutHint({label, keys}: { label: string, keys: string[] }) {
    return (
        <Stack direction="row" spacing={0.5} alignItems="center">
            <Typography variant="caption" color="text.disabled">{label}</Typography>
            {keys.map(k => (
                <Typography key={k} variant="caption" sx={{
                    bgcolor: 'background.paper',
                    px: 0.6,
                    borderRadius: 1,
                    border: '1px solid',
                    borderColor: 'divider',
                    fontWeight: 700,
                    fontSize: '0.65rem'
                }}>
                    {k}
                </Typography>
            ))}
        </Stack>
    )
}

function useDebounce<T>(value: T, delay: number): T {
    const [debouncedValue, setDebouncedValue] = useState(value);
    useEffect(() => {
        const handler = setTimeout(() => setDebouncedValue(value), delay);
        return () => clearTimeout(handler);
    }, [value, delay]);
    return debouncedValue;
}

interface SearchResult {
    Value: string
    Indexes: number[]
}

export default FileSearch;
