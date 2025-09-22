import {Link as RouterLink, useLocation, useNavigate} from 'react-router-dom'
import {
    Box,
    Collapse,
    IconButton,
    InputBase,
    List,
    ListItemButton,
    ListItemIcon,
    ListItemText,
    Tooltip
} from '@mui/material'
import {Add, Analytics, Delete, Edit, ExpandLess, ExpandMore, Folder, RocketLaunch} from '@mui/icons-material'
import {type FileGroup} from "../../../hooks/files.ts"
import React, {useEffect, useMemo, useRef, useState} from "react"
import FileBarIcon, {DockerFolderIcon} from "./file-bar-icon.tsx"
import {amber} from "@mui/material/colors"
import {isComposeFile} from "../../../lib/editor.ts";
import type {DockmanYaml} from "../../../gen/files/v1/files_pb.ts";
import {useConfig} from "../../../hooks/config.ts";

interface FileItemProps {
    group: FileGroup,
    isOpen: boolean,
    onToggle: (name: string) => void,
    onAdd: (name: string) => void,
    isSelected?: boolean,
    level?: number,
    onDelete: (file: string) => void,
    onRename: (oldPath: string, newPath: string) => void // Clarify newDisplayName is actually newPath for rename
}

interface NormalizedFileGroup {
    type: 'file' | 'folder' | 'promoted-compose'
    name: string
    displayName: string
    composePath?: string // Full path to compose file for promoted folders
    supportingFiles: string[] // Supporting files for promoted compose folders
    allChildren: string[] // All children for regular folders
    isCompose: boolean
}

function normalizeFileGroup({group, config}: { group: FileGroup, config: DockmanYaml | null }): NormalizedFileGroup {
    const isFile = group.children.length === 0

    if (isFile) {
        return {
            type: 'file',
            name: group.name,
            displayName: group.name,
            supportingFiles: [],
            allChildren: [],
            isCompose: isComposeFile(group.name)
        }
    }

    // It's a folder - check for compose file promotion
    const composeFiles = group.children.filter(isComposeFile)

    if (config?.useComposeFolders && composeFiles.length === 1) {
        // Single compose file - promote it
        const composeFile = composeFiles[0]
        const supportingFiles = group.children.filter(child => !isComposeFile(child))

        return {
            type: 'promoted-compose',
            name: group.name,
            displayName: composeFile,
            composePath: `${group.name}/${composeFile}`,
            supportingFiles,
            allChildren: group.children,
            isCompose: true
        }
    }

    // Multiple compose files or no compose files - display as regular folder
    return {
        type: 'folder',
        name: group.name,
        displayName: group.name,
        supportingFiles: [],
        allChildren: group.children,
        isCompose: false
    }
}

const FileBarItem = React.memo((
    {
        group,
        onAdd,
        isOpen,
        onToggle,
        onDelete,
        onRename
    }: FileItemProps) => {

    const {dockYaml} = useConfig()

    const normalized = useMemo(() =>
            normalizeFileGroup({group, config: dockYaml}),
        [dockYaml, group]
    )

    const handleToggle = () => {
        onToggle(group.name)
    }

    // Render a simple file
    if (normalized.type === 'file') {
        return (
            <FileListItem
                filename={normalized.name}
                displayName={normalized.displayName}
                isCompose={normalized.isCompose}
                onDelete={() => onDelete(normalized.name)}
                onRename={onRename}
            />
        )
    }

    // Render a promoted compose folder or regular folder
    const shouldShowAsNavigable = normalized.type === 'promoted-compose'
    const hasChildren = normalized.type === 'promoted-compose'
        ? normalized.supportingFiles.length > 0
        : normalized.allChildren.length > 0

    return (
        <>
            <FolderListItem
                folderName={normalized.name}
                displayName={normalized.displayName}
                composePath={normalized.composePath}
                isCompose={normalized.isCompose}
                navigable={shouldShowAsNavigable}
                hasChildren={hasChildren}
                isOpen={isOpen}
                onAdd={() => onAdd(normalized.name)}
                onDelete={() => onDelete(normalized.name)}
                onToggle={handleToggle}
                onRename={onRename}
            />

            {hasChildren && (
                <Collapse in={isOpen} timeout={125} unmountOnExit>
                    <List disablePadding sx={{pl: 4}}>
                        {(normalized.type === 'promoted-compose'
                                ? normalized.supportingFiles
                                : normalized.allChildren
                        ).map((child: string) => {
                            const childPath = `${normalized.name}/${child}`
                            return (
                                <FileListItem
                                    key={child}
                                    filename={childPath}
                                    displayName={child}
                                    isCompose={isComposeFile(child)}
                                    onDelete={() => onDelete(childPath)}
                                    onRename={onRename}
                                />
                            )
                        })}
                    </List>
                </Collapse>
            )}
        </>
    )
})

