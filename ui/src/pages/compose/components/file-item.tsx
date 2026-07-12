import {
    Box,
    CircularProgress,
    Collapse,
    IconButton,
    List,
    ListItemButton,
    ListItemIcon,
    ListItemText,
    Menu,
    MenuItem, Tooltip
} from "@mui/material";
import {useLocation, useNavigate} from 'react-router-dom'
import React, {type MouseEvent, useEffect, useState} from 'react'
import {ExpandLess, ExpandMore, Folder} from '@mui/icons-material'
import {Link as RouterLink} from "react-router";
import FileIcon, {DockerFolderIcon} from "./file-icon.tsx";
import {amber} from "@mui/material/colors";
import type {FsEntry} from "../../../gen/files/v1/files_pb.ts";
import {getDir, getEntryDisplayName, useFiles} from "../../../context/file-context.tsx";

import {isComposeFile, useEditorUrl} from "../../../lib/editor.ts";
import {useSnackbar} from "../../../hooks/snackbar.ts";
import {useFileCreate} from "../dialogs/file-create.tsx";
import {useFileDelete} from "../dialogs/file-delete.tsx";
import {useFileRename} from "../dialogs/file-rename.tsx";
import {useAliasStore, useFileDrag, useHostStore, useOpenFiles} from "../state/files.ts";
import {useConfig} from "../../../hooks/config.ts";
import {useComposeFileState} from "../state/status.ts";
import {getContextKey} from "../../../context/tab-context.tsx";
import type {Status} from "../../../gen/docker/v1/docker_pb.ts";
import {stripQueryParams} from "../../../lib/strings.ts";


export const useFileDnD = (entry: FsEntry) => {
    const [isDragOver, setIsDragOver] = useState(false);
    const {renameFile, uploadFilesFromPC} = useFiles();
    const setDragging = useFileDrag(state => state.setDragging);

    const handleDragStart = (e: React.DragEvent) => {
        e.dataTransfer.setData("sourcePath", entry.filename);
        e.dataTransfer.effectAllowed = "move";
        // Signal a drag is in progress so the transient "drop to root" banner appears.
        setDragging(true);
    };

    const handleDragEnd = () => {
        // Always clear the flag when the drag ends (dropped or cancelled).
        setDragging(false);
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(false);
    };


    const handleDrop = async (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(false);

        const targetDir = entry.isDir ?
            // target is a folder, move INTO it.
            entry.filename :
            // target is a file, move into its PARENT folder.
            getDir(entry.filename);

        const sourcePath = e.dataTransfer.getData("sourcePath");
        if (sourcePath) {
            if (sourcePath === entry.filename) return; // Can't drop on self
            const fileName = sourcePath.split('/').pop() || "";
            // At the root targetDir is "" — avoid producing a leading-slash "/name".
            const newPath = targetDir === "" ? fileName : `${targetDir}/${fileName}`;
            // Only trigger if the path actually changes
            if (sourcePath !== newPath) {
                await renameFile(sourcePath, newPath);
            }
            return;
        }

        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            const droppedFiles = Array.from(e.dataTransfer.files);
            await uploadFilesFromPC(targetDir, droppedFiles);
            return;
        }
    };

    return {
        isDragOver,
        dndProps: {
            draggable: true,
            onDragStart: handleDragStart,
            onDragEnd: handleDragEnd,
            onDragOver: handleDragOver,
            onDragLeave: handleDragLeave,
            onDrop: handleDrop,
        }
    };
};

export const FileItem = ({entry, index}: { entry: FsEntry; index: number }) => {
    return (
        <>
            {entry.isDir ?
                <FolderItemDisplay
                    entry={entry}
                    depthIndex={[index]}
                /> :
                <FileItemDisplay entry={entry}/>
            }
        </>
    )
};

