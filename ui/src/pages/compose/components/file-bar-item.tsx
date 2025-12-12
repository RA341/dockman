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
import {useAddFile} from "../dialogs/add/add-hook.ts";
import {useOpenFiles} from "../state/state.tsx";
import {Link as RouterLink} from "react-router";
import FileBarIcon from "./file-bar-icon.tsx";
import {amber} from "@mui/material/colors";
import {useFileDelete} from "../dialogs/delete/delete-hook.ts";
import {useFiles} from "../../../hooks/files.ts";
import type {FsEntry} from "../../../gen/files/v1/files_pb.ts";

export const FileBarItem = ({entry, index}: { entry: FsEntry; index: number }) => {
    return (
        <>
            {entry.isDir ?
                <FolderItemDisplay
                    entry={entry}
                    depthIndex={[index]}
                /> :
                <FileItemDisplay
                    entry={entry}
                    depthIndex={[index]}
                />
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

    const name = entry.filename
    const folderOpen = openFiles.has(entry.filename)

    const isSelected = useIsSelected(entry.filename);

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
    }, [folderOpen])

    const {contextMenu, closeCtxMenu, contextActions, handleContextMenu} = useFileMenuCtx(true, depthIndex, name)

    return (
        <>
            <ListItemButton
                selected={isSelected}
                onContextMenu={handleContextMenu}
                sx={{py: 1.25}}
                onClick={handleToggle}
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
                                <FileItemDisplay
                                    entry={child}
                                    depthIndex={[...depthIndex, index]}/>
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
                {...contextActions}
            </Menu>
        </>
    )
}

const FileItemDisplay = (
    {entry, depthIndex}: {
        entry: FsEntry,
        depthIndex: number[]
    }) => {
    const filename = entry.filename
    const filePath = `/stacks/${filename}`
    const isSelected = useIsSelected(filename);
    const displayName = getEntryDisplayName(filename);

    const {contextMenu, closeCtxMenu, contextActions, handleContextMenu} = useFileMenuCtx(false, depthIndex, filename)

    return (
        <>
            <ListItemButton
                selected={isSelected}
                onContextMenu={handleContextMenu}
                to={filePath}
                component={RouterLink}
            >
                <ListItemIcon sx={{minWidth: 32}}>
                    <FileBarIcon filename={filename}/>
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
                {...contextActions}
            </Menu>
        </>
    );
};

const useIsSelected = (entryPath: string) => {
    const location = useLocation();
    const targetPath = `/stacks/${entryPath}`;
    return location.pathname === targetPath;
};

const useFileMenuCtx = (isDir: boolean, depthIndex: number[], filename: string) => {
    const [contextMenu, setContextMenu] = useState<{
        mouseX: number;
        mouseY: number;
    } | null>(null);

    const handleContextMenu = (event: MouseEvent) => {
        event.preventDefault();
        setContextMenu(
            contextMenu === null
                ? {mouseX: event.clientX - 2, mouseY: event.clientY - 4}
                : null
        );
    };

    const closeCtxMenu = () => {
        setContextMenu(null);
    };

    const {showDialog: showAdd} = useAddFile()
    const {showDialog: showDelete} = useFileDelete()

    const contextActions = [
        // todo
        // (
        //     <MenuItem onClick={() => {
        //     }}>
        //         Copy
        //     </MenuItem>
        // ),
        (
            <MenuItem onClick={() => {
            }}>
                Edit
            </MenuItem>
        ),
        (
            <MenuItem onClick={() => {
                closeCtxMenu()
                showDelete(filename, depthIndex)
            }}>
                Delete
            </MenuItem>
        )
    ]

    if (isDir) {
        contextActions.unshift(
            <MenuItem onClick={() => {
                closeCtxMenu()
                showAdd(filename, depthIndex)
            }}>
                Add
            </MenuItem>
        );
    }

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

const getEntryDisplayName = (path: string) => {
    const split = path.split("/");
    const pop = split.pop();
    if (!pop) {
        console.error("unable to get last element in path", "split: ", split, "last element: ", pop)
        return "ERR_EMPTY_PATH"
    }
    return pop
}
