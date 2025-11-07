import {useAtom} from "jotai";
import {sideBarState} from "../state.tsx";
import {Box, IconButton} from "@mui/material";
import {Folder} from "@mui/icons-material";
import {useEffect} from "react";

const ActionBar = () => {
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useAtom(sideBarState)

    useEffect(() => {

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.altKey && !e.repeat) {
                switch (e.code) {
                    // todo move focus to file bar when it is opened like IntelliJ
                    case "Digit1":
                        setIsSidebarCollapsed(prev => !prev)
                        break;
                }
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown)
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
                    aria-label={isSidebarCollapsed ? "Open file panel" : "Close file panel"}
                    onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                    sx={{color: isSidebarCollapsed ? 'white' : '#ffc72d'}}
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
                {/*<IconButton size="large" aria-label="Settings" sx={{color: 'white'}}>*/}
                {/*    <SettingsOutlined/>*/}
                {/*</IconButton>*/}
            </Box>
        </Box>
    );
};

export default ActionBar;