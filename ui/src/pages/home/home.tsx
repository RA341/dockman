import {
    AppBar,
    Box,
    Drawer,
    IconButton,
    List,
    ListItemButton,
    ListItemIcon,
    Toolbar,
    Tooltip,
    Typography
} from '@mui/material';
import {AddOutlined, FolderDelete, Logout, Settings} from '@mui/icons-material';
import {Link as RouterLink, useLocation, useNavigate} from 'react-router-dom';

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
} from "../compose/components/file-bar-icon.tsx";
import {useTabs} from "../../hooks/tabs.ts";
import {getEditorUrl} from "../../lib/editor.ts";

export const TOP_BAR_HEIGHT = 69;
const MAIN_SIDEBAR_WIDTH = 80;

export function RootLayout() {
    const navigate = useNavigate();
    const location = useLocation();
    const {logout} = useAuth();

    const handleLogout = () => {
        logout();
        navigate('/');
    };

    const {activeTab, tabs} = useTabs()

    const navigationItems = useMemo(() => [
        {
            id: 'files',
            title: 'Stacks',
            path: '/stacks',
            icon: DockerFolderIcon,
            exact: false, // for startsWith matching
            // use last open tab if possible
            onClick: () => navigate(activeTab ?
                getEditorUrl(activeTab, tabs[activeTab]) :
                `/stacks`
            ),
        },
        {
            id: 'dashboard',
            title: 'Stats',
            path: '/stats',
            icon: StatsIcon,
            exact: true, // for exact path matching
        },

        {
            id: 'containers',
            title: 'Containers',
            path: '/containers',
            icon: ContainerIcon,
            exact: false, // for startsWith matching
            onClick: () => navigate('/containers'),
        },
        {
            id: 'images',
            title: 'Images',
            path: '/images',
            icon: ImagesIcon,
            exact: false, // for startsWith matching
            onClick: () => navigate('/images'),
        },
        {
            id: 'volumes',
            title: 'Volumes',
            path: '/volumes',
            icon: VolumeIcon,
            exact: false, // for startsWith matching
            onClick: () => navigate('/volumes'),
        },
        {
            id: 'networks',
            title: 'Networks',
            path: '/networks',
            icon: NetworkIcon,
            exact: false,
            onClick: () => navigate('/networks'),
        },
        {
            id: 'cleaner',
            title: 'Cleaner',
            path: '/cleaner',
            icon: () => <FolderDelete sx={{color: 'greenyellow'}}/>,
            exact: false, // for startsWith matching
            onClick: () => navigate('/cleaner'),
        },
    ], [activeTab, navigate]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // capture alt + num only, ignore alt + ctrl etc
            if (e.altKey && !e.ctrlKey && !e.shiftKey && !e.repeat) {
                // Test if the pressed key is a single digit ('0'-'9')
                // Convert the key string (e.g., "7") to a number
                const pageIndex = parseInt(e.key, 10) - 1;
                if (!isNaN(pageIndex)) {
                    e.preventDefault();

                    const page = navigationItems[pageIndex]
                    if (page) {
                        if (page.onClick) {
                            page.onClick()
                        } else {
                            navigate(page.path)
                        }
                    }
                }
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [navigate, navigationItems]);

    return (
        <>
            <AppBar
                position="fixed"
                sx={{
                    zIndex: (theme) => theme.zIndex.drawer + 1,
                    height: TOP_BAR_HEIGHT,
                    backgroundColor: 'background.default',
                    borderBottom: '1px solid',
                    borderColor: 'divider',
                    boxShadow: 'none',
                    borderBottomLeftRadius: 0,
                    borderBottomRightRadius: 0,
                }}
            >
                <Toolbar sx={{minHeight: `${TOP_BAR_HEIGHT}px !important`, justifyContent: 'space-between'}}>
                    {/* Logo, Title and Host Selector */}
                    <Box sx={{display: 'flex', alignItems: 'center', gap: 4}}>
                        <Box
                            component={RouterLink}
                            to="/"
                            sx={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 1.1,
                                backgroundColor: 'action.hover',
                                px: 1.5,
                                py: 0.5,
                                borderRadius: 2,
                                textDecoration: 'none', // Remove underline from link
                                color: 'inherit', // Inherit color from parent
                            }}
                        >
                            <Box
                                component="img"
                                sx={{
                                    height: 45,
                                    width: 45,
                                    objectFit: 'contain',
                                }}
                                alt="Dockman Logo"
                                src="/dockman.svg"
                            />
                            <Typography variant="h6" noWrap sx={{color: 'text.primary', fontWeight: 'medium'}}>
                                Dockman
                            </Typography>
                        </Box>
                        <Box sx={{display: 'flex', alignItems: 'center', gap: 1, p: 1}}>
                            <Typography variant="body1" sx={{fontWeight: 'medium', color: 'text.main'}}>
                                Host:
                            </Typography>
                            <HostSelectDropdown/>
                            <Tooltip title="Add host">
                                <IconButton
                                    component={RouterLink}
                                    to="/settings"
                                    color={location.pathname === '/settings' ? 'primary' : 'default'}
                                >
                                    <AddOutlined/>
                                </IconButton>
                            </Tooltip>

                        </Box>
                    </Box>

                    {/* Right Side Controls */}
                    <Box sx={{display: 'flex', alignItems: 'center', gap: 2}}>

                        {/* Settings Button */}
                        <Tooltip title="Settings">
                            <IconButton
                                component={RouterLink}
                                to="/settings"
                                color={location.pathname === '/settings' ? 'primary' : 'default'}
                            >
                                <Settings/>
                            </IconButton>
                        </Tooltip>

                        {/* Logout Button */}
                        <Tooltip title="Logout">
                            <IconButton onClick={handleLogout} color="default">
                                <Logout/>
                            </IconButton>
                        </Tooltip>

                    </Box>
                </Toolbar>
            </AppBar>


            {/* Main Navigation Sidebar */}
            <Drawer
                sx={{
                    width: MAIN_SIDEBAR_WIDTH,
                    flexShrink: 0,
                    '& .MuiDrawer-paper': {
                        width: MAIN_SIDEBAR_WIDTH,
                        boxSizing: 'border-box',
                        borderRight: '1px solid',
                        borderColor: 'divider',
                        mt: `${TOP_BAR_HEIGHT}px`,
                        height: `calc(100vh - ${TOP_BAR_HEIGHT}px)`
                    }
                }}
                variant="permanent"
                anchor="left"
            >
                <Box sx={{display: 'flex', flexDirection: 'column', height: '100%'}}>
                    {/* Main Sidebar */}
                    <List sx={{px: 1, pt: 2}}>
                        {navigationItems.map((item, index) => {
                            const IconComponent = item.icon as React.ComponentType;
                            const isSelected = item.exact
                                ? location.pathname === item.path
                                : location.pathname.startsWith(item.path);

                            const buttonContent = (
                                <ListItemIcon sx={{minWidth: 'auto'}}>
                                    <IconComponent/>
                                </ListItemIcon>
                            );

                            const buttonProps = {
                                selected: isSelected,
                                sx: {
                                    borderRadius: 1,
                                    mb: 1,
                                    justifyContent: 'center',
                                    minHeight: 48
                                }
                            };

                            return (
                                <Tooltip
                                    key={item.id}
                                    placement="right"
                                    title={<ShortcutFormatter
                                        title={item.title}
                                        keyCombo={["ALT", `${index + 1}`]}
                                    />}
                                >
                                    {item.onClick ? (
                                        <ListItemButton
                                            onClick={item.onClick}
                                            {...buttonProps}
                                        >
                                            {buttonContent}
                                        </ListItemButton>
                                    ) : (
                                        <ListItemButton
                                            component={RouterLink}
                                            to={item.path}
                                            {...buttonProps}
                                        >
                                            {buttonContent}
                                        </ListItemButton>
                                    )}
                                </Tooltip>
                            );
                        })}
                    </List>
                </Box>
            </Drawer>
        </>
    );
}
