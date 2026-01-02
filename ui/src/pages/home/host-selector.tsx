import {Box, Button, Menu, MenuItem, Tooltip, Typography} from "@mui/material";
import {type MouseEvent, useEffect, useRef, useState} from "react";
import {KeyChar} from "../../components/keychar.tsx";
import {useHostManager as useHostContext} from "../../context/host-context.tsx";
import {useHostStore} from "../compose/state/files.ts";

function HostSelectDropdown() {
    const selectedHost = useHostStore(state => state.host)
    const {isLoading, availableHosts, setHost} = useHostContext();

    const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const open = Boolean(anchorEl);

    const hostInitial = (selectedHost || 'H').charAt(0).toUpperCase();

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.altKey && event.key.toLowerCase() === 'w') {
                event.preventDefault();
                if (!open) {
                    setAnchorEl(buttonRef.current);
                } else {
                    setAnchorEl(null);
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [open]);

    const handleOpen = (event: MouseEvent<HTMLButtonElement>) => {
        setAnchorEl(event.currentTarget);
    };

    const handleClose = () => {
        setAnchorEl(null);
    };

    const handleSelect = (hostName: string) => {
        setHost(hostName);
        handleClose();
    };

    return (
        <>
            <Tooltip
                title={
                    <Box sx={{display: 'flex', alignItems: 'center', gap: 1}}>
                        <span>{selectedHost}</span>
                        <Box sx={{display: 'flex', gap: 0.5, opacity: 0.8}}>
                            <KeyChar>ALT</KeyChar>+<KeyChar>W</KeyChar>
                        </Box>
                    </Box>
                }
                placement="right"
            >
                <Button
                    ref={buttonRef}
                    id="host-select-button"
                    aria-controls={open ? 'host-menu' : undefined}
                    aria-haspopup="true"
                    aria-expanded={open ? 'true' : undefined}
                    onClick={handleOpen}
                    disabled={isLoading}
                    sx={{
                        minWidth: 42,
                        width: 42,
                        height: 42,
                        p: 0,
                        borderRadius: 1.5,
                        fontSize: '1.1rem',
                        fontWeight: '900',
                        color: 'primary.main',
                        backgroundColor: '#2a2a2a',
                        border: '1px solid',
                        borderColor: 'divider',
                        '&:hover': {
                            borderColor: 'primary.main',
                            backgroundColor: '#0a0a0a',
                        },
                        boxShadow: 'none',
                        textTransform: 'none',
                    }}
                >
                    {hostInitial}
                </Button>
            </Tooltip>
            <Menu
                id="host-menu"
                anchorEl={anchorEl}
                open={open}
                onClose={handleClose}
                slotProps={{
                    list: {
                        'aria-labelledby': 'host-select-button',
                    },
                    paper: {
                        sx: {
                            minWidth: 180, // Set a fixed width since the button is now small
                            marginTop: 1,
                        }
                    }
                }}
            >
                <Box sx={{px: 2, py: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                    <Typography variant="caption" sx={{fontWeight: 'bold', color: 'text.secondary'}}>
                        SELECT HOST
                    </Typography>
                </Box>
                {availableHosts.map((hostName) => (
                    <MenuItem
                        key={hostName}
                        selected={hostName === selectedHost}
                        onClick={() => handleSelect(hostName)}
                        sx={{py: 1}}
                    >
                        <Typography variant="body2" sx={{flexGrow: 1}}>
                            {hostName}
                        </Typography>
                        {hostName === selectedHost && (
                            <Box sx={{width: 6, height: 6, borderRadius: '50%', bgcolor: 'primary.main'}}/>
                        )}
                    </MenuItem>
                ))}
            </Menu>
        </>
    );
}

export default HostSelectDropdown;
