import {Box, createTheme, CssBaseline, Stack, ThemeProvider, Typography} from '@mui/material';
import {SnackbarProvider} from "./context/snackbar-context.tsx";
import {ComposePage} from "./pages/compose-page.tsx";
import {BrowserRouter, Navigate, Outlet, Route, Routes} from "react-router-dom";
import {DashboardPage} from "./pages/dashboard-page.tsx";
import {NavSidebar} from "./components/sidebar.tsx";
import {SettingsPage} from "./pages/settings-page.tsx";
import {AuthProvider} from "./context/auth-context.tsx";
import {AuthPage} from './pages/auth-page.tsx';
import NotFoundPage from "./components/not-found.tsx";
import React from 'react';
import {useAuth} from "./hooks/auth.ts";
import {HostProvider} from "./context/host.tsx";
import { DescriptionOutlined } from '@mui/icons-material';

export default function App() {
    return (
        <ThemeProvider theme={darkTheme}>
            <CssBaseline/>
            <SnackbarProvider>
                <AuthProvider>
                    <BrowserRouter>
                        <HostProvider>
                            <Routes>
                                <Route path="auth" element={<AuthPage/>}/>
                                <Route element={<PrivateRoute/>}>
                                    <Route path="/" element={<HomePage/>}>
                                        <Route index element={<DashboardPage/>}/>
                                        <Route path="files">
                                            {/* This route now renders ONLY at the exact path "/files" */}
                                            <Route index element={<EmptyFilePage/>}/>
                                            {/* These routes will only match if there is a parameter */}
                                            <Route path=":file" element={<ComposePage/>}/>
                                            <Route path=":file/:child" element={<ComposePage/>}/>
                                        </Route>
                                        <Route path="settings" element={<SettingsPage/>}/>
                                    </Route>
                                </Route>
                                <Route path="/not-found" element={<NotFoundPage/>}/>
                                <Route path="*" element={<NotFoundPage/>}/>
                            </Routes>
                        </HostProvider>
                    </BrowserRouter>
                </AuthProvider>
            </SnackbarProvider>
        </ThemeProvider>
    );
}

const styles: { [key: string]: React.CSSProperties } = {
    loadingWrapper: {
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        fontFamily: 'sans-serif',
    },
    spinner: {
        border: '4px solid rgba(0, 0, 0, 0.1)',
        width: '36px',
        height: '36px',
        borderRadius: '50%',
        borderLeftColor: '#09f', // Or your brand color
        animation: 'spin 1s ease infinite',
        marginBottom: '20px',
    },
    loadingText: {
        fontSize: '1.1rem',
        color: '#555',
    }
};

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

    return isAuthenticated ? <Outlet/> : <Navigate to="/auth"/>;
};

function HomePage() {
    return (
        <Box sx={{display: 'flex', height: '100vh', overflow: 'hidden'}}>
            <NavSidebar/>
            <Box component="main" sx={{
                flexGrow: 1,
                height: '100vh',
                display: 'flex',
                flexDirection: 'column',
                minWidth: 0,
            }}>
                <Outlet/>
            </Box>
        </Box>
    );
}

function EmptyFilePage() {
    return (
        <Box
            component="main"
            sx={{
                display: 'flex',
                flexGrow: 1, // Ensures it takes up available space in a flex layout
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%', // Use 100% if inside another container, or 100vh for full page
            }}
        >
            {/* Stack component is ideal for arranging a few items vertically or horizontally with spacing. */}
            <Stack spacing={2} alignItems="center" sx={{textAlign: 'center'}}>
                <DescriptionOutlined
                    sx={{fontSize: '5rem', color: 'grey.400'}}
                />
                <Typography variant="h5" component="h1" color="text.secondary">
                    No File Selected
                </Typography>
                <Typography variant="body1" color="text.disabled">
                    Please select a file from the sidebar.
                </Typography>
            </Stack>
        </Box>
    )
}

const darkTheme = createTheme({
    palette: {
        mode: 'dark',
        primary: {
            main: '#90caf9',
        },
        secondary: {
            main: '#f48fb1',
        },
        background: {
            default: '#121212',
            paper: '#1e1e1e',
        },
    },
    typography: {
        fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
    },
    components: {
        MuiDrawer: {
            styleOverrides: {
                paper: {
                    backgroundColor: '#1a1a1a',
                },
            },
        },
    },
});

