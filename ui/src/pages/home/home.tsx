import {Box, Divider, Drawer, List, ListItemButton, ListItemIcon, Tooltip,} from '@mui/material';
import {FolderDelete, Logout, Settings} from '@mui/icons-material';
import {Link as RouterLink, Outlet, useLocation, useNavigate, useParams} from 'react-router-dom';

import HostSelectDropdown from "./host-selector.tsx";
import {useAuth} from "../../hooks/auth.ts";
import {ShortcutFormatter} from "../compose/components/shortcut-formatter.tsx";
import React, {useEffect, useMemo} from "react";
import {
    ContainerIcon,
    DockerFolderIcon,
    ImagesIcon,
    NetworkIcon,
    StatsIcon,
    VolumeIcon
} from "../compose/components/file-icon.tsx";
import {useTabsStore} from "../../context/tab-context.tsx";
import {useEditorUrl} from "../../lib/editor.ts";
import {useHostStore} from "../compose/state/files.ts";

const MAIN_SIDEBAR_WIDTH = 72;

export const useHostFromUrl = () => {
    const {host} = useParams()
    return host || "local";
}

export function RootLayout() {
    const navigate = useNavigate();
    const location = useLocation();
    const {logout} = useAuth();
    const {lastOpened, allTabs} = useTabsStore();

    const host = useHostFromUrl()
    const setHost = useHostStore(state => state.setHost)
    useEffect(() => {
        setHost(host)
    }, [host]);

    const handleLogout = () => {
        logout();
        navigate('/');
    };

    const editorUrl = useEditorUrl();

    const navigationItems = useMemo(() => [
        {
            title: 'Files',
            path: editorUrl(),
            icon: DockerFolderIcon,
            onClick: () => {
                const url = editorUrl(lastOpened, allTabs[lastOpened])
                navigate(url)
            },
        },
        {title: 'Stats', path: `/${host}/stats`, icon: StatsIcon},
        {title: 'Containers', path: `/${host}/containers`, icon: ContainerIcon},
        {title: 'Images', path: `/${host}/images`, icon: ImagesIcon},
        {title: 'Volumes', path: `/${host}/volumes`, icon: VolumeIcon},
        {title: 'Networks', path: `/${host}/networks`, icon: NetworkIcon},
        {title: 'Cleaner', path: `/${host}/cleaner`, icon: () => <FolderDelete sx={{color: 'greenyellow'}}/>},
    ], [lastOpened, host, navigate, editorUrl, allTabs]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.altKey && !e.ctrlKey && !e.shiftKey && !e.repeat) {
                const pageIndex = parseInt(e.key, 10) - 1;
                if (!isNaN(pageIndex)) {
                    e.preventDefault();
                    const page = navigationItems[pageIndex];
                    if (page) {
                        if (page.onClick) page.onClick();
                        else navigate(page.path);
                    }
                }
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [navigate, navigationItems]);

    return (
        <Box sx={{display: 'flex', minHeight: '100vh'}}>
            <Drawer
                sx={{
                    width: MAIN_SIDEBAR_WIDTH,
                    flexShrink: 0,
                    '& .MuiDrawer-paper': {
                        width: MAIN_SIDEBAR_WIDTH,
                        boxSizing: 'border-box',
                        borderRight: '1px solid',
                        borderColor: 'divider',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        backgroundColor: 'background.default',
                        py: 2
                    }
                }}
                variant="permanent"
                anchor="left"
            >
                {/* 1. TOP: Logo Icon Only */}
                <Box
                    component={RouterLink}
                    to="/"
                    sx={{
                        mb: 3,
                        display: 'flex',
                        justifyContent: 'center',
                        transition: 'transform 0.2s',
                        '&:hover': {transform: 'scale(1.1)'}
                    }}
                >
                    <Box component="img" sx={{height: 36, width: 36}} alt="Logo" src="/dockman.svg"/>
                </Box>

                <Box sx={{mb: 2, position: 'relative'}}>
                    <HostSelectDropdown/>
                </Box>

                <Divider sx={{width: '60%', mb: 2}}/>

                {/* Navigation Items - Icon Only */}
                <Box sx={{flexGrow: 1, overflowY: 'auto', width: '100%'}}>
                    <List sx={{display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1}}>
                        {navigationItems.map((item, index) => {
                            const IconComponent = item.icon as React.ComponentType;
                            const isSelected = location.pathname.startsWith(item.path);

                            return (
                                <Tooltip
                                    key={item.title}
                                    placement="right"
                                    title={<ShortcutFormatter title={item.title} keyCombo={["ALT", `${index + 1}`]}/>}
                                >
                                    <ListItemButton
                                        onClick={item.onClick ? item.onClick : () => navigate(item.path)}
                                        selected={isSelected}
                                        sx={{
                                            borderRadius: 2,
                                            justifyContent: 'center',
                                            width: 48,
                                            height: 48,
                                            px: 0
                                        }}
                                    >
                                        <ListItemIcon sx={{minWidth: 0, justifyContent: 'center'}}>
                                            <IconComponent/>
                                        </ListItemIcon>
                                    </ListItemButton>
                                </Tooltip>
                            );
                        })}
                    </List>
                </Box>

                {/* Bottom Items */}
                <Box sx={{
                    width: '100%',
                    mt: 'auto',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 1
                }}>
                    <Divider sx={{width: '60%', mb: 1}}/>

                    <Tooltip title="Settings" placement="right">
                        <ListItemButton
                            component={RouterLink}
                            to="/settings"
                            selected={location.pathname === '/settings'}
                            sx={{borderRadius: 2, justifyContent: 'center', width: 48, height: 48, px: 0}}
                        >
                            <ListItemIcon sx={{minWidth: 0, justifyContent: 'center'}}>
                                <Settings/>
                            </ListItemIcon>
                        </ListItemButton>
                    </Tooltip>

                    <Tooltip title="Logout" placement="right">
                        <ListItemButton
                            onClick={handleLogout}
                            sx={{borderRadius: 2, justifyContent: 'center', width: 48, height: 48, px: 0}}
                        >
                            <ListItemIcon sx={{minWidth: 0, justifyContent: 'center'}}>
                                <Logout/>
                            </ListItemIcon>
                        </ListItemButton>
                    </Tooltip>
                </Box>
            </Drawer>

            <Box
                component="main"
                sx={{
                    flexGrow: 1,
                    minWidth: 0,
                    height: '100vh',
                    overflow: 'auto'
                }}
            >
                <Outlet/>
            </Box>
        </Box>
    );
}

export default RootLayout;
