import {Box, Divider, IconButton, ListItemButton, Paper, Stack, Tooltip, Typography} from '@mui/material';
import {ClearAll, Close, ExpandMore, PushPin, PushPinOutlined, TerminalRounded} from '@mui/icons-material';
import {useTerminalAction, useTerminalTabs} from "../state/terminal.tsx";
import useResizeBar from "../hooks/resize-hook.ts";
import scrollbarStyles from "../../../components/scrollbar-style.tsx";
import InsertDriveFile from '@mui/icons-material/InsertDriveFile';

import "@xterm/xterm/css/xterm.css";
import AppTerminal from "./logs-terminal.tsx";
import LogsViewer from "../../../components/log-viewer/logs-viewer.tsx";
import {useCallback, useEffect, useRef, useState} from "react";
import {FitAddon} from "@xterm/addon-fit";
import {useFileComponents} from "../state/terminal.tsx";

export function LogsPanel() {
    const {panelSize, panelRef, handleMouseDown, isResizing} = useResizeBar('top')
    const isTerminalOpen = useTerminalAction(state => state.isTerminalOpen);
    const toggle = useTerminalAction(state => state.toggle);
    const closePanel = useTerminalAction(state => state.close);
    const floatMode = useTerminalAction(state => state.floatMode);
    const toggleFloat = useTerminalAction(state => state.toggleFloat);
    const revealNonce = useTerminalAction(state => state.revealNonce);

    const {tabs, activeTab, setActiveTab, close, clearAll} = useTerminalTabs();
    const fitAddonRef = useRef<FitAddon>(new FitAddon());

    // floating mode: only a slim bar stays docked; the body overlays the
    // content above it while the pointer is over the bar or the body
    const [hovered, setHovered] = useState(false);
    const bodyVisible = isTerminalOpen && (!floatMode || hovered);

    // collapsing the instant the pointer slips out makes the overlay hard to
    // use: give a grace period instead, and never collapse mid-drag — the
    // pointer routinely exits the panel while resizing via the top handle
    const collapseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const pointerInside = useRef(false);
    const cancelCollapse = useCallback(() => {
        if (collapseTimer.current !== null) {
            clearTimeout(collapseTimer.current);
            collapseTimer.current = null;
        }
    }, []);
    const scheduleCollapse = useCallback(() => {
        cancelCollapse();
        collapseTimer.current = setTimeout(() => {
            collapseTimer.current = null;
            setHovered(false);
        }, 500);
    }, [cancelCollapse]);
    useEffect(() => cancelCollapse, [cancelCollapse]);
    useEffect(() => {
        if (isResizing) {
            cancelCollapse();
        } else if (!pointerInside.current) {
            // drag ended with the pointer outside: collapse after the grace
            // period, since no mouseleave will fire again
            scheduleCollapse();
        }
    }, [isResizing, cancelCollapse, scheduleCollapse]);

    // a freshly requested tab (logs, exec, last action, docker run…) must
    // surface the floating body even though the pointer never touched the
    // panel; the ref seeds with the mount-time nonce so switching views
    // doesn't count as a new request
    const seenReveal = useRef(revealNonce);
    useEffect(() => {
        if (revealNonce === seenReveal.current) return;
        seenReveal.current = revealNonce;
        if (!floatMode) return;
        cancelCollapse();
        setHovered(true);
    }, [revealNonce, floatMode, cancelCollapse]);

    // tabs hold container ids and socket urls scoped to one docker host:
    // after a host switch they would query the wrong daemon, so drop them
    const {host} = useFileComponents();
    const prevHost = useRef(host);
    useEffect(() => {
        if (prevHost.current !== host) {
            prevHost.current = host;
            clearAll();
        }
    }, [host, clearAll]);

    return (
        <Box
            onMouseEnter={() => {
                pointerInside.current = true;
                cancelCollapse();
                setHovered(true);
            }}
            onMouseLeave={() => {
                pointerInside.current = false;
                if (isResizing) return;
                scheduleCollapse();
            }}
            sx={{
                display: isTerminalOpen ? 'block' : 'none',
                position: 'relative',
                flexShrink: 0,
            }}
        >
            {floatMode && (
                <Box sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0.75,
                    height: 26,
                    px: 1,
                    bgcolor: '#121212',
                    borderTop: '1px solid rgba(255,255,255,0.15)',
                    cursor: 'default',
                }}>
                    <TerminalRounded sx={{fontSize: 14, color: 'rgba(255,255,255,0.6)'}}/>
                    <Typography variant="caption" sx={{
                        color: 'rgba(255,255,255,0.8)',
                        fontWeight: 700,
                        letterSpacing: '0.08em',
                        lineHeight: 1,
                    }}>
                        LOGS
                    </Typography>
                    <Typography variant="caption" sx={{color: 'rgba(255,255,255,0.4)', lineHeight: 1}}>
                        · {tabs.size}
                    </Typography>
                    <Box sx={{flexGrow: 1}}/>
                    <Tooltip title="Pin the panel (always open)">
                        <IconButton size="small" sx={{color: 'rgba(255,255,255,0.5)', p: 0.25}}
                                    onClick={toggleFloat}>
                            <PushPinOutlined sx={{fontSize: 14}}/>
                        </IconButton>
                    </Tooltip>
                    <Tooltip title="Close panel">
                        <IconButton size="small" sx={{color: 'rgba(255,255,255,0.5)', p: 0.25}}
                                    onClick={() => closePanel()}>
                            <Close sx={{fontSize: 14}}/>
                        </IconButton>
                    </Tooltip>
                </Box>
            )}

            <Paper
                elevation={8}
                ref={panelRef}
                sx={{
                    display: bodyVisible ? 'flex' : 'none',
                    height: `${panelSize}px`,
                    transition: isResizing ? 'none' : 'height 0.1s ease-in-out',
                    overflow: 'hidden',
                    position: floatMode ? 'absolute' : 'relative',
                    ...(floatMode ? {
                        bottom: '100%',
                        left: 0,
                        right: 0,
                        zIndex: 1250,
                        boxShadow: '0 -10px 28px rgba(0,0,0,0.65)',
                    } : {}),
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
                        <Box sx={{display: 'flex', flexDirection: 'row', alignItems: 'center', px: 1, py: 0.25}}>
                            <IconButton
                                size="small"
                                sx={{color: 'rgba(255,255,255,0.7)', mr: 0.5, p: 0.25}}
                                onClick={(ev) => {
                                    ev.stopPropagation()
                                    toggle()
                                }}
                            >
                                <ExpandMore sx={{fontSize: 18}}/>
                            </IconButton>
                            <Typography variant="caption" sx={{
                                flexGrow: 1,
                                color: 'rgba(255,255,255,0.8)',
                                fontWeight: 700,
                                letterSpacing: '0.08em',
                            }}>
                                LOGS
                            </Typography>
                            <Tooltip title={floatMode ? "Pin the panel (always open)" : "Float the panel (peek on hover)"}>
                                <IconButton
                                    size="small"
                                    sx={{color: 'rgba(255,255,255,0.5)', p: 0.25, mr: 0.25}}
                                    onClick={toggleFloat}
                                >
                                    {floatMode
                                        ? <PushPin sx={{fontSize: 15}}/>
                                        : <PushPinOutlined sx={{fontSize: 15}}/>}
                                </IconButton>
                            </Tooltip>
                            <Tooltip title="Close all tabs">
                                <IconButton
                                    size="small"
                                    sx={{color: 'rgba(255,255,255,0.5)', p: 0.25, mr: 0.25}}
                                    onClick={() => clearAll()}
                                >
                                    <ClearAll sx={{fontSize: 16}}/>
                                </IconButton>
                            </Tooltip>
                            <Tooltip title="Close panel">
                                <IconButton
                                    size="small"
                                    sx={{color: 'rgba(255,255,255,0.5)', p: 0.25}}
                                    onClick={() => closePanel()}
                                >
                                    <Close sx={{fontSize: 16}}/>
                                </IconButton>
                            </Tooltip>
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
                                    {v.logsContainers ? (
                                        <LogsViewer
                                            containers={v.logsContainers}
                                            isActive={bodyVisible && key === activeTab}
                                        />
                                    ) : (
                                        <AppTerminal
                                            key={v.id}
                                            {...v}
                                            fit={fitAddonRef}
                                            isActive={bodyVisible && key === activeTab}
                                        />
                                    )}
                                </Box>
                            )
                        })
                    )}
                </Box>
            </Box>
            </Paper>
        </Box>
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
            <Stack spacing={2} sx={{
                alignItems: "center"
            }}>
                <TerminalRounded sx={{fontSize: 40}} color="inherit"/>
                <Typography variant="body2" align="center" sx={{
                    color: "inherit"
                }}>
                    No active terminals selected
                </Typography>
            </Stack>
        </Box>
    );
}
