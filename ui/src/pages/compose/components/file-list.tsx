import {useCallback, useEffect} from 'react'
import {Box, CircularProgress, Divider, IconButton, List, styled, Toolbar, Tooltip} from '@mui/material'
import {Add as AddIcon, Refresh, Search as SearchIcon} from '@mui/icons-material'
import {ShortcutFormatter} from "./shortcut-formatter.tsx"
import {useFileComponents} from "../state/terminal.tsx";
import useResizeBar from "../hooks/resize-hook.ts";
import {FileItem} from "./file-item.tsx";
import AliasSelector from "./file-alias-selector.tsx";
import {useFiles} from "../../../context/file-context.tsx"
import {useFileSearch} from "../dialogs/file-search.tsx";
import {useFileCreate} from "../dialogs/file-create.tsx";
import {useSideBarAction} from "../state/files.ts";

export function FileList() {
    const showSearch = useFileSearch(state => state.open)
    const fileCreate = useFileCreate(state => state.open)

    const isSidebarCollapsed = useSideBarAction(state => state.isSidebarOpen)

    const {listFiles} = useFiles()
    const {alias} = useFileComponents()

    const showFileAdd = useCallback(() => {
        fileCreate(`${alias}`)
    }, [alias]);

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
                     overflowY: 'auto',
                     transition: isResizing ? 'none' : 'width 0.1s ease-in-out',
                     // transition: isSidebarCollapsed ? 'width 0.15s ease' : 'width 0.15s ease',
                     overflow: 'hidden',
                     display: 'flex',
                     flexDirection: 'column',
                     height: '100%',
                     position: 'relative',
                 }}
            >
                <Toolbar>
                    <AliasSelector/>

                    <Box sx={{flexGrow: 1}}/>

                    <Tooltip arrow title={
                        <ShortcutFormatter
                            title="Reload List"
                            keyCombo={["ALT", "R"]}
                        />
                    }>
                        <IconButton
                            size="small"
                            onClick={() => listFiles("", [])}
                            color="primary"
                            aria-label="FileSearch"
                        >
                            <Refresh fontSize="small"/>
                        </IconButton>
                    </Tooltip>

                    <Tooltip arrow title={
                        <ShortcutFormatter
                            title="FileSearch"
                            keyCombo={["ALT", "S"]}
                        />
                    }>
                        <IconButton
                            size="small"
                            onClick={() => showSearch()}
                            color="primary"
                            aria-label="FileSearch"
                        >
                            <SearchIcon fontSize="small"/>
                        </IconButton>
                    </Tooltip>

                    <Tooltip arrow title={
                        <ShortcutFormatter
                            title="Add"
                            keyCombo={["ALT", "A"]}
                        />
                    }>
                        <IconButton
                            size="small"
                            onClick={() => showFileAdd()}
                            color="success"
                            sx={{ml: 1}}
                            aria-label="Add"
                        >
                            <AddIcon fontSize="small"/>
                        </IconButton>
                    </Tooltip>
                </Toolbar>

                <Divider/>

                <FileListInner/>

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
    const {files} = useFiles()

    return (
        <StyledScrollbarBox sx={{flexGrow: 1}}>
            {files.length < 1 ? (
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