const FolderItemDisplay = ({entry, depthIndex}: {
    entry: FsEntry,
    depthIndex: number[],
}) => {
    const openFiles = useOpenFiles(state => state.openFiles)
    const toggle = useOpenFiles(state => state.toggle)
    const {listFiles} = useFiles()
    const {dockYaml} = useConfig()
    const editorUrl = useEditorUrl() // Hook to get editor route helper

    const useComposeFolder = (dockYaml?.useComposeFolders ?? false)
    const isComposeFolder = useComposeFolder && !!entry.isComposeFolder;

    const composeFilePath = isComposeFolder ? editorUrl(entry.isComposeFolder) : "";

    const {isDragOver, dndProps} = useFileDnD(entry);

    const {host} = useHostStore.getState();
    const {alias} = useAliasStore.getState();
    const ctxKey = `${host}/${alias}`;

    const name = entry.filename
    const folderOpen = openFiles[ctxKey]?.has(entry.filename) ?? false

    // Highlight if we are currently editing the compose file this folder points to
    const isSelected = useIsSelected(composeFilePath);

    const closeComposeStatus = useComposeFileState(state => state.delete)

    const handleToggle = (_e: React.MouseEvent) => {
        // If it's a link, we want the navigation to happen,
        // but we ALSO want to toggle the folder visibility.
        toggle(entry.filename);
    }

    useEffect(() => {
        if (!folderOpen && !isComposeFolder) {
            closeComposeStatus(entry.filename)
        }
    }, [folderOpen]);

    const [isFetchingMore, setIsFetchingMore] = useState(false)

    const fetchMore = async () => {
        setIsFetchingMore(true)
        if (entry.isFetched) return
        await listFiles(name, depthIndex)
        setIsFetchingMore(false)
    }

    useEffect(() => {
        if (folderOpen && !entry.isFetched && !isFetchingMore) {
            fetchMore().then()
        }
    }, [folderOpen, entry.isFetched])

    const {contextMenu, closeCtxMenu, contextActions, handleContextMenu} = useFileMenuCtx(entry)

    const displayName = getEntryDisplayName(name);

    const trackComposeStatus = useComposeFileState(state => state.trackComposeStatus)

    const fileStatus = useComposeFileState(state => state.openFiles[getContextKey()]?.[entry.isComposeFolder])
    useEffect(() => {
        if (isComposeFolder) {
            trackComposeStatus(entry.isComposeFolder);
        }
    }, [isComposeFolder, entry.isComposeFolder]);

    const navigate = useNavigate()
    const createFileUrl = useEditorUrl()

    function openSplit(filename: string) {
        navigate(createFileUrl(filename, undefined, 1))
    }

    const handleMouseDown = (e: React.MouseEvent) => {
        if (isComposeFolder && e.button === 1) {
            e.preventDefault();
            e.stopPropagation();
            openSplit(entry.isComposeFolder);
        }
    };

    return (
        <>
            <ListItemButton
                key={entry.filename}
                {...dndProps}
                draggable
                {...(isComposeFolder ? {
                    component: RouterLink,
                    to: composeFilePath
                } : {
                    component: 'div'
                })}

                onAuxClick={handleMouseDown}

                selected={isSelected}
                onContextMenu={handleContextMenu}
                onClick={handleToggle}

                sx={{
                    py: 1.25,
                    backgroundColor: isDragOver ? 'action.hover' : 'transparent',
                    outline: isDragOver ? '1px dashed primary.main' : 'none',
                    outlineOffset: '-2px',
                    color: 'inherit',
                    textDecoration: 'none'
                }}
            >
                <ListItemIcon sx={{minWidth: 32}}>
                    {isComposeFolder ?
                        <DockerFolderIcon/> :
                        <Folder sx={{color: amber[800], fontSize: '1.1rem'}}/>
                    }
                </ListItemIcon>

                <ListItemText
                    primary={displayName}
                    secondary={isComposeFolder ? getEntryDisplayName(entry.isComposeFolder) : ""}
                    slotProps={{
                        primary: {
                            sx: {
                                fontSize: '0.85rem',
                                fontWeight: 400
                            }
                        }
                    }}
                />

                <StatusIndicator fileStatus={fileStatus}/>

                <IconButton
                    size="small"
                    onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        toggle(entry.filename);
                    }}
                    sx={{ml: 0.5}}
                >
                    {folderOpen ?
                        <ExpandLess fontSize="small"/> :
                        <ExpandMore fontSize="small"/>
                    }
                </IconButton>
            </ListItemButton>

            <Collapse in={folderOpen} timeout={125} unmountOnExit>
                <List disablePadding sx={{pl: 4}}>
                    {!entry.isFetched && isFetchingMore ? (
                        <Box sx={{pl: 2, py: 1}}>
                            <CircularProgress size={16}/>
                        </Box>
                    ) : (
                        entry.subFiles
                            .filter(child => !(isComposeFolder && child.filename === entry.isComposeFolder))
                            .map((child, index) => (
                                child.isDir ?
                                    <FolderItemDisplay
                                        key={child.filename}
                                        entry={child}
                                        depthIndex={[...depthIndex, index]}/> :
                                    <FileItemDisplay key={child.filename} entry={child}/>
                            ))
                    )}
                </List>
            </Collapse>

            <Menu
                open={contextMenu !== null}
                onClose={closeCtxMenu}
                anchorReference="anchorPosition"
                anchorPosition={
                    contextMenu !== null
                        ? {top: contextMenu.mouseY, left: contextMenu.mouseX}
                        : undefined
                }
            >
                {contextActions}
            </Menu>
        </>
    )
}

