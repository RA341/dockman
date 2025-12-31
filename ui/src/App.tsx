import {
    Box,
    Button,
    CircularProgress,
    Container,
    createTheme,
    CssBaseline,
    Link as MuiLink,
    MenuItem,
    Paper,
    Stack,
    TextField,
    ThemeProvider,
    Typography
} from '@mui/material';
import {SnackbarProvider} from "./context/snackbar-context.tsx";
import {BrowserRouter, Navigate, Outlet, Route, Routes, useLocation, useNavigate, useParams} from "react-router-dom";
import {AuthProvider} from "./context/auth-context.tsx";
import React from 'react';
import {useAuth} from "./hooks/auth.ts";
import {AuthPage} from './pages/auth/auth-page.tsx';
import {SettingsPage} from "./pages/settings/settings-page.tsx";
import {ChangelogProvider} from "./context/changelog-context.tsx";
import NotFoundPage from "./pages/home/not-found.tsx";
import RootLayout from "./pages/home/home.tsx";
import {UserConfigProvider} from "./context/config-context.tsx";
import HostProvider, {useHostManager} from "./context/host-context.tsx";
import ContainersPage from "./pages/containers/containers.tsx";
import ImagesPage from "./pages/images/images.tsx";
import ImageInspectPage from "./pages/images/inspect.tsx";
import VolumesPage from "./pages/volumes/volumes.tsx";
import NetworksPage from "./pages/networks/networks.tsx";
import NetworksInspect from "./pages/networks/networks-inspect.tsx";
import DockerCleanerPage from "./pages/cleaner/cleaner.tsx";
import {ComposePage, FileIndexRedirect, FilesLayout} from "./pages/compose/compose-page.tsx";
import ContainerInspectPage from "./pages/containers/inspect.tsx";
import scrollbarStyles from "./components/scrollbar-style.tsx";
import StatsPage from "./pages/stats/stats-page.tsx";
import {useHostStore} from "./pages/compose/state/files.ts";
import {enableMapSet} from "immer";
import {SettingsOutlined as SettingsIcon} from '@mui/icons-material';
import FolderIcon from "@mui/icons-material/Folder";

function DockmanYamlEditor() {
    return <div>
        Dockman taml page
    </div>
}

export function App() {
    enableMapSet()

    return (
        <ThemeProvider theme={darkTheme}>
            <CssBaseline/>
            <SnackbarProvider>
                <AuthProvider>
                    <BrowserRouter>
                        <Routes>
                            <Route path="auth" element={<AuthPage/>}/>
                            {/*providers that need auth need to be injected inside private route not here */}
                            <Route element={<PrivateRoute/>}>
                                <Route path="/" element={<RootLayout/>}>
                                    <Route index element={<HomeIndexRedirect/>}/>

                                    <Route path=":host">
                                        <Route index element={<Navigate to="files" replace/>}/>

                                        <Route path="test" element={<TestPage/>}/>

                                        <Route path="files" element={<FilesLayout/>}>
                                            <Route index element={<FileIndexRedirect/>}/>
                                            <Route path=".dockman.yml" element={<DockmanYamlEditor/>}/>
                                            <Route path="*" element={<ComposePage/>}/>
                                        </Route>

                                        <Route path="stats">
                                            <Route index element={<StatsPage/>}/>
                                        </Route>

                                        <Route path="containers">
                                            <Route index element={<ContainersPage/>}/>
                                            <Route path="inspect/:id" element={<ContainerInspectPage/>}/>
                                        </Route>

                                        <Route path="images">
                                            <Route index element={<ImagesPage/>}/>
                                            <Route path="inspect/:id" element={<ImageInspectPage/>}/>
                                        </Route>

                                        <Route path="volumes">
                                            <Route index element={<VolumesPage/>}/>
                                        </Route>

                                        <Route path="networks">
                                            <Route index element={<NetworksPage/>}/>
                                            <Route path="inspect/:id" element={<NetworksInspect/>}/>
                                        </Route>

                                        <Route path="cleaner">
                                            <Route index element={<DockerCleanerPage/>}/>
                                        </Route>
                                    </Route>

                                    <Route path="settings" element={<SettingsPage/>}/>
                                </Route>
                            </Route>
                            <Route path="/not-found" element={<NotFoundPage/>}/>
                            <Route path="*" element={<NotFoundPage/>}/>
                        </Routes>
                    </BrowserRouter>
                </AuthProvider>
            </SnackbarProvider>
        </ThemeProvider>
    );
}


