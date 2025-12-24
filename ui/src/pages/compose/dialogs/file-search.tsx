import React, {useEffect, useRef, useState} from 'react'
import {
    Box,
    Dialog,
    DialogContent,
    InputAdornment,
    List,
    ListItem,
    ListItemButton,
    ListItemText,
    TextField,
    Typography,
} from '@mui/material'
import {Search} from '@mui/icons-material'
import {useNavigate} from 'react-router-dom'
import {create} from "zustand";
import {useFileComponents} from "../state/terminal.tsx";
import {getWSUrl} from "../../../lib/api.ts";
import {useEditorUrl} from "../../../lib/editor.ts";

function useDebounce<T>(value: T, delay: number): T {
    const [debouncedValue, setDebouncedValue] = useState(value);
    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedValue(value);
        }, delay);
        return () => {
            clearTimeout(handler);
        };
    }, [value, delay]);
    return debouncedValue;
}

interface SearchResult {
    Value: string
    Indexes: number[]
}

const HighlightedText = ({text, indices}: { text: string; indices: number[] }) => {
    if (!indices || indices.length === 0) return <>{text}</>
    const indexSet = new Set(indices)
    return (
        <span>
            {text.split('').map((char, i) => (
                <span key={i} style={{
                    fontWeight: indexSet.has(i) ? 'bold' : 'normal',
                    color: indexSet.has(i) ? '#818cf8' : 'inherit'
                }}>
                    {char}
                </span>
            ))}
        </span>
    )
}


export const useFileSearch = create<{
    isOpen: boolean;
    open: () => void;
    close: () => void;
}>(
    setState => ({
        isOpen: false,
        open: () => {
            setState({
                isOpen: true
            })
        },
        close: () => {
            setState({
                isOpen: false
            })
        }
    })
)