const FileItemDisplay = ({entry}: { entry: FsEntry }) => {
    const filename = entry.filename

    const {isDragOver, dndProps} = useFileDnD(entry);

    const editorUrl = useEditorUrl()
    const filePath = editorUrl(filename)

    const trackComposeStatus = useComposeFileState(state => state.trackComposeStatus)
    const fileStatus = useComposeFileState(state => state.openFiles[getContextKey()]?.[filename])
    useEffect(() => {
        if (isComposeFile(filename)) {
            trackComposeStatus(filename);
        }
    }, [filename]);

    const navigate = useNavigate()
    const createFileUrl = useEditorUrl()

    function openSplit(filename: string) {
        navigate(createFileUrl(filename, undefined, 1))
    }

    const handleMouseDown = (e: React.MouseEvent) => {
        if (e.button === 1) {
            e.preventDefault();
            e.stopPropagation();
            openSplit(filename);
        }
    };

    const isSelected = useIsSelected(filePath);
    const displayName = getEntryDisplayName(filename);

    const {contextMenu, closeCtxMenu, contextActions, handleContextMenu} = useFileMenuCtx(entry)

    return (
        <>
            <ListItemButton
                {...dndProps}
                sx={{
                    backgroundColor: isDragOver ? 'action.hover' : 'transparent',
                    borderLeft: isDragOver ? '3px solid primary.main' : '3px solid transparent',
                }}
                onAuxClick={handleMouseDown}
                selected={isSelected}
                onContextMenu={handleContextMenu}
                to={filePath}
                component={RouterLink}
            >
                <ListItemIcon sx={{minWidth: 32}}>
                    {<FileIcon filename={filename}/>}
                </ListItemIcon>

                <ListItemText
                    primary={displayName}
                    slotProps={{
                        primary: {sx: {fontSize: '0.85rem'}}
                    }}
                />

                <StatusIndicator fileStatus={fileStatus}/>
            </ListItemButton>
            <Menu
                open={contextMenu !== null}
                onClose={closeCtxMenu}
                anchorReference="anchorPosition"
                anchorPosition={
                    contextMenu !== null
                        ? {top: contextMenu.mouseY, left: contextMenu.mouseX}
                        : undefined
                }
            >
                {contextActions}
            </Menu>
        </>
    );
};

const useIsSelected = (targetPath: string) => {
    const location = useLocation();
    const strippedTarget = stripQueryParams(targetPath);
    if (location.pathname === strippedTarget) {
        return true
    }

    const split = (new URLSearchParams(location.search)).get("split");

    // strippedTarget starts with /<host>/files/ split and remove the prefix
    const cleanFilename = strippedTarget.split("/files/")[1];
    return !!(split && strippedTarget && split === cleanFilename);
};

