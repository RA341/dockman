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
    MenuItem
} from "@mui/material";
import {useLocation} from 'react-router-dom'
import React, {type MouseEvent, useEffect, useState} from 'react'
import {ExpandLess, ExpandMore, Folder} from '@mui/icons-material'
import {useOpenFiles} from "../state/state.tsx";
import {Link as RouterLink} from "react-router";
import FileIcon from "./file-icon.tsx";
import {amber} from "@mui/material/colors";

import type {FsEntry} from "../../../gen/files/v1/files_pb.ts";
import {getDir, getEntryDisplayName, useFiles} from "../../../context/file-context.tsx";

import {useEditorUrl} from "../../../lib/editor.ts";
import {useSnackbar} from "../../../hooks/snackbar.ts";
import {useFileCreate} from "../dialogs/file-create.tsx";
import {useFileDelete} from "../dialogs/file-delete.tsx";
import {useFileRename} from "../dialogs/file-rename.tsx";


export const useFileDnD = (entry: FsEntry) => {
    const [isDragOver, setIsDragOver] = useState(false);
    const {renameFile, uploadFilesFromPC} = useFiles();

    const handleDragStart = (e: React.DragEvent) => {
        e.dataTransfer.setData("sourcePath", entry.filename);
        e.dataTransfer.effectAllowed = "move";
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
            const newPath = `${targetDir}/${fileName}`;
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

    const {isDragOver, dndProps} = useFileDnD(entry);

    const name = entry.filename
    const folderOpen = openFiles.has(entry.filename)

    // todo if a file with same starting letter is open then the folder and
    //  the file will be highlighted
    // eg abc <- folder abcx <- file both highlighted if file open
    // const isSelected = useIsSelected(entry.filename);
    const isSelected = false;

    const handleToggle = (e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        toggle(entry.filename);
    }
    const displayName = getEntryDisplayName(name);
    const [isFetchingMore, setIsFetchingMore] = useState(false)

    const fetchMore = async () => {
        setIsFetchingMore(true)

        if (entry.isFetched) {
            console.log("Folder is already fetched: ", entry);
            return
        }

        await listFiles(name, depthIndex)
        setIsFetchingMore(false)
    }

    useEffect(() => {
        if (folderOpen && !entry.isFetched && !isFetchingMore) {
            fetchMore().then()
        }
    }, [folderOpen, entry.isFetched])

    const {contextMenu, closeCtxMenu, contextActions, handleContextMenu} = useFileMenuCtx(entry)

    return (
        <>
            <ListItemButton
                key={entry.filename}
                {...dndProps}
                draggable

                selected={isSelected}
                onContextMenu={handleContextMenu}
                onClick={handleToggle}

                sx={{
                    py: 1.25,
                    backgroundColor: isDragOver ? 'action.hover' : 'transparent',
                    outline: isDragOver ? '1px dashed primary.main' : 'none',
                    outlineOffset: '-2px'
                }}
            >
                <ListItemIcon sx={{minWidth: 32}}>
                    <Folder sx={{color: amber[800], fontSize: '1.1rem'}}/>
                </ListItemIcon>

                <ListItemText
                    primary={displayName}
                    slotProps={{
                        primary: {sx: {fontSize: '0.85rem'}}
                    }}
                />

                <IconButton
                    size="small"
                    onClick={handleToggle}
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
                        entry.subFiles.map((child, index) => (
                            child.isDir ?
                                <FolderItemDisplay
                                    entry={child}
                                    depthIndex={[...depthIndex, index]}/> :
                                <FileItemDisplay entry={child}/>
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
    return location.pathname === targetPath;
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

    const contextActions = [
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
        (
            !entry.isDir ?
                <MenuItem onClick={() => {
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
                </MenuItem>
                : <></>
        ),
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

// const useRename = (filename: string) => {
//     const [isEditing, setIsEditing] = useState(false);
//     const [editedName, setEditedName] = useState(filename);
//     const [isHovered, setIsHovered] = useState(false);
//     const inputRef = useRef<HTMLInputElement>(null);
//
//     return {
//         isEditing, setIsEditing,
//         editedName, setEditedName,
//         isHovered, setIsHovered,
//         inputRef,
//     }
// }