interface FileListItemProps {
    filename: string // full path (e.g., "my-folder/my-file.txt")
    displayName: string // just the file name (e.g., "my-file.txt")
    isCompose: boolean
    onDelete: () => void
    onRename: (oldPath: string, newPath: string) => void // Clarify newDisplayName is actually newPath for rename
}

const FileListItem = React.memo(({filename, displayName, isCompose, onDelete, onRename}: FileListItemProps) => {
    const location = useLocation()
    const filePath = `/stacks/${filename}`
    const isSelected = location.pathname === filePath

    const [isEditing, setIsEditing] = useState(false);
    const [editedName, setEditedName] = useState(displayName);
    const [isHovered, setIsHovered] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!isEditing) {
            setEditedName(displayName);
        }
    }, [displayName, isEditing]);


    const handleRenameClick = (e: React.MouseEvent) => {
        handleActionClick(e, () => {
            setIsEditing(true);
            setTimeout(() => {
                inputRef.current?.focus();
                inputRef.current?.select();
            }, 0);
        });
    };

    const handleSaveRename = () => {
        const trimmedEditedName = editedName.trim();
        if (trimmedEditedName === '' || trimmedEditedName === displayName) {
            setIsEditing(false);
            setEditedName(displayName);
            return;
        }

        // --- Start of change for subfile renaming ---
        const lastSlashIndex = filename.lastIndexOf('/');
        let newFullPath: string;

        if (lastSlashIndex !== -1) {
            // It's a subfile (e.g., "folderA/subfile.txt")
            const folderPrefix = filename.substring(0, lastSlashIndex + 1); // "folderA/"
            newFullPath = folderPrefix + trimmedEditedName; // "folderA/new-subfile.txt"
        } else {
            // It's a top-level file (e.g., "file.txt")
            newFullPath = trimmedEditedName; // "new-file.txt"
        }

        onRename(filename, newFullPath); // Call onRename with old full path and new full path
        // --- End of change ---
        setIsEditing(false);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            inputRef.current?.blur();
        } else if (e.key === 'Escape') {
            setIsEditing(false);
            setEditedName(displayName);
            inputRef.current?.blur();
        }
    };

    const handleBlur = () => {
        handleSaveRename();
    };

    return (
        <ListItemButton
            component={isEditing ? 'div' : RouterLink}
            to={isEditing ? undefined : filePath}
            selected={isSelected}
            sx={{py: isCompose ? 1.25 : 1}}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            <ListItemIcon sx={{minWidth: 32}}>
                {isEditing ? null : (isHovered || isSelected) ? (
                    <IconButton size="small" onClick={handleRenameClick}>
                        <Edit fontSize="small"/>
                    </IconButton>
                ) : (
                    <FileBarIcon filename={displayName}/>
                )}
            </ListItemIcon>

            <Box sx={{flex: 1, mr: 1}}>
                {isEditing ? (
                    <InputBase
                        inputRef={inputRef}
                        value={editedName}
                        onChange={(e) => setEditedName(e.target.value)}
                        onBlur={handleBlur}
                        onKeyDown={handleKeyDown}
                        sx={{
                            width: '100%',
                            fontSize: '0.85rem',
                            '& .MuiInputBase-input': {
                                padding: '4px 0',
                            }
                        }}
                    />
                ) : (
                    <ListItemText
                        primary={displayName}
                        slotProps={{
                            primary: {sx: {fontSize: '0.85rem'}}
                        }}
                    />
                )}
                {isCompose && <ComposeActions urlPath={filePath}/>}
            </Box>

            {!isEditing && (
                <IconButton
                    size="small"
                    onClick={(e) => handleActionClick(e, onDelete)}
                    color="error"
                >
                    <Delete fontSize="small"/>
                </IconButton>
            )}
        </ListItemButton>
    )
})

interface FolderListItemProps {
    folderName: string // full path (e.g., "my-folder")
    displayName: string // just the folder name (e.g., "my-folder")
    composePath?: string
    isCompose: boolean
    navigable: boolean
    hasChildren: boolean
    isOpen: boolean
    onAdd: () => void
    onDelete: () => void
    onToggle: () => void
    onRename: (oldPath: string, newPath: string) => void // Clarify newDisplayName is actually newPath for rename
}