const useFileMenuCtx = (entry: FsEntry) => {
    const [contextMenu, setContextMenu] = useState<{
        mouseX: number;
        mouseY: number;
    } | null>(null);

    const handleContextMenu = (event: MouseEvent) => {
        event.preventDefault();
        event.stopPropagation()
        setContextMenu(
            contextMenu === null
                ? {mouseX: event.clientX - 2, mouseY: event.clientY - 4}
                : null
        );
    };

    const closeCtxMenu = () => {
        setContextMenu(null);
    };
    const {showError, showSuccess} = useSnackbar()

    const {downloadFile} = useFiles()
    const showCreate = useFileCreate(state => state.open)
    const showDelete = useFileDelete(state => state.open)
    const showRename = useFileRename(state => state.open)

    const filename = entry.filename

    const navigate = useNavigate()
    const createFileUrl = useEditorUrl()

    function openSplit(filename: string) {
        navigate(createFileUrl(filename, undefined, 1))
    }

    const contextActions = [
        ...(
            !entry.isDir ?
                [
                    <MenuItem onClick={() => {
                        closeCtxMenu()
                        openSplit(filename)
                    }}>
                        Open In Split
                    </MenuItem>
                ] :
                []
        ),
        (
            <MenuItem onClick={() => {
                closeCtxMenu()
                showCreate(
                    entry.isDir ?
                        filename :
                        getDir(filename),
                )
            }}>
                Add
            </MenuItem>
        ),
        // todo
        // (
        //     <MenuItem onClick={() => {
        //         closeCtxMenu()
        //         showCreate(
        //             `${filename}-copy`,
        //             true,
        //         )
        //     }}>
        //         Duplicate
        //     </MenuItem>
        // ),
        (
            <MenuItem onClick={() => {
                closeCtxMenu()
                showRename(filename)
            }}>
                Rename
            </MenuItem>
        ),
        ...(!entry.isDir ? [
            <MenuItem key="download" onClick={() => {
                closeCtxMenu()
                downloadFile(filename, true).then(value => {
                    if (value.err) {
                        showError(`Error downloading File: ${value.err}`)
                    } else {
                        showSuccess("File downloaded")
                    }
                })
            }}>
                Download
            </MenuItem>,
        ] : []),
        (
            <MenuItem onClick={() => {
                closeCtxMenu()
                showDelete(filename)
            }}>
                Delete
            </MenuItem>
        )
    ]

    return {closeCtxMenu, contextActions, contextMenu, handleContextMenu}
}

const StatusIndicator = ({fileStatus}: { fileStatus: Status }) => {
    const stackStatus = getStatusTheme(fileStatus);

    return ((fileStatus) &&
        <Tooltip
            title={`${fileStatus.servicesUp} Up, ${fileStatus.servicesDown} Down, ${fileStatus.servicesHealthy} Healthy`}
            arrow placement="right">
            <Box
                sx={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    bgcolor: stackStatus.label ? stackStatus.color : 'transparent',
                    border: stackStatus.label ? 'none' : `2px solid ${stackStatus.color}`,
                    boxShadow: `0 0 0 2px ${stackStatus.color}22`,
                    ml: 1
                }}
            />
        </Tooltip>
    )
};

export default StatusIndicator;

const getStatusTheme = (status: Status | undefined) => {
    if (!status) {
        return {color: 'text.disabled', label: ''};
    }

    if (status.servicesUnHealthy > 0) return {color: 'error.main', label: 'Unhealthy'};
    if (status.servicesDown > 0 && status.servicesUp > 0) return {color: 'warning.main', label: 'Partially Up'};
    if (status.servicesDown > 0 && status.servicesUp === 0) return {color: 'error.light', label: 'Down'};
    if (status.servicesHealthy > 0) return {color: 'success.main', label: 'Healthy'};
    if (status.servicesUp > 0) return {color: 'success.light', label: 'Running'};
    return {color: 'text.disabled', label: ''};
};
