import {useCallback, useEffect, useRef} from 'react'
import {Box, CircularProgress, Divider, IconButton, List, Toolbar, Tooltip, Typography} from '@mui/material'
import {
    Add as AddIcon,
    Cached,
    PushPin as PushPinIcon,
    PushPinOutlined as PushPinOutlinedIcon,
    Search as SearchIcon
} from '@mui/icons-material'
import {ShortcutFormatter} from "./shortcut-formatter.tsx"
import {useFileComponents} from "../state/terminal.tsx";
import useResizeBar from "../hooks/resize-hook.ts";
import {FileItem} from "./file-item.tsx";
import {useFiles} from "../../../context/file-context.tsx"
import {useFileSearch} from "../dialogs/file-search.tsx";
import {useFileCreate} from "../dialogs/file-create.tsx";
import {usePinnedMode, useSideBarAction} from "../state/files.ts";
import {YamlIcon} from "./file-icon.tsx";
import {useNavigate} from "react-router-dom";
import {useEditorUrl} from "../../../lib/editor.ts";
import {formatDockyaml} from "./viewer-dockyml.tsx";
import {useComposeFileState} from "../state/status.ts";
import {callRPC, useHostClient} from "../../../lib/api.ts";
import {DockerService} from "../../../gen/docker/v1/docker_pb.ts";

export function FileList() {
    const showSearch = useFileSearch(state => state.open)
    const fileCreate = useFileCreate(state => state.open)
    const nav = useNavigate()

    const isSidebarCollapsed = useSideBarAction(state => state.isSidebarOpen)
    const pinnedMode = usePinnedMode(state => state.enabled)
    const togglePinnedMode = usePinnedMode(state => state.toggle)

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

                        <Tooltip arrow
                                 title={pinnedMode ? "Pinned mode on — pinned files stay fixed while scrolling" : "Pinned mode off"}>
                            <IconButton size="small" onClick={togglePinnedMode}
                                        color={pinnedMode ? "primary" : "default"}>
                                {pinnedMode ? <PushPinIcon fontSize="small"/> :
                                    <PushPinOutlinedIcon fontSize="small"/>}
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

                <Box sx={{
                    flexGrow: 1,
                    minHeight: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
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

const scrollSx = {
    overflowY: 'auto',
    overflowX: 'hidden',
    scrollbarGutter: 'stable',
    '&::-webkit-scrollbar': {width: '6px'},
    '&::-webkit-scrollbar-thumb': {backgroundColor: 'rgba(255,255,255,0.1)'},
} as const;

const FileListInner = () => {
    const {files, isLoading} = useFiles()
    const {host, alias} = useFileComponents()
    const pinnedMode = usePinnedMode(state => state.enabled)

    const openFiles = useComposeFileState(state => state.openFiles)
    const setStatus = useComposeFileState(state => state.setStatus)
    const dockerSrv = useHostClient(DockerService)


    const openFilesRef = useRef(openFiles)
    useEffect(() => {
        openFilesRef.current = openFiles
    }, [openFiles])

    useEffect(() => {
        const refresh = async () => {
            const currentElement = openFilesRef.current[`${host}/${alias}`];
            if (!currentElement) return;

            const keys = Object.keys(currentElement)
            const {val} = await callRPC(() => dockerSrv.composeFileStatus({ files: keys }))
            if (val) {
                setStatus(val.status)
            }
        }

        refresh().then()
        const interval = setInterval(refresh, 3000)
        return () => clearInterval(interval)
    }, [])

    if (isLoading && files.length < 1) {
        return (
            <Box display="flex" justifyContent="center" alignItems="center" height="100%">
                <CircularProgress/>
            </Box>
        )
    }

    // Pinned entries are always sorted first, so they form a contiguous prefix;
    // the boundary is the first non-pinned entry (all-pinned -> everything).
    const firstUnpinned = files.findIndex(f => !f.pinned)
    const pinnedCount = firstUnpinned === -1 ? files.length : firstUnpinned
    const hasPinned = pinnedCount > 0
    const hasRest = pinnedCount < files.length

    // Render a slice while preserving each entry's ORIGINAL index into `files`
    // (used as the depthIndex that drives lazy-loading of nested folders).
    const renderRange = (start: number, end: number) =>
        files.slice(start, end).map((ele, i) => (
            <FileItem key={ele.filename} entry={ele} index={start + i}/>
        ))

    // Pinned mode: pinned entries stay fixed at the top, only the rest scrolls.
    if (pinnedMode && hasPinned) {
        return (
            <Box sx={{display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0}}>
                <Box sx={{flexShrink: 0, maxHeight: '45%', ...scrollSx}}>
                    <List>{renderRange(0, pinnedCount)}</List>
                </Box>
                <Divider sx={{borderBottomWidth: 2, borderColor: 'divider'}}/>
                <Box sx={{flexGrow: 1, minHeight: 0, ...scrollSx}}>
                    <List>{renderRange(pinnedCount, files.length)}</List>
                </Box>
            </Box>
        )
    }

    // Default: a single scroll area with a visual separator after the pinned run.
    return (
        <Box sx={{flexGrow: 1, minHeight: 0, height: '100%', ...scrollSx}}>
            <List>
                {renderRange(0, pinnedCount)}
                {hasPinned && hasRest && (
                    <Divider component="div" sx={{my: 0.5, borderBottomWidth: 2, borderColor: 'divider'}}/>
                )}
                {renderRange(pinnedCount, files.length)}
            </List>
        </Box>
    )
};
