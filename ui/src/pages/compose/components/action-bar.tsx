import { useTerminalAction} from "../state/terminal.tsx";
import {Box, IconButton} from "@mui/material";
import {Folder, TerminalOutlined} from "@mui/icons-material";
import {useEffect} from "react";
import {useSideBarAction} from "../state/files.ts";

const ActionBar = () => {
    const {isSidebarOpen, toggle: fileSideBarToggle} = useSideBarAction(state => state)
    const {isTerminalOpen, toggle: terminalToggle} = useTerminalAction(state => state)

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.altKey && !e.repeat) {
                switch (e.code) {
                    // todo move focus to file bar when it is opened like IntelliJ
                    case "Digit1":
                        fileSideBarToggle()
                        break;
                    case "F12":
                        terminalToggle()
                        break;
                }
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown)
        // eslint-disable-next-line
    }, []);

    return (
        <Box
            sx={{
                display: 'flex',
                flexDirection: 'column',          // Stack children vertically
                justifyContent: 'space-between',  // Pushes children to top and bottom
                height: '100%',                   // Ensure the box has height to fill
                width: 'auto',
                flexShrink: 0,
                backgroundColor: '#252727',
                borderRight: 1,
                borderColor: 'rgba(255, 255, 255, 0.23)',
                py: 1, // Adds some vertical padding
            }}
        >
            {/* Top Icon Group */}
            <Box
                sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                }}
            >
                <IconButton
                    size="large"
                    aria-label={isSidebarOpen ? "Open file panel" : "Close file panel"}
                    onClick={fileSideBarToggle}
                    sx={{color: isSidebarOpen ? 'white' : '#ffc72d'}}
                >
                    <Folder/>
                </IconButton>
            </Box>

            {/* Bottom Icon Group */}
            <Box
                sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                }}
            >
                <IconButton
                    size="large"
                    aria-label={isTerminalOpen ? "Close Terminal" : "Open Terminal"}
                    onClick={terminalToggle}
                    sx={{
                        borderRadius: '8px',
                        color: isTerminalOpen ? 'primary.main' : 'white',
                        backgroundColor: isTerminalOpen ? 'grey.800' : 'transparent',
                        '&:hover': {
                            backgroundColor: isTerminalOpen ? 'grey.600' : 'grey.600'
                        }
                    }}
                >
                    <TerminalOutlined/>
                </IconButton>
            </Box>
        </Box>
    );
};

export default ActionBar;