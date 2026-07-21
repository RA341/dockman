import {useContainerExec, useFileComponents, useTerminalAction} from "../state/terminal.tsx";
import {Box, Divider, IconButton, Tooltip, Typography} from "@mui/material";
import {
    Add as AddIcon,
    Cached as RefreshIcon,
    DensityMedium as StandardIcon,
    DensitySmall as CompactIcon,
    EditRounded,
    Folder,
    PushPin as PushPinIcon,
    PushPinOutlined as PushPinOutlinedIcon,
    Search as SearchIcon,
    Terminal,
    TerminalOutlined,
    VerticalSplit as PlacementIcon,
} from "@mui/icons-material";
import {useEffect} from "react";
import {useCompactMode, usePinnedMode, useSideBarAction, useToolbarPlacement} from "../state/files.ts";
import {useAlias} from "../../../context/alias-context.tsx";
import {useNavigate} from "react-router-dom";
import {type FolderAlias} from "../../../gen/host/v1/host_pb.ts";
import {useAliasAddDialogState} from "./add-alias-dialog.tsx";
import {useSidebarActions} from "../hooks/sidebar-actions.ts";
import {YamlIcon} from "./file-icon.tsx";
import {useHostShellWsUrl} from "../../../lib/api.ts";

// Shared style for the compact 40x40 rail buttons.
const railBtnSx = {
    display: 'flex',
    flexDirection: 'column',
    borderRadius: '4px',
    width: '40px',
    height: '40px',
    mb: 0,
    color: 'rgba(255,255,255,0.7)',
    '&:hover': {backgroundColor: 'rgba(255,255,255,0.15)', color: 'white'},
} as const;

const ActionSidebar = () => {
    const {isSidebarOpen, toggle: fileSideBarToggle} = useSideBarAction(state => state);
    const {isTerminalOpen, toggle: terminalToggle} = useTerminalAction(state => state);
    const {aliases} = useAlias();
    const nav = useNavigate()
    const {alias: activeAlias, host, filename} = useFileComponents()
    const openD = useAliasAddDialogState(state => state.setOpen)

    const placement = useToolbarPlacement(state => state.placement)
    const togglePlacement = useToolbarPlacement(state => state.toggle)
    const pinnedMode = usePinnedMode(state => state.enabled)
    const togglePinnedMode = usePinnedMode(state => state.toggle)
    const compact = useCompactMode(state => state.enabled)
    const toggleCompact = useCompactMode(state => state.toggle)
    const {reload, showSearch, showFileAdd, showDockyaml} = useSidebarActions()
    const onSide = placement === 'side'

    const createShellUrl = useHostShellWsUrl()
    const execParams = useContainerExec(state => state.execParams)

    // shell on the current host, in the open compose file's folder when a
    // file is being edited, otherwise in the runner user's home
    const openHostShell = () => {
        const dir = filename ? filename.split('/').slice(0, -1).pop() : ''
        const title = dir ? `${dir} (shell)` : `${host} (shell)`
        execParams(`shell:${host}/${filename || 'home'}`, title, createShellUrl(filename || undefined), true)
    }

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
                <Box sx={{display: 'flex', flexDirection: 'column', alignItems: 'center', pt: 1, gap: 0.5}}>

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

                    {/* Pinned-mode toggle, between the folder and the aliases */}
                    {onSide && (
                        <Tooltip title={pinnedMode ? "Pinned mode on" : "Pinned mode off"} placement="right">
                            <IconButton
                                onClick={togglePinnedMode}
                                sx={{...railBtnSx, color: pinnedMode ? 'primary.main' : 'rgba(255,255,255,0.7)'}}
                            >
                                {pinnedMode ? <PushPinIcon sx={{fontSize: 18}}/> :
                                    <PushPinOutlinedIcon sx={{fontSize: 18}}/>}
                            </IconButton>
                        </Tooltip>
                    )}

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
                                    mb: 0,
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
                                mb: 0,
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

                    {/* File explorer actions, when placed on the side rail */}
                    {onSide && (
                        <>
                            <Divider sx={{width: '60%', borderColor: 'rgba(255,255,255,0.1)', my: 0.25}}/>

                            <Tooltip title="Reload (Alt+R)" placement="right">
                                <IconButton onClick={reload} sx={{...railBtnSx, color: 'primary.main'}}>
                                    <RefreshIcon sx={{fontSize: 18}}/>
                                </IconButton>
                            </Tooltip>

                            <Tooltip title="Add file (Alt+A)" placement="right">
                                <IconButton onClick={showFileAdd} sx={{...railBtnSx, color: 'success.main'}}>
                                    <AddIcon sx={{fontSize: 18}}/>
                                </IconButton>
                            </Tooltip>

                            <Tooltip title="Search (Alt+S)" placement="right">
                                <IconButton onClick={showSearch} sx={{...railBtnSx, color: 'secondary.main'}}>
                                    <SearchIcon sx={{fontSize: 18}}/>
                                </IconButton>
                            </Tooltip>

                            <Tooltip title={compact ? "Compact mode on" : "Compact mode off"} placement="right">
                                <IconButton
                                    onClick={toggleCompact}
                                    sx={{...railBtnSx, color: compact ? 'primary.main' : 'rgba(255,255,255,0.7)'}}
                                >
                                    {compact ? <CompactIcon sx={{fontSize: 18}}/> : <StandardIcon sx={{fontSize: 18}}/>}
                                </IconButton>
                            </Tooltip>

                            <Tooltip title="Edit dockman.yaml (Alt+E)" placement="right">
                                <IconButton onClick={showDockyaml} sx={{...railBtnSx, color: 'success.main'}}>
                                    <YamlIcon/>
                                </IconButton>
                            </Tooltip>
                        </>
                    )}

                    <Divider sx={{width: '60%', borderColor: 'rgba(255,255,255,0.1)', my: 0.25}}/>

                </Box>

                {/* Bottom Section: Tools */}
                <Box sx={{display: 'flex', flexDirection: 'column', alignItems: 'center', pb: 1, gap: 0.5}}>
                    <Tooltip
                        title={onSide ? "Toolbar on the side rail — switch to top bar" : "Toolbar on the top bar — switch to side rail"}
                        placement="right">
                        <IconButton
                            onClick={togglePlacement}
                            sx={{...railBtnSx, color: onSide ? 'primary.main' : 'rgba(255,255,255,0.5)'}}
                        >
                            <PlacementIcon sx={{fontSize: 18}}/>
                        </IconButton>
                    </Tooltip>

                    <Tooltip
                        title={filename ? `Host shell (${filename.split('/').slice(0, -1).pop()})` : "Host shell (home)"}
                        placement="right"
                    >
                        <IconButton
                            onClick={openHostShell}
                            sx={{
                                color: 'rgba(255,255,255,0.5)',
                                borderRadius: 0,
                                width: '100%',
                                '&:hover': {color: 'white'}
                            }}
                        >
                            <Terminal fontSize="medium"/>
                        </IconButton>
                    </Tooltip>

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
