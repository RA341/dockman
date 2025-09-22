import {Box, IconButton, Paper, Tab, Tabs} from '@mui/material';
import {Close as CloseIcon, ExpandLess as ExpandLessIcon, ExpandMore as ExpandMoreIcon} from '@mui/icons-material';
import LogsTerminal from './logs-terminal';

interface LogTabData {
    id: string;
    title: string;

    stream: AsyncIterable<string>;
    inputFn?: ((cmd: string) => void);
}

export interface LogsPanelProps {
    tabs: LogTabData[];
    activeTabId: string | null;
    isMinimized: boolean;
    onTabChange: (tabId: string) => void;
    onTabClose: (tabId: string) => void;
    onToggle: () => void;
}

const PANEL_CONTENT_HEIGHT = '40vh';
const TRANSITION_DURATION = '0.15s';

export function LogsPanel(
    {
        tabs,
        activeTabId,
        isMinimized,
        onTabChange,
        onTabClose,
        onToggle
    }: LogsPanelProps) {

    const toggle = tabs.length ?
        onToggle :
        () => {
        };

    return (
        <Paper
            elevation={8}
            sx={{
                display: 'flex',
                flexDirection: 'column',
                bgcolor: '#1E1E1E',
                color: '#CCCCCC',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: '4px',
                flexShrink: 0,
            }}
        >
            <Box
                onClick={toggle}
                sx={{
                    display: 'flex',
                    alignItems: 'center',
                    pr: 1,
                    backgroundColor: '#333333',
                    '&:hover': {backgroundColor: '#3c3c3c',},
                }}
            >
                <IconButton
                    size="small"
                    sx={{color: 'white', m: '0 4px'}}
                    title={isMinimized ? 'Expand' : 'Collapse'}
                    onClick={toggle}
                >
                    {isMinimized ? <ExpandLessIcon/> : <ExpandMoreIcon/>}
                </IconButton>

                <Tabs
                    value={activeTabId}
                    onChange={(e, newValue) => {
                        e.stopPropagation(); // Prevent bubbling to the parent Box
                        onTabChange(newValue);
                    }}
                    variant="scrollable"
                    scrollButtons="auto"
                    sx={{
                        borderBottom: '1px solid #555',
                        minHeight: '36px',
                    }}
                >
                    {tabs.map((tab) => (
                        <Tab
                            key={tab.id}
                            value={tab.id}
                            component="div"
                            sx={{
                                textTransform: 'none',
                                minHeight: '36px',
                                padding: '6px 16px',
                                marginRight: '2px',
                                border: '1px solid #555',
                                borderBottom: 'none',
                                borderRadius: '4px 4px 0 0',
                            }}
                            label={
                                <Box sx={{display: 'flex', alignItems: 'center'}}>
                                    {tab.title}
                                    <IconButton
                                        size="small"
                                        component="span"
                                        onClick={(e) => {
                                            e.stopPropagation(); // Prevent tab selection & parent toggle
                                            onTabClose(tab.id);
                                        }}
                                        sx={{ml: 1.5, p: '2px', '&:hover': {bgcolor: 'rgba(255,255,255,0.2)'}}}
                                    >
                                        <CloseIcon sx={{fontSize: '1rem'}}/>
                                    </IconButton>
                                </Box>
                            }
                        />
                    ))}
                </Tabs>
            </Box>
            <Box sx={{
                height: isMinimized ? 0 : PANEL_CONTENT_HEIGHT,
                overflow: 'hidden',
                transition: `height ${TRANSITION_DURATION} ease-in-out`,
                position: 'relative',
            }}>
                {tabs.map((tab) => (
                    <Box
                        key={tab.id}
                        sx={{
                            display: tab.id === activeTabId ? 'block' : 'none',
                            position: 'absolute',
                            top: 0, left: 0, right: 0, bottom: 0,
                        }}
                    >
                        <LogsTerminal
                            inputFunc={tab.inputFn}
                            logStream={tab.stream}
                            isActive={tab.id === activeTabId}
                        />
                    </Box>
                ))}
            </Box>
        </Paper>
    );
}