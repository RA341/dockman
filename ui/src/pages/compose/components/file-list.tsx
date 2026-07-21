import {useCallback, useEffect} from 'react'
import {Box, CircularProgress, Divider, IconButton, List, Tooltip, Typography} from '@mui/material'
import {
    Add as AddIcon,
    Cached,
    DensityMedium as StandardIcon,
    DensitySmall as CompactIcon,
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
import {useCompactMode, usePinnedMode, useSideBarAction, useToolbarPlacement} from "../state/files.ts";
import {YamlIcon} from "./file-icon.tsx";
import {RootDropZone} from "./root-drop-zone.tsx";
import {useDragAutoScroll} from "../hooks/drag-autoscroll.ts";
import {useNavigate} from "react-router-dom";
import {useEditorUrl} from "../../../lib/editor.ts";
import {formatDockyaml} from "./viewer-dockyml.tsx";
import {useComposeFileState} from "../state/status.ts";
import {callRPC, useHostClient} from "../../../lib/api.ts";
import {DockerService} from "../../../gen/docker/v1/docker_pb.ts";
import {useDockerEvents} from "../../../hooks/docker-events.ts";

export function FileList() {
    const showSearch = useFileSearch(state => state.open)
    const fileCreate = useFileCreate(state => state.open)
    const nav = useNavigate()

    const isSidebarCollapsed = useSideBarAction(state => state.isSidebarOpen)
    const pinnedMode = usePinnedMode(state => state.enabled)
    const togglePinnedMode = usePinnedMode(state => state.toggle)
    const placement = useToolbarPlacement(state => state.placement)
    const compact = useCompactMode(state => state.enabled)
    const toggleCompact = useCompactMode(state => state.toggle)

    const {listFiles} = useFiles()
    const {host, alias} = useFileComponents()

    const showFileAdd = useCallback(() => {
        fileCreate(`${alias}`)
    }, [alias, fileCreate]);

    const editUrl = useEditorUrl()

    const showDockyaml = useCallback(() => {
        nav(editUrl(formatDockyaml(alias, host)))
    }, [alias, editUrl, host, nav])

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if ((event.altKey) && event.key === 'r') {
                void listFiles("", [])
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
    }, [listFiles, showDockyaml, showFileAdd, showSearch])

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
                {/* HEADER AREA — slimmer when the actions live on the side rail;
                    also hosts the transient root-drop overlay */}
                <Box sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    px: 1,
                    minHeight: placement === 'side' ? 32 : 48,
                    flexShrink: 0,
                    position: 'relative',
                }}>
                    <RootDropZone/>
                    <Box sx={{
                        display: 'flex',
                        alignItems: 'center',
                        minWidth: 0,
                        gap: 0.5,
                        opacity: 0.9,
                        '&:hover': {opacity: 1}
                    }}>
                        <Typography variant={placement === 'side' ? 'body2' : 'subtitle1'} noWrap sx={{
                            fontWeight: "bold"
                        }}>
                            {alias}
                        </Typography>
                    </Box>

                    <Box sx={{flexGrow: 1}}/>

                    {placement === 'top' && (
                        <Box sx={{display: 'flex', alignItems: 'center', gap: 0.5}}>
                            <Tooltip arrow title={<ShortcutFormatter title="Reload" keyCombo={["ALT", "R"]}/>}>
                                <IconButton size="small" onClick={() => listFiles("", [])} color="primary">
                                    <Cached fontSize="small"/>
                                </IconButton>
                            </Tooltip>

                            <Tooltip arrow title={<ShortcutFormatter title="Search" keyCombo={["ALT", "S"]}/>}>
                                <IconButton size="small" onClick={showSearch} color="secondary">
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

                            <Tooltip arrow title={compact ? "Compact mode on" : "Compact mode off"}>
                                <IconButton size="small" onClick={toggleCompact}
                                            color={compact ? "primary" : "default"}>
                                    {compact ? <CompactIcon fontSize="small"/> : <StandardIcon fontSize="small"/>}
                                </IconButton>
                            </Tooltip>

                            <Tooltip arrow title={<ShortcutFormatter title="Edit dockman.yaml" keyCombo={["ALT", "E"]}/>}>
                                <IconButton size="small" onClick={showDockyaml} color="success">
                                    <YamlIcon/>
                                </IconButton>
                            </Tooltip>
                        </Box>
                    )}
                </Box>

                <Divider/>

                {/* List area — FileListInner owns the scroll container(s) and the
                    drag auto-scroll refs. The root-drop overlay lives in the header. */}
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
    );
}

const scrollSx = {
    overflowY: 'auto',
    overflowX: 'auto',
    scrollbarGutter: 'stable',
} as const;

const FileListInner = () => {
    const {files, isLoading} = useFiles()
    const {host, alias} = useFileComponents()
    const pinnedMode = usePinnedMode(state => state.enabled)

    // Auto-scroll while dragging near a scroll area's edges. Two independent
    // instances: the main list (single scroll area, or the "rest" pane in pinned
    // mode) and the fixed pinned pane above it.
    const autoScrollMain = useDragAutoScroll()
    const autoScrollPinned = useDragAutoScroll()

    // ONLY the set of tracked file keys, as a stable string: depending on the
    // whole openFiles object re-armed this effect on every status write, and
    // each run fires a request whose response writes statuses — a feedback
    // loop hammering ComposeFileStatus every 150ms.
    const trackedKeys = useComposeFileState(state =>
        Object.keys(state.openFiles[`${host}/${alias}`] ?? {}).sort().join('|'))
    const setStatus = useComposeFileState(state => state.setStatus)
    const dockerSrv = useHostClient(DockerService)
    // container lifecycle events refresh the stack dots instantly; the
    // interval is only a safety net
    const eventBump = useDockerEvents()


    useEffect(() => {
        let cancelled = false

        const refresh = async () => {
            const keys = trackedKeys ? trackedKeys.split('|') : []
            if (keys.length === 0) return;

            const {val} = await callRPC(() => dockerSrv.composeFileStatus({ files: keys }))
            if (val && !cancelled) {
                setStatus(val.status)
            }
        }

        // Re-runs whenever the tracked file set changes (the tree registers
        // its compose files progressively at mount — the dots must load as
        // soon as the files are known, not at the next poll) and on every
        // container event. The short delay coalesces those mount-time
        // registrations into a single request.
        const initial = setTimeout(refresh, 150)
        const interval = setInterval(refresh, 30000)
        return () => {
            cancelled = true
            clearTimeout(initial)
            clearInterval(interval)
        }
    }, [trackedKeys, host, alias, dockerSrv, setStatus, eventBump])

    if (isLoading && files.length < 1) {
        return (
            <Box
                sx={{
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                    height: "100%"
                }}>
                <CircularProgress/>
            </Box>
        );
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
            <Box sx={{display: 'flex', flexDirection: 'column', flexGrow: 1, minHeight: 0}}>
                <Box ref={autoScrollPinned} sx={{flexShrink: 0, maxHeight: '45%', ...scrollSx}}>
                    <List>{renderRange(0, pinnedCount)}</List>
                </Box>
                <Divider sx={{borderBottomWidth: 2, borderColor: 'divider'}}/>
                <Box ref={autoScrollMain} sx={{flexGrow: 1, minHeight: 0, ...scrollSx}}>
                    <List>{renderRange(pinnedCount, files.length)}</List>
                </Box>
            </Box>
        )
    }

    // Default: a single scroll area with a visual separator after the pinned run.
    return (
        <Box ref={autoScrollMain} sx={{flexGrow: 1, minHeight: 0, height: '100%', ...scrollSx}}>
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