function HomeIndexRedirect() {
    const {availableHosts} = useHostManager()
    const at = availableHosts.at(0) ?? "";
    return <Navigate to={`/${at}`} replace/>;
}


const PrivateRoute = () => {
    const {isAuthenticated, isLoading} = useAuth();

    if (isLoading) {
        return (
            <div style={styles.loadingWrapper}>
                <div style={styles.spinner}></div>
                <p style={styles.loadingText}>Verifying your session...</p>
            </div>
        )
    }

    if (!isAuthenticated) {
        return <Navigate to="/auth"/>
    }

    // Once authenticated, render with providers that need auth
    return (
        <ChangelogProvider>
            <HostProvider>
                <HostGuard/>
            </HostProvider>
        </ChangelogProvider>
    );
};

function HostGuard() {
    const {availableHosts, isLoading} = useHostManager()
    const {host} = useParams()
    const {pathname} = useLocation()

    const isSettingsPage = pathname === "/settings";
    const isRoot = pathname === "/";
    if (isSettingsPage || isRoot) {
        return <Outlet/>
    }

    if (isLoading && host?.length === 0) {
        return (
            <Box sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100vh',
            }}>
                <CircularProgress size={40} thickness={5}/>
                <Typography variant="body2" sx={{mt: 2, fontWeight: 700}} color="text.secondary">
                    Loading hosts...
                </Typography>
            </Box>
        )
    }

    const emptyHostList = !availableHosts || availableHosts.length === 0;
    const validHost = availableHosts.includes(host ?? "")
    if (emptyHostList || !validHost) {
        return <EmptyHost hostname={host ?? ""}/>
    }

    return (
        <UserConfigProvider>
            <Outlet/>
        </UserConfigProvider>
    )
}