const FolderListItem = React.memo(
    ({
         folderName,
         displayName,
         composePath,
         isCompose,
         navigable,
         hasChildren,
         isOpen,
         onAdd,
         onDelete,
         onToggle,
         onRename
     }: FolderListItemProps) => {
        const location = useLocation()
        const composeUrlPath = composePath ? `/stacks/${composePath}` : undefined;
        const isSelected = navigable && composeUrlPath ? location.pathname === composeUrlPath : false;

        const [isEditing, setIsEditing] = useState(false);
        const [editedName, setEditedName] = useState(displayName);
        const [isHovered, setIsHovered] = useState(false);
        const inputRef = useRef<HTMLInputElement>(null);

        useEffect(() => {
            if (!isEditing) {
                setEditedName(displayName);
            }
        }, [displayName, isEditing]);

        const handleRenameClick = (e: React.MouseEvent) => {
            handleActionClick(e, () => {
                setIsEditing(true);
                setTimeout(() => {
                    inputRef.current?.focus();
                    inputRef.current?.select();
                }, 0);
            });
        };

        const handleSaveRename = () => {
            const trimmedEditedName = editedName.trim();
            if (trimmedEditedName === '' || trimmedEditedName === displayName) {
                setIsEditing(false);
                setEditedName(displayName);
                return;
            }
            // For folders, the new display name is the new full path
            onRename(folderName, trimmedEditedName);
            setIsEditing(false);
        };

        const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
            if (e.key === 'Enter') {
                inputRef.current?.blur();
            } else if (e.key === 'Escape') {
                setIsEditing(false);
                setEditedName(displayName);
                inputRef.current?.blur();
            }
        };

        const handleBlur = () => {
            handleSaveRename();
        };

        const mainItemProps = isEditing ? {
            onClick: (e: React.MouseEvent) => e.stopPropagation()
        } : (navigable && composePath ? {
            component: RouterLink,
            to: composeUrlPath,
            selected: isSelected,
            onClick: () => {
                if (isSelected) {
                    onToggle();
                    return;
                }
            }
        } : {
            onClick: onToggle
        });


        return (
            <ListItemButton
                {...mainItemProps}
                sx={{py: isCompose ? 1.25 : 1}}
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
            >
                <ListItemIcon sx={{minWidth: 32}}>
                    {isEditing ? null : (isHovered || isSelected) ? (
                        <IconButton size="small" onClick={handleRenameClick}>
                            <Edit fontSize="small"/>
                        </IconButton>
                    ) : (
                        isCompose ? (
                            <DockerFolderIcon/>
                        ) : (
                            <Folder sx={{color: amber[800], fontSize: '1.1rem'}}/>
                        )
                    )}
                </ListItemIcon>

                <Box sx={{flex: 1, mr: 1}}>
                    {isEditing ? (
                        <InputBase
                            inputRef={inputRef}
                            value={editedName}
                            onChange={(e) => setEditedName(e.target.value)}
                            onBlur={handleBlur}
                            onKeyDown={handleKeyDown}
                            sx={{
                                width: '100%',
                                fontSize: '0.85rem',
                                '& .MuiInputBase-input': {
                                    padding: '4px 0',
                                }
                            }}
                        />
                    ) : (
                        <ListItemText
                            primary={displayName}
                            slotProps={{
                                primary: {sx: {fontSize: '0.85rem'}}
                            }}
                        />
                    )}
                    {isCompose && composePath && (
                        <ComposeActions urlPath={`/stacks/${composePath}`}/>
                    )}
                </Box>

                {!isEditing && (
                    <>
                        <IconButton
                            size="small"
                            onClick={(e) => handleActionClick(e, onAdd)}
                            color="success"
                        >
                            <Add fontSize="small"/>
                        </IconButton>

                        <IconButton
                            size="small"
                            onClick={(e) => handleActionClick(e, onDelete)}
                            color="error"
                        >
                            <Delete fontSize="small"/>
                        </IconButton>

                        {hasChildren && (
                            <IconButton
                                size="small"
                                onClick={(e) => handleActionClick(e, onToggle)}
                                sx={{ml: 0.5}}
                            >
                                {isOpen ? <ExpandLess fontSize="small"/> : <ExpandMore fontSize="small"/>}
                            </IconButton>
                        )}
                    </>
                )}
            </ListItemButton>
        )
    })

function ComposeActions({urlPath}: { urlPath: string }) {
    const navigate = useNavigate()
    const {dockYaml} = useConfig()

    return (
        (dockYaml?.disableComposeQuickActions ?? false) ?
            <></> :
            <Box sx={{mt: 0.5}}>
                <Tooltip title="Deploy" arrow>
                    <IconButton
                        size="small"
                        onClick={(e) => handleActionClick(e, () => navigate(`${urlPath}?tab=1`))}
                        color="primary"
                    >
                        <RocketLaunch fontSize="small"/>
                    </IconButton>
                </Tooltip>
                <Tooltip title="Stats" arrow>
                    <IconButton
                        size="small"
                        onClick={(e) => handleActionClick(e, () => navigate(`${urlPath}?tab=2`))}
                        color="secondary"
                    >
                        <Analytics fontSize="small"/>
                    </IconButton>
                </Tooltip>
            </Box>
    )
}

const handleActionClick = (e: React.MouseEvent, action: () => void) => {
    e.preventDefault()
    e.stopPropagation()
    action()
}

FileBarItem.displayName = 'FileItem'
FileListItem.displayName = 'FileListItem'
FolderListItem.displayName = 'FolderListItem'

export default FileBarItem
