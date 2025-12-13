import React, {useState} from 'react';
import {Box, ListItemIcon, ListItemText, Menu, MenuItem, Typography} from '@mui/material';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import FolderIcon from '@mui/icons-material/Folder';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import CheckIcon from '@mui/icons-material/Check';
import {useAlias} from "../../../context/alias-context.tsx";

const AliasSelector = () => {
    const {files, activeAlias, setAlias} = useAlias();
    const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
    const open = Boolean(anchorEl);

    const handleClick = (event: React.MouseEvent<HTMLElement>) => {
        setAnchorEl(event.currentTarget);
    };

    const handleClose = () => {
        setAnchorEl(null);
    };

    const handleSelect = (alias: string) => {
        setAlias(alias);
        handleClose();
    };

    const currentLabel = activeAlias === "" ? "Files" : activeAlias;

    return (
        <>
            {/* Clickable Header Area */}
            <Box
                onClick={handleClick}
                sx={{
                    display: 'flex',
                    alignItems: 'center',
                    cursor: 'pointer',
                    gap: 0.5,
                    opacity: 0.9,
                    '&:hover': {opacity: 1}
                }}
            >
                <Typography variant="h6" fontWeight="bold">
                    {currentLabel}
                </Typography>

                {/* Visual indicator that this is a dropdown */}
                <ArrowDropDownIcon
                    sx={{
                        transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
                        transition: 'transform 0.2s'
                    }}
                />

                {/* Optional: Show active alias as a chip next to title if not empty */}
            </Box>

            {/* Dropdown Menu */}
            <Menu
                anchorEl={anchorEl}
                open={open}
                onClose={handleClose}
                slotProps={{
                    paper: {
                        elevation: 3,
                        sx: {minWidth: 200, mt: 1.5}
                    }
                }}
                transformOrigin={{horizontal: 'left', vertical: 'top'}}
                anchorOrigin={{horizontal: 'left', vertical: 'bottom'}}
            >
                <MenuItem
                    onClick={() => handleSelect("")}
                    selected={activeAlias === ""}
                >
                    <ListItemIcon>
                        <FolderIcon fontSize="small" color={activeAlias === "" ? "primary" : "inherit"}/>
                    </ListItemIcon>
                    <ListItemText primary="Default (ComposeRoot)" secondary="No alias selected"/>
                    {activeAlias === "" && <CheckIcon fontSize="small" color="primary"/>}
                </MenuItem>

                {/* Separator if we have custom aliases */}
                {files.length > 0 && <Box sx={{borderBottom: 1, borderColor: 'divider', my: 1}}/>}

                {/* List of Aliases */}
                {files.map((file) => (
                    <MenuItem
                        key={file.alias}
                        onClick={() => handleSelect(file.alias)}
                        selected={activeAlias === file.alias}
                    >
                        <ListItemIcon>
                            <FolderOpenIcon fontSize="small"/>
                        </ListItemIcon>
                        <ListItemText
                            primary={file.alias}
                            secondary={file.fullpath}
                            slotProps={{
                                primary: {
                                    fontWeight: 500
                                },
                                secondary: {
                                    sx: {
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        maxWidth: '200px',
                                        fontSize: '0.75rem'
                                    }
                                }
                            }}
                        />
                        {activeAlias === file.alias && <CheckIcon fontSize="small" color="primary"/>}
                    </MenuItem>
                ))}
            </Menu>
        </>
    );
};

export default AliasSelector;