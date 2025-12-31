import {useFileComponents, useTerminalAction} from "../state/terminal.tsx";
import {
    Box,
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Divider,
    IconButton,
    Stack,
    Tooltip,
    Typography
} from "@mui/material";
import {DnsOutlined, EditRounded, Folder, TerminalOutlined} from "@mui/icons-material"; // Hub is a good default for "Alias/Connection"
import {useEffect, useState} from "react";
import {useSideBarAction} from "../state/files.ts";
import {useAlias} from "../../../context/alias-context.tsx";
import {useNavigate} from "react-router-dom";
import {type FolderAlias} from "../../../gen/host/v1/host_pb.ts";
import HostAliasManager from "../../settings/components/alias-manager.tsx";
import scrollbarStyles from "../../../components/scrollbar-style.tsx";

const ActionSidebar = () => {
    const {isSidebarOpen, toggle: fileSideBarToggle} = useSideBarAction(state => state);
    const {isTerminalOpen, toggle: terminalToggle} = useTerminalAction(state => state);
    const {aliases, listAlias} = useAlias();
    const nav = useNavigate()
    const {alias: activeAlias, host} = useFileComponents()

    const handleAliasClick = (alias: FolderAlias) => {
        nav(`/${host}/files/${alias.alias}`)
    };

    const [openAddAlias, setOpenAddAlias] = useState(false)

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

    function onClose() {
        setOpenAddAlias(false)
        listAlias().then()
    }

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
                                setOpenAddAlias(true)
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

            <Dialog
                open={openAddAlias}
                onClose={onClose}
                fullWidth
                maxWidth="sm"
                slotProps={{
                    paper: {sx: {borderRadius: 3, backgroundImage: 'none'}}
                }}
            >
                <DialogTitle sx={{p: 3, pb: 0}}>
                    <Stack direction="row" alignItems="center" spacing={1.5} sx={{mb: 2}}>
                        <Box sx={{
                            p: 1,
                            borderRadius: 1.5,
                            bgcolor: 'primary.lighter',
                            color: 'primary.main',
                            display: 'flex'
                        }}>
                            <DnsOutlined fontSize="small"/>
                        </Box>
                        <Box>
                            <Typography variant="h6" sx={{fontWeight: 800}}>
                                Manage Aliases
                            </Typography>
                        </Box>
                    </Stack>
                </DialogTitle>

                <DialogContent sx={{p: 3, minHeight: 450, ...scrollbarStyles}}>
                    <HostAliasManager hostname={host} hostId={0}/>
                </DialogContent>

                <Divider/>

                <DialogActions sx={{p: 2.5}}>
                    <Button variant="outlined" color="inherit" onClick={onClose}
                            sx={{borderRadius: 2, fontWeight: 700}}>Close</Button>
                    <Box sx={{flex: 1}}/>
                </DialogActions>
            </Dialog>
        </>
    );
};

export default ActionSidebar;
