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
    Typography
} from '@mui/material'
import {Search} from '@mui/icons-material'
import {useNavigate} from "react-router-dom";
import {useFiles} from "../../../../hooks/files.ts";

interface TelescopeProps {
    isVisible: boolean
    onDismiss: () => void
}

const highlightMatch = (text: string, query: string) => {
    if (!query) {
        return text
    }
    const escapedQuery = query.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')
    const parts = text.split(new RegExp(`(${escapedQuery})`, 'gi'))

    return (
        <span>
            {parts.map((part, index) =>
                part.toLowerCase() === query.toLowerCase() ? (
                    <Box component="span" key={index} sx={{fontWeight: 'bold', color: '#a78bfa'}}>
                        {part}
                    </Box>
                ) : (
                    part
                )
            )}
        </span>
    )
}

function SearchUi({isVisible, onDismiss}: TelescopeProps) {
    const {files} = useFiles()
    const navigate = useNavigate()

    const [searchList, setSearchList] = useState<string[]>([])
    const [searchQuery, setSearchQuery] = useState('')
    const [filteredFiles, setFilteredFiles] = useState<string[]>([])

    // State to track the active item index for keyboard navigation
    const [activeIndex, setActiveIndex] = useState<number>(-1)

    // Refs to hold list item elements for scrolling into view
    const itemRefs = useRef<(HTMLLIElement | null)[]>([])

    const handleOpen = (file: string) => {
        navigate(`/stacks/${file}`)
        handleClose()
    }

    useEffect(() => {
        const list = files.flatMap(value => {
            if (value.subFiles.length === 0) {
                return [value.filename]
            } else {
                return value.subFiles.map(subFile => `${value.filename}/${subFile}`)
            }
        })
        setSearchList(list)
        setFilteredFiles(list)
    }, [files])

    useEffect(() => {
        if (!searchQuery) {
            const fullList = files.flatMap(value => {
                if (value.subFiles.length === 0) return [value.filename]
                return value.subFiles.map(subFile => `${value.filename}/${subFile}`)
            })
            setFilteredFiles(fullList)
        } else {
            const lowercasedQuery = searchQuery.toLowerCase()
            const filtered = searchList.filter(file =>
                file.toLowerCase().includes(lowercasedQuery)
            )
            setFilteredFiles(filtered)
        }
        // Reset active index and refs whenever the search results change
        setActiveIndex(-1)
        itemRefs.current = []
    }, [searchQuery, searchList, files])

    // Effect to scroll the active item into view
    useEffect(() => {
        if (activeIndex >= 0 && itemRefs.current[activeIndex]) {
            itemRefs.current[activeIndex]?.scrollIntoView({
                block: 'nearest',
                behavior: 'smooth',
            })
        }
    }, [activeIndex])

    const handleClose = () => {
        setSearchQuery('')
        setActiveIndex(-1)
        onDismiss()
    }

    // Keyboard event handler for ArrowUp, ArrowDown, and Enter
    const handleKeyDown = (event: React.KeyboardEvent) => {
        if (filteredFiles.length === 0) return

        switch (event.key) {
            case 'ArrowDown':
                event.preventDefault()
                setActiveIndex(prev => (prev < filteredFiles.length - 1 ? prev + 1 : prev))
                break
            case 'ArrowUp':
                event.preventDefault()
                // Prevent index from going below 0
                setActiveIndex(prev => (prev > 0 ? prev - 1 : 0))
                break
            case 'Enter':
                event.preventDefault()
                if (activeIndex >= 0) {
                    const file = filteredFiles[activeIndex];
                    console.log('Selected:', file)
                    handleOpen(file)
                }
                break
            default:
                break
        }
    }

    return (
        <Dialog
            open={isVisible}
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
                    placeholder="Search files..."
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
                    {filteredFiles.length > 0 ? (
                        filteredFiles.map((file, index) => (
                            <ListItem
                                disablePadding
                                key={index}
                                ref={el => {
                                    itemRefs.current[index] = el
                                }}
                                sx={{
                                    borderBottom: '1px solid #334155',
                                    '&:last-child': {borderBottom: 'none'},
                                }}
                            >
                                <ListItemButton
                                    selected={index === activeIndex}
                                    onClick={() => handleOpen(file)}
                                    sx={{
                                        '&:hover': {backgroundColor: '#334155'},
                                        // Style for the keyboard-selected item
                                        '&.Mui-selected': {
                                            backgroundColor: '#334155',
                                            '&:hover': {
                                                backgroundColor: '#475569',
                                            },
                                        },
                                    }}
                                >
                                    <ListItemText primary={highlightMatch(file, searchQuery)}/>
                                </ListItemButton>
                            </ListItem>
                        ))
                    ) : (
                        <Box sx={{p: 4, textAlign: 'center'}}>
                            <Typography variant="body1" sx={{color: '#94a3b8'}}>
                                No results found for "{searchQuery}"
                            </Typography>
                        </Box>
                    )}
                </List>
            </DialogContent>
        </Dialog>
    )
}

export default SearchUi

