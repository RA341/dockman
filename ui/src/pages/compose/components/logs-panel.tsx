import {Box, Divider, IconButton, ListItemButton, Paper, Stack, Typography} from '@mui/material';
import {Close, ExpandMore, TerminalRounded} from '@mui/icons-material';
import {useTerminalAction, useTerminalTabs} from "../state/state.tsx";
import useResizeBar from "../hooks/resize-hook.ts";
import scrollbarStyles from "../../../components/scrollbar-style.tsx";
import LogsTerminal from "./logs-terminal.tsx";
import InsertDriveFile from '@mui/icons-material/InsertDriveFile'; // Import a relevant icon

export function LogsPanel() {
    const {panelSize, panelRef, handleMouseDown, isResizing} = useResizeBar('top')
    const {isTerminalOpen, toggle} = useTerminalAction(state => state);
    const {tabs, activeTab, setActiveTab, close} = useTerminalTabs();

    return isTerminalOpen && (
        <Paper
            elevation={8}
            ref={panelRef}
            sx={{
                height: `${panelSize}px`,
                transition: isResizing ? 'none' : 'height 0.1s ease-in-out',
                overflow: 'hidden',
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                bgcolor: '#000000',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: '4px',
                flexShrink: 0,
            }}
        >
            <Box
                onMouseDown={handleMouseDown}
                sx={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    top: 0,
                    height: '4px',
                    cursor: 'ns-resize',
                    backgroundColor: isResizing ? '#8a8a8a' : 'transparent',
                    '&:hover': {
                        backgroundColor: '#8a8a8a',
                    },
                    zIndex: 10,
                }}
            />

            <Box
                sx={{
                    height: `10px`,
                    display: 'flex',
                    flexDirection: 'row',
                    flex: 1,
                    overflow: 'hidden',
                    minHeight: 0,
                }}
            >
                <Box sx={{
                    width: 250,
                    minWidth: 200,
                    // pl: 2,
                    border: '1px solid rgba(0, 0, 0, 0.2)',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                }}>
                    <Box sx={{
                        overflow: 'auto',
                        flex: 1,
                        ...scrollbarStyles
                    }}>
                        <Box sx={{
                            display: 'flex',
                            flexDirection: 'row',
                        }}>
                            <IconButton
                                size="small"
                                sx={{color: 'white', m: '0 4px'}}
                                title={isTerminalOpen ? 'Expand' : 'Collapse'}
                                onClick={(ev) => {
                                    ev.stopPropagation()
                                    toggle()
                                }}
                            >
                                <ExpandMore/>
                            </IconButton>

                            <Divider/>

                            <Typography variant="h6" gutterBottom sx={{flexShrink: 0, color: 'white'}}>
                                Logs
                            </Typography>

                        </Box>

                        <Divider/>
                        {tabs.size === 0 ?
                            <Box
                                sx={{
                                    flex: 1,
                                    display: 'flex',
                                    justifyContent: 'center',
                                    alignItems: 'center',
                                    minHeight: '150px',
                                    p: 2
                                }}
                            >
                                <Stack spacing={2} alignItems="center">
                                    <InsertDriveFile sx={{fontSize: 30, color: "text.secondary"}}/>
                                    <Typography variant="body1" color="text.secondary" align="center">
                                        No active logs
                                    </Typography>
                                </Stack>
                            </Box> :
                            [...tabs.entries()].map(([key, value]) => (
                                <ListItemButton
                                    key={key}
                                    sx={{
                                        py: 1,
                                        px: 1.5,
                                        border: 1,
                                        borderColor: 'divider',
                                        color: 'white',
                                        borderRadius: 1,
                                        mb: 0.5,
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        transition: 'background-color 0.2s',
                                        '&.Mui-selected': {
                                            backgroundColor: 'action.selected',
                                            borderColor: 'primary.main',
                                        },
                                        '&:hover': {
                                            backgroundColor: 'action.hover',
                                            cursor: 'pointer',
                                        },
                                    }}
                                    title={value.title}
                                    onClick={() => {
                                        setActiveTab(key)
                                    }}
                                    selected={key === activeTab}
                                >
                                    <Typography variant="body2" sx={{
                                        flexGrow: 1,
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap',
                                        marginRight: 1,
                                    }}>
                                        {value.title}
                                    </Typography>

                                    <Box
                                        sx={{display: 'flex', gap: 0.5}}
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        {/*<IconButton*/}
                                        {/*    size="small"*/}
                                        {/*    onClick={() => {*/}

                                        {/*    }}*/}
                                        {/*>*/}
                                        {/*    <EditIcon fontSize="small"/>*/}
                                        {/*</IconButton>*/}
                                        <IconButton
                                            size="small"
                                            onClick={() => {
                                                close(key)
                                            }}
                                        >
                                            <Close fontSize="small"/>
                                        </IconButton>
                                    </Box>
                                </ListItemButton>)
                            )}

                    </Box>
                </Box>

                <Divider orientation="vertical" flexItem/>

                <Box sx={{
                    overflow: 'hidden',
                    position: 'relative',
                    flex: 1,
                }}>
                    {activeTab === null ?
                        <LogsEmpty/> :
                        <LogsTerminal
                            logStream={tabs.get(activeTab)?.stream ?? tabs.get(activeTab)!.cache}
                            isActive={true}
                        />
                    }
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
            }}
        >
            <Stack spacing={2} alignItems="center">
                <TerminalRounded
                    sx={{fontSize: 40}}
                    color="primary"
                />
                <Typography
                    variant="h6"
                    color="text.secondary"
                    align="center"
                >
                    No log panel selected.
                </Typography>

            </Stack>
        </Box>
    );
}
