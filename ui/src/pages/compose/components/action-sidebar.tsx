import {useFileComponents, useTerminalAction} from "../state/terminal.tsx";
import {Box, Divider, IconButton, Tooltip, Typography} from "@mui/material";
import {EditRounded, Folder, TerminalOutlined} from "@mui/icons-material"; // Hub is a good default for "Alias/Connection"
import {useEffect} from "react";
import {useSideBarAction} from "../state/files.ts";
import {useAlias} from "../../../context/alias-context.tsx";
import {useNavigate} from "react-router-dom";
import {type FolderAlias} from "../../../gen/host/v1/host_pb.ts";
import {useAliasAddDialogState} from "./add-alias-dialog.tsx";

const ActionSidebar = () => {
    const {isSidebarOpen, toggle: fileSideBarToggle} = useSideBarAction(state => state);
    const {isTerminalOpen, toggle: terminalToggle} = useTerminalAction(state => state);
    const {aliases} = useAlias();
    const nav = useNavigate()
    const {alias: activeAlias, host} = useFileComponents()
    const openD = useAliasAddDialogState(state => state.setOpen)

    const handleAliasClick = (alias: FolderAlias) => {
        nav(`/${host}/files/${alias.alias}`)
    };

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.altKey && !e.repeat) {
                switch (e.code) {
                    case "Digit1":
                        fileSideBarToggle();
                        break;
                    case "F12":
                        terminalToggle();
                        break;
                }
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [fileSideBarToggle, terminalToggle]);

    return (
        <>
            <Box
                sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    height: '100%',
                    width: '50px',
                    flexShrink: 0,
                    backgroundColor: '#1e1e1e',
                    borderRight: '1px solid rgba(255, 255, 255, 0.12)',
                    zIndex: 10,
                }}
            >
                <Box sx={{display: 'flex', flexDirection: 'column', alignItems: 'center', pt: 1, gap: 1}}>

                    {/* File Explorer Toggle */}
                    <Tooltip title="FileBar (Alt+1)" placement="right">
                        <IconButton
                            onClick={fileSideBarToggle}
                            sx={{
                                borderRadius: 0,
                                width: '100%',
                                // borderLeft: isSidebarOpen ? '2px solid #ffc72d' : '2px solid transparent',
                                '&:hover': {color: 'white'}
                            }}
                        >
                            <Folder
                                sx={{color: isSidebarOpen ? 'white' : '#ffc72d'}}
                                fontSize="medium"
                            />
                        </IconButton>
                    </Tooltip>

                    {/* Aliases List */}
                    {aliases.map((alias, index) => (
                        <Tooltip key={index} title={alias.alias} placement="right">
                            <IconButton
                                onClick={() => handleAliasClick(alias)}
                                sx={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    borderRadius: '4px',
                                    width: '40px',
                                    height: '40px',
                                    mb: 0.5,
                                    color: 'rgba(255,255,255,0.7)',
                                    backgroundColor: 'rgba(255,255,255,0.05)',
                                    '&:hover': {
                                        backgroundColor: 'rgba(255,255,255,0.15)',
                                        color: 'white'
                                    }
                                }}
                            >
                                {/* Showing first two letters if no icon exists */}
                                <Typography
                                    variant="caption"
                                    sx={{
                                        fontWeight: 'bold',
                                        color: alias.alias === activeAlias ? 'primary.main' : 'rgba(255, 255, 255, 0.5)',
                                        fontSize: '0.7rem',
                                        textTransform: 'uppercase'
                                    }}
                                >
                                    {alias.alias.substring(0, 2)}
                                </Typography>
                            </IconButton>
                        </Tooltip>
                    ))}

                    <Tooltip title={"Manage aliases"} placement="right">
                        <IconButton
                            onClick={() => {
                                openD(true)
                            }}
                            sx={{
                                display: 'flex',
                                flexDirection: 'column',
                                borderRadius: '4px',
                                width: '40px',
                                height: '40px',
                                mb: 0.5,
                                color: 'rgba(255,255,255,0.7)',
                                // backgroundColor: 'rgba(255,255,255,0.05)',
                                '&:hover': {
                                    backgroundColor: 'rgba(255,255,255,0.15)',
                                    color: 'white'
                                }
                            }}
                        >
                            <EditRounded sx={{fontSize: 18}}/>
                        </IconButton>
                    </Tooltip>

                    <Divider sx={{width: '60%', borderColor: 'rgba(255,255,255,0.1)', my: 0.5}}/>

                </Box>

                {/* Bottom Section: Tools */}
                <Box sx={{display: 'flex', flexDirection: 'column', alignItems: 'center', pb: 1}}>
                    <Tooltip title="Terminal (Alt+F12)" placement="right">
                        <IconButton
                            onClick={terminalToggle}
                            sx={{
                                color: isTerminalOpen ? '#3b82f6' : 'rgba(255,255,255,0.5)',
                                borderRadius: 0,
                                width: '100%',
                                borderLeft: isTerminalOpen ? '2px solid #3b82f6' : '2px solid transparent',
                                '&:hover': {color: 'white'}
                            }}
                        >
                            <TerminalOutlined fontSize="medium"/>
                        </IconButton>
                    </Tooltip>
                </Box>
            </Box>
        </>
    );
};

export default ActionSidebar;
