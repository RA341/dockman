import {useCallback, useEffect} from 'react'
import {Box, CircularProgress, Divider, IconButton, List, styled, Toolbar, Tooltip, Typography} from '@mui/material'
import {Add as AddIcon, Cached, Search as SearchIcon} from '@mui/icons-material'
import {ShortcutFormatter} from "./shortcut-formatter.tsx"
import {useFileComponents} from "../state/terminal.tsx";
import useResizeBar from "../hooks/resize-hook.ts";
import {FileItem} from "./file-item.tsx";
import {useFiles} from "../../../context/file-context.tsx"
import {useFileSearch} from "../dialogs/file-search.tsx";
import {useFileCreate} from "../dialogs/file-create.tsx";
import {useSideBarAction} from "../state/files.ts";
import {YamlIcon} from "./file-icon.tsx";
import {useNavigate} from "react-router-dom";
import {useEditorUrl} from "../../../lib/editor.ts";
import {formatDockyaml} from "./viewer-dockyml.tsx";

export function FileList() {
    const showSearch = useFileSearch(state => state.open)
    const fileCreate = useFileCreate(state => state.open)
    const nav = useNavigate()

    const isSidebarCollapsed = useSideBarAction(state => state.isSidebarOpen)

    const {listFiles} = useFiles()
    const {host, alias} = useFileComponents()

    const showFileAdd = useCallback(() => {
        fileCreate(`${alias}`)
    }, [alias]);

    const editUrl = useEditorUrl()

    function showDockyaml() {
        nav(editUrl(formatDockyaml(alias, host)))
    }

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if ((event.altKey) && event.key === 'r') {
                listFiles("", []).then()
            }
            if ((event.altKey) && event.key === 's') {
                event.preventDefault()
                showSearch()
            }
            if ((event.altKey) && event.key === 'a') {
                event.preventDefault()
                showFileAdd()
            }
            if ((event.altKey) && event.key === 'e') {
                event.preventDefault()
                showDockyaml()
            }
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => {
            window.removeEventListener('keydown', handleKeyDown)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const {panelSize, panelRef, handleMouseDown, isResizing} = useResizeBar('right')

    return (
        <>
            {/* Sidebar Panel */}
            <Box ref={panelRef}
                 sx={{
                     width: isSidebarCollapsed ? 0 : panelSize,
                     flexShrink: 0,
                     borderRight: isSidebarCollapsed ? 0 : 1,
                     borderColor: 'divider',
                     transition: isResizing ? 'none' : 'width 0.1s ease-in-out',
                     display: 'flex',
                     flexDirection: 'column',
                     height: '100%',
                     position: 'relative',
                     overflow: 'hidden', // Keeps the header and resize handle fixed
                 }}
            >
                {/* HEADER AREA */}
                <Toolbar variant="dense" sx={{px: 1, gap: 1}}>
                    <Box
                        sx={{
                            display: 'flex',
                            alignItems: 'center',
                            cursor: 'pointer',
                            minWidth: 0,
                            gap: 0.5,
                            opacity: 0.9,
                            '&:hover': {opacity: 1}
                        }}
                    >
                        <Typography variant="subtitle1" fontWeight="bold" noWrap>
                            {alias}
                        </Typography>
                    </Box>

                    <Box sx={{flexGrow: 1}}/>

                    <Box sx={{display: 'flex', alignItems: 'center', gap: 0.5}}>
                        <Tooltip arrow title={<ShortcutFormatter title="Reload" keyCombo={["ALT", "R"]}/>}>
                            <IconButton size="small"
                                        onClick={() => listFiles("", [])}
                                        color="primary">
                                <Cached fontSize="small"/>
                            </IconButton>
                        </Tooltip>

                        <Tooltip arrow title={<ShortcutFormatter title="Search" keyCombo={["ALT", "S"]}/>}>
                            <IconButton
                                size="small" onClick={showSearch} color="secondary">
                                <SearchIcon fontSize="small"/>
                            </IconButton>
                        </Tooltip>

                        <Tooltip arrow title={<ShortcutFormatter title="Add" keyCombo={["ALT", "A"]}/>}>
                            <IconButton size="small" onClick={showFileAdd} color="success">
                                <AddIcon fontSize="small"/>
                            </IconButton>
                        </Tooltip>

                        {/* Added an extra icon just to match your snippet's count */}
                        <Tooltip arrow title={<ShortcutFormatter title="Edit dockman.yaml" keyCombo={["ALT", "E"]}/>}>
                            <IconButton size="small" onClick={showDockyaml} color="success">
                                <YamlIcon/>
                            </IconButton>
                        </Tooltip>
                    </Box>
                </Toolbar>

                <Divider/>

                {/* SCROLLABLE CONTENT AREA */}
                <Box sx={{
                    flexGrow: 1,
                    overflowY: 'auto',
                    overflowX: 'hidden',
                    // Optional: styling scrollbar to look more like an IDE
                    '&::-webkit-scrollbar': {width: '6px'},
                    '&::-webkit-scrollbar-thumb': {backgroundColor: 'rgba(255,255,255,0.1)'}
                }}>
                    <FileListInner/>
                </Box>

                {/* Resize Handle */}
                {!isSidebarCollapsed && (
                    <Box
                        onMouseDown={handleMouseDown}
                        sx={{
                            position: 'absolute',
                            right: 0,
                            top: 0,
                            bottom: 0,
                            width: '4px',
                            cursor: 'ew-resize',
                            backgroundColor: isResizing ? 'primary.main' : 'transparent',
                            '&:hover': {
                                backgroundColor: 'primary.main',
                            },
                            zIndex: 10,
                        }}
                    />
                )}
            </Box>
        </>
    )
}

const FileListInner = () => {
    const {files, isLoading} = useFiles()

    return (
        <StyledScrollbarBox sx={{flexGrow: 1}}>
            {isLoading && files.length < 1 ? (
                <Box display="flex" justifyContent="center" alignItems="center" height="100%">
                    <CircularProgress/>
                </Box>
            ) : (
                <List>
                    {files.map((ele, inde) =>
                        <FileItem
                            key={ele.filename}
                            entry={ele}
                            index={inde}/>
                    )}
                </List>
            )}
        </StyledScrollbarBox>
    );
};


const StyledScrollbarBox = styled(Box)(({theme}) => ({
    overflowY: 'auto',
    scrollbarGutter: 'stable',
    // Use theme colors for better theming support
    scrollbarWidth: 'thin',
    scrollbarColor: `${theme.palette.grey[400]} transparent`,

    '&::-webkit-scrollbar': {
        width: '6px',
    },
    '&::-webkit-scrollbar-track': {
        background: 'transparent', // Makes the track invisible
    },
    '&::-webkit-scrollbar-thumb': {
        backgroundColor: theme.palette.grey[400],
        borderRadius: '3px',
    },
    '&::-webkit-scrollbar-thumb:hover': {
        backgroundColor: theme.palette.grey[500],
    },
}))
