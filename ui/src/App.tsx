import {createTheme, CssBaseline, ThemeProvider} from '@mui/material';
import {SnackbarProvider} from "./context/snackbar-context.tsx";
import {BrowserRouter, Navigate, Outlet, Route, Routes} from "react-router-dom";
import {AuthProvider} from "./context/auth-context.tsx";
import React from 'react';
import {useAuth} from "./hooks/auth.ts";
import {AuthPage} from './pages/auth/auth-page.tsx';
import {SettingsPage} from "./pages/settings/settings-page.tsx";
import {ChangelogProvider} from "./context/changelog-context.tsx";
import NotFoundPage from "./pages/home/not-found.tsx";
import RootLayout, {useHost} from "./pages/home/home.tsx";
import {UserConfigProvider} from "./context/config-context.tsx";
import AliasProvider from "./context/alias-context.tsx";
import {TabsProvider, useTabs} from "./context/tab-context.tsx";
import HostProvider from "./context/host-context.tsx";
import {DashboardPage} from "./pages/dashboard/dashboard-page.tsx";
import ContainersPage from "./pages/containers/containers.tsx";
import ImagesPage from "./pages/images/images.tsx";
import ImageInspectPage from "./pages/images/inspect.tsx";
import VolumesPage from "./pages/volumes/volumes.tsx";
import NetworksPage from "./pages/networks/networks.tsx";
import NetworksInspect from "./pages/networks/networks-inspect.tsx";
import DockerCleanerPage from "./pages/cleaner/cleaner.tsx";
import {ComposePage} from "./pages/compose/compose-page.tsx";
import {useEditorUrl} from "./lib/editor.ts";
import ContainerInspectPage from "./pages/containers/inspect.tsx";

export function App() {
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
                                    {/*todo*/}
                                    {/*<Route path="/" element={<HomeRedirect/>}/>*/}
                                    <Route index element={<Navigate to="local" replace/>}/>

                                    <Route path=":host">
                                        <Route index element={<Navigate to="files" replace/>}/>

                                        <Route path="test" element={<TestPage/>}/>

                                        <Route path="files">
                                            <Route index element={<HomeRedirect/>}/>
                                            {/*<Route index element={<ComposePage/>}/>*/}
                                            <Route path="*" element={<ComposePage/>}/>
                                        </Route>

                                        <Route path="stats">
                                            <Route index element={<DashboardPage/>}/>
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

// Redirect component that reads from TabsProvider
// todo
function HomeRedirect() {
    const {activeTab, tabs} = useTabs();
    const editorUrl = useEditorUrl()

    const path = activeTab
        ? editorUrl(activeTab, tabs[activeTab])
        : `compose`;

    return <Navigate to={path} replace/>;
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
        <HostProvider>
            <AliasProvider>
                <UserConfigProvider>
                    <ChangelogProvider>
                        <TabsProvider>
                            <Outlet/>
                        </TabsProvider>
                    </ChangelogProvider>
                </UserConfigProvider>
            </AliasProvider>
        </HostProvider>
    );
};

const TestPage = () => {
    const host = useHost()

    return (
        <div>
            Hello {host}
        </div>
    );
};

const darkTheme = createTheme({
    palette: {
        mode: 'dark',
        primary:
            {
                main: '#90caf9',
            }
        ,
        secondary: {
            main: '#f48fb1',
        }
        ,
        background: {
            default:
                '#121212',
            paper:
                '#1e1e1e',
        }
        ,
    }
    ,
    typography: {
        fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
    }
    ,
    components: {
        MuiDrawer: {
            styleOverrides: {
                paper: {
                    backgroundColor: '#1a1a1a',
                }
                ,
            }
            ,
        }
        ,
    }
    ,
});


const styles: {
    [key
    :
    string
        ]:
        React.CSSProperties
} = {
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