function FileSearch() {
    const navigate = useNavigate()
    const {alias: activeAlias} = useFileComponents()
    
    const isOpen = useFileSearch(state => state.isOpen)
    const close = useFileSearch(state => state.close)

    const [filteredFiles, setFilteredFiles] = useState<SearchResult[]>([])
    const [error, setError] = useState<string | null>(null)

    const [searchQuery, setSearchQuery] = useState('')

    const debouncedSearchQuery = useDebounce(searchQuery, 300)

    const ws = useRef<WebSocket | null>(null)
    const [activeIndex, setActiveIndex] = useState<number>(-1)
    const itemRefs = useRef<(HTMLLIElement | null)[]>([])

    const {alias, host} = useFileComponents()

    useEffect(() => {
        if (!isOpen) return

        let socket: WebSocket | null = null;
        try {
            socket = new WebSocket(getWSUrl(`api/file/search/${host}/${alias}`))
        } catch (e: unknown) {
            console.error(`unknown err ${e}`)
            setError("Invalid WebSocket URL")
            return
        }

        socket.onopen = () => {
            setError(null)
            if (debouncedSearchQuery) socket.send(debouncedSearchQuery)
        }

        socket.onerror = (event) => {
            console.error("WebSocket connection error:", event)
            setError("Connection to search server failed")
        }

        socket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data)
                if (data.error) {
                    setError(data.error)
                } else {
                    setFilteredFiles((data.results as SearchResult[]) || [])
                }

            } catch (e) {
                console.error("Failed to parse search results", e)
            }
        }

        ws.current = socket

        return () => {
            if (socket && socket.readyState === WebSocket.OPEN) {
                socket.close()
            }
            ws.current = null
        }
    }, [isOpen, activeAlias])

    useEffect(() => {
        if (ws.current && ws.current.readyState === WebSocket.OPEN) {
            ws.current.send(debouncedSearchQuery)
        }

        setActiveIndex(-1)
        itemRefs.current = []
    }, [debouncedSearchQuery])

    const editorUrl = useEditorUrl()

    const handleOpen = (file: string) => {
        navigate(editorUrl(`/${alias}/${file}`))
        handleClose()
    }

    const handleClose = () => {
        setSearchQuery('') // Clear input
        setActiveIndex(-1)
        close()
    }

    const handleKeyDown = (event: React.KeyboardEvent) => {
        if (filteredFiles.length === 0) return

        switch (event.key) {
            case 'ArrowDown':
                event.preventDefault()
                setActiveIndex((prev) => (prev < filteredFiles.length - 1 ? prev + 1 : prev))
                break
            case 'ArrowUp':
                event.preventDefault()
                setActiveIndex((prev) => (prev > 0 ? prev - 1 : 0))
                break
            case 'Enter':
                event.preventDefault()
                if (activeIndex >= 0) {
                    handleOpen(filteredFiles[activeIndex].Value)
                }
                break
        }
    }

    return (
        <Dialog
            open={isOpen}
            onClose={handleClose}
            maxWidth="md"
            fullWidth
            scroll="paper"
            aria-labelledby="search-dialog-title"
            slotProps={{
                paper: {
                    sx: {
                        backgroundColor: '#1e293b',
                        border: '1px solid #334155',
                        borderRadius: 3,
                        boxShadow: '0 10px 25px rgba(0, 0, 0, 0.3)',
                        color: '#f1f5f9',
                        height: '70vh',
                        display: 'flex',
                        flexDirection: 'column',
                    }
                }
            }}
        >
            <Box sx={{p: 2, borderBottom: '1px solid #334155'}}>
                <TextField
                    fullWidth
                    variant="outlined"
                    placeholder="FileSearch files..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    autoFocus
                    onKeyDown={handleKeyDown}
                    slotProps={{
                        input: {
                            startAdornment: (
                                <InputAdornment position="start">
                                    <Search sx={{color: '#94a3b8'}}/>
                                </InputAdornment>
                            ),
                        }
                    }}
                    sx={{
                        '& .MuiOutlinedInput-root': {
                            color: '#f1f5f9',
                            backgroundColor: '#0f172a',
                            borderRadius: 2,
                            '& .MuiOutlinedInput-notchedOutline': {
                                borderColor: '#334155',
                            },
                            '&:hover .MuiOutlinedInput-notchedOutline': {
                                borderColor: '#475569',
                            },
                            '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                                borderColor: '#818cf8',
                            },
                        },
                    }}
                />
            </Box>

            <DialogContent
                sx={{p: 0, '&::-webkit-scrollbar': {display: 'none'}, msOverflowStyle: 'none', scrollbarWidth: 'none'}}>
                <List disablePadding>
                    {error ? (
                        <Box sx={{p: 4, textAlign: 'center'}}>
                            <Typography color="error">{error}</Typography>
                        </Box>
                    ) : filteredFiles.length > 0 ? (
                        filteredFiles.map((result, index) => (
                            <ListItem disablePadding key={`${result.Value}-${index}`} ref={(el) => {
                                itemRefs.current[index] = el
                            }}>
                                <ListItemButton
                                    selected={index === activeIndex}
                                    onClick={() => handleOpen(result.Value)}
                                    sx={{
                                        '&.Mui-selected': {backgroundColor: '#334155'},
                                        '&:hover': {backgroundColor: '#334155'},
                                    }}
                                >
                                    <ListItemText
                                        primary={
                                            <HighlightedText
                                                text={result.Value}
                                                indices={result.Indexes}
                                            />
                                        }
                                    />
                                </ListItemButton>
                            </ListItem>
                        ))
                    ) : (
                        <Box sx={{p: 4, textAlign: 'center'}}>
                            <Typography variant="body1" sx={{color: '#94a3b8'}}>
                                {debouncedSearchQuery ? `No results for "${debouncedSearchQuery}"` : "Type to search..."}
                            </Typography>
                        </Box>
                    )}
                </List>
            </DialogContent>
        </Dialog>
    )
}

export default FileSearch

