import React, {useState} from 'react';
import {Box, ListItemIcon, ListItemText, Menu, MenuItem, Typography} from '@mui/material';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import CheckIcon from '@mui/icons-material/Check';
import {useAlias} from "../../../context/alias-context.tsx";
import {useFileComponents} from "../state/terminal.tsx";

const AliasSelector = () => {
    const {alias, host} = useFileComponents()
    const {files, setAlias} = useAlias();

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
                    {alias}
                </Typography>

                {/* Visual indicator that this is a dropdown */}
                <ArrowDropDownIcon
                    sx={{
                        transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
                        transition: 'transform 0.2s'
                    }}
                />
            </Box>
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
                {files.map((file) => {
                    const fullAlias = file.alias;
                    const displayAlias = fullAlias.split("/").pop()!

                    return (
                        <MenuItem
                            key={displayAlias}
                            onClick={() => handleSelect(displayAlias)}
                            selected={`${host}/${alias}` === fullAlias}
                        >
                            <ListItemIcon>
                                <FolderOpenIcon fontSize="small"/>
                            </ListItemIcon>
                            <ListItemText
                                primary={displayAlias}
                                secondary={file.fullpath}
                                slotProps={{
                                    primary: {fontWeight: 500},
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
                            {alias === displayAlias && <CheckIcon fontSize="small" color="primary"/>}
                        </MenuItem>
                    )
                })}
            </Menu>
        </>
    );
};

export default AliasSelector;