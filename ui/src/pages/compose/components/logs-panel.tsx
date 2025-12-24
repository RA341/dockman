import {Box, Divider, IconButton, ListItemButton, Paper, Stack, Typography} from '@mui/material';
import {Close, ExpandMore, TerminalRounded} from '@mui/icons-material';
import {useTerminalAction, useTerminalTabs} from "../state/state.tsx";
import useResizeBar from "../hooks/resize-hook.ts";
import scrollbarStyles from "../../../components/scrollbar-style.tsx";
import InsertDriveFile from '@mui/icons-material/InsertDriveFile';

import "@xterm/xterm/css/xterm.css";
import AppTerminal from "./logs-terminal.tsx";
import {useRef} from "react";
import {FitAddon} from "@xterm/addon-fit";

export function LogsPanel() {
    const {panelSize, panelRef, handleMouseDown, isResizing} = useResizeBar('top')
    const isTerminalOpen = useTerminalAction(state => state.isTerminalOpen);
    const toggle = useTerminalAction(state => state.toggle);

    const {tabs, activeTab, setActiveTab, close} = useTerminalTabs();
    const fitAddonRef = useRef<FitAddon>(new FitAddon());

    return (
        <Paper
            elevation={8}
            ref={panelRef}
            sx={{
                display: (isTerminalOpen) ? 'flex' : 'none',
                height: `${panelSize}px`,
                transition: isResizing ? 'none' : 'height 0.1s ease-in-out',
                overflow: 'hidden',
                position: 'relative',
                flexDirection: 'column',
                bgcolor: '#000000',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: '4px',
                flexShrink: 0,
            }}
        >
            {/* Resize Handle */}
            <Box
                onMouseDown={event => {
                    handleMouseDown(event)
                    fitAddonRef.current.fit()
                }}
                sx={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    top: 0,
                    height: '4px',
                    cursor: 'ns-resize',
                    backgroundColor: isResizing ? '#8a8a8a' : 'transparent',
                    '&:hover': {backgroundColor: '#8a8a8a'},
                    zIndex: 10,
                }}
            />

            <Box
                sx={{
                    flex: 1,
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'row',
                    overflow: 'hidden',
                    minHeight: 0,
                    pt: '4px'
                }}
            >
                {/* Left Sidebar (List) */}
                <Box sx={{
                    width: 250,
                    minWidth: 200,
                    borderRight: '1px solid rgba(255, 255, 255, 0.1)',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                    bgcolor: '#121212'
                }}>
                    <Box sx={{
                        overflow: 'auto',
                        flex: 1,
                        ...scrollbarStyles
                    }}>
                        <Box sx={{display: 'flex', flexDirection: 'row', alignItems: 'center', p: 1}}>
                            <IconButton
                                size="small"
                                sx={{color: 'white', mr: 1}}
                                onClick={(ev) => {
                                    ev.stopPropagation()
                                    toggle()
                                }}
                            >
                                <ExpandMore/>
                            </IconButton>
                            <Typography variant="subtitle2" sx={{flexShrink: 0, color: 'white', fontWeight: 'bold'}}>
                                LOGS
                            </Typography>
                        </Box>

                        <Divider sx={{borderColor: 'rgba(255,255,255,0.1)'}}/>

                        {tabs.size === 0 ? (
                            <Box sx={{
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                mt: 4,
                                opacity: 0.5
                            }}>
                                <InsertDriveFile sx={{fontSize: 30, color: "white", mb: 1}}/>
                                <Typography variant="caption" color="white">No Logs</Typography>
                            </Box>
                        ) : (
                            [...tabs.entries()].map(([key, value]) => (
                                <ListItemButton
                                    key={key}
                                    selected={key === activeTab}
                                    onClick={() => setActiveTab(key)}
                                    sx={{
                                        py: 0.5,
                                        px: 1.5,
                                        mb: 0.5,
                                        color: 'rgba(255,255,255,0.7)',
                                        '&.Mui-selected': {
                                            bgcolor: 'rgba(255,255,255,0.1)',
                                            color: 'white',
                                            borderLeft: '3px solid #2196f3'
                                        },
                                        '&:hover': {
                                            bgcolor: 'rgba(255,255,255,0.05)',
                                        },
                                    }}
                                >
                                    <Typography variant="caption" sx={{
                                        flexGrow: 1,
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap',
                                        fontFamily: 'monospace'
                                    }}>
                                        {value.title}
                                    </Typography>
                                    <IconButton
                                        size="small"
                                        sx={{color: 'inherit', opacity: 0.7, p: 0.5}}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            close(key);
                                        }}
                                    >
                                        <Close sx={{fontSize: 14}}/>
                                    </IconButton>
                                </ListItemButton>
                            ))
                        )}
                    </Box>
                </Box>

                <Box sx={{
                    overflow: 'hidden',
                    position: 'relative',
                    flex: 1,
                    bgcolor: '#1E1E1E',
                    display: 'flex',
                    flexDirection: 'column'
                }}>
                    {tabs.size === 0 ? (
                        <LogsEmpty/>
                    ) : (
                        [...tabs.entries()].map(([key, v]) => {
                            return (
                                <Box
                                    key={v.id}
                                    sx={{
                                        display: key === activeTab ? 'flex' : 'none',
                                        height: '100%',
                                        width: '100%',
                                        flexDirection: 'column',
                                        flex: 1
                                    }}
                                >
                                    <AppTerminal
                                        key={v.id}
                                        {...v}
                                        fit={fitAddonRef}
                                        isActive={key === activeTab}
                                    />
                                </Box>
                            )
                        })
                    )}
                </Box>
            </Box>
        </Paper>
    )
}

function LogsEmpty() {
    return (
        <Box
            sx={{
                flexGrow: 1,
                height: '100%',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                p: 4,
                color: 'rgba(255,255,255,0.3)'
            }}
        >
            <Stack spacing={2} alignItems="center">
                <TerminalRounded sx={{fontSize: 40}} color="inherit"/>
                <Typography variant="body2" color="inherit" align="center">
                    No active terminals selected
                </Typography>
            </Stack>
        </Box>
    );
}