const EmptyHost = ({hostname}: {
    hostname?: string;
}) => {
    const navigate = useNavigate();
    const isInvalid = Boolean(hostname);
    const {availableHosts} = useHostManager()

    return (
        <Box sx={{
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            p: 3
        }}>
            <Container maxWidth="sm">
                <Paper
                    variant="outlined"
                    sx={{
                        p: {xs: 4, md: 8},
                        textAlign: 'center',
                        borderRadius: 4,
                        borderStyle: 'dashed',
                        borderWidth: 2,
                        bgcolor: 'background.paper',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                    }}
                >
                    {/* Icon Well */}
                    <Box
                        sx={{
                            mb: 3,
                            display: 'flex',
                            justifyContent: 'center',
                            transition: 'transform 0.2s',
                        }}
                    >
                        <Box component="img" sx={{height: 150, width: 150}} alt="host not found"
                             src="/host-not-found.svg"/>
                    </Box>

                    {/* Content */}
                    <Typography variant="h4" sx={{fontWeight: 800, mb: 1, letterSpacing: '-0.5px'}}>
                        {isInvalid ? "Host Not Found" : "No Hosts Configured"}
                    </Typography>

                    {isInvalid ? (
                        <Box sx={{mb: 3}}>
                            <Typography variant="body2" color="text.secondary" sx={{mb: 2}}>
                                The hostname provided does not match any configured hosts.
                            </Typography>
                            <Typography
                                variant="caption"
                                sx={{
                                    fontSize: 20,
                                    fontFamily: 'monospace',
                                    bgcolor: 'error.lighter',
                                    color: 'error.main',
                                    px: 1.5,
                                    py: 0.5,
                                    borderRadius: 1,
                                    fontWeight: 700
                                }}
                            >
                                {hostname}
                            </Typography>
                        </Box>
                    ) : (
                        <Typography variant="body2" color="text.secondary" sx={{mb: 4, maxWidth: 350}}>
                            It looks like you haven't added any Docker Hosts yet.
                            Configure your first node to start managing containers.
                        </Typography>
                    )}

                    {/* Action Buttons */}
                    <Stack direction={{xs: 'column', sm: 'row'}} spacing={2}
                           sx={{width: '100%', justifyContent: 'center'}}>
                        <Button
                            variant="contained"
                            size="medium"
                            startIcon={<SettingsIcon/>}
                            onClick={() => navigate('/settings')}
                            sx={{
                                borderRadius: 2,
                                px: 4,
                                fontWeight: 500,
                                boxShadow: 'none',
                                '&:hover': {boxShadow: 'none'}
                            }}
                        >
                            Settings
                        </Button>

                        <TextField
                            select
                            label="Switch Host"
                            value={""}
                            onChange={(e) => navigate(`/${e.target.value}`)}
                            size="small"
                            sx={{
                                minWidth: 200,
                                '& .MuiOutlinedInput-root': {
                                    borderRadius: 2,
                                    fontWeight: 700,
                                    bgcolor: 'background.paper'
                                }
                            }}
                            slotProps={{
                                select: {
                                    displayEmpty: true,
                                }
                            }}
                        >
                            {availableHosts.map((f) => (
                                <MenuItem key={f} value={f}>
                                    <Stack direction="row" spacing={1} alignItems="center">
                                        <FolderIcon sx={{fontSize: 18, color: 'text.disabled'}}/>
                                        <Typography variant="body2" sx={{fontWeight: 600}}>
                                            {f}
                                        </Typography>
                                    </Stack>
                                </MenuItem>
                            ))}
                        </TextField>
                    </Stack>

                    {/* Footer Link */}
                    <Typography
                        variant="caption"
                        color="text.disabled"
                        sx={{mt: 4, display: 'block', textAlign: 'center'}}
                    >
                        Need help? Check the <MuiLink href="https://dockman.radn.dev/" target="_blank"
                                                      color="inherit"
                                                      sx={{fontWeight: 700}}>Documentation</MuiLink>
                    </Typography>
                </Paper>
            </Container>
        </Box>
    );
};


const TestPage = () => {
    const host = useHostStore(state => state.host)

    return (
        <div>
            Hello {host}
        </div>
    );
};

const darkTheme = createTheme({
    palette: {
        mode: 'dark',
        primary: {main: '#90caf9'},
        secondary: {main: '#f48fb1'},
        background: {
            default: '#121212',
            paper: '#1e1e1e',
        },
    },
    typography: {
        fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
    },
    components: {
        MuiCssBaseline: {
            styleOverrides: {
                html: {
                    height: '100%',
                    overflow: 'hidden',
                },
                body: {
                    height: '100%',
                    overflow: 'hidden',
                    ...scrollbarStyles,
                },
                '*': scrollbarStyles,
            },
        },
        MuiDrawer: {
            styleOverrides: {
                paper: {
                    backgroundColor: '#1a1a1a',
                },
            },
        },
    },
});

const styles: { [key: string]: React.CSSProperties } = {
    loadingWrapper: {
        display: 'flex',
        flexDirection:
            'column',
        justifyContent:
            'center',
        alignItems:
            'center',
        height:
            '100vh',
        fontFamily:
            'sans-serif',
    }
    ,
    spinner: {
        border: '4px solid rgba(0, 0, 0, 0.1)',
        width:
            '36px',
        height:
            '36px',
        borderRadius:
            '50%',
        borderLeftColor:
            '#09f', // Or your brand color
        animation:
            'spin 1s ease infinite',
        marginBottom:
            '20px',
    }
    ,
    loadingText: {
        fontSize: '1.1rem',
        color:
            '#555',
    }
};
