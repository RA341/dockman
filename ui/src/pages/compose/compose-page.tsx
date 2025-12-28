import {type JSX, useEffect, useMemo} from 'react';
import {Navigate, Outlet, useNavigate} from 'react-router-dom';
import {
    Box,
    Button,
    CircularProgress,
    Container,
    IconButton,
    MenuItem,
    Paper,
    Stack,
    Tab,
    Tabs,
    TextField,
    Tooltip,
    Typography
} from '@mui/material';
import {FileList} from "./components/file-list.tsx";
import {Close, FolderOffOutlined as ErrorIcon, SettingsOutlined as SettingsIcon} from '@mui/icons-material';
import ActionBar from "./components/action-bar.tsx";
import CoreComposeEmpty from "./compose-empty.tsx";
import {LogsPanel} from "./components/logs-panel.tsx";
import {getExt} from "./components/file-icon.tsx";
import ViewerSqlite from "./components/viewer-sqlite.tsx";
import TextEditor from "./components/viewer-text.tsx";
import {useFileComponents, useTerminalTabs} from "./state/terminal.tsx";
import {TabsProvider, useTabs, useTabsStore} from "../../context/tab-context.tsx";
import FilesProvider from "../../context/file-context.tsx";
import FileSearch from "./dialogs/file-search.tsx";
import FileCreate from "./dialogs/file-create.tsx";
import FileDelete from "./dialogs/file-delete.tsx";
import FileRename from "./dialogs/file-rename.tsx";
import {useAliasStore, useHostStore} from "./state/files.ts";
import AliasProvider, {useAlias} from "../../context/alias-context.tsx";
import FolderIcon from "@mui/icons-material/Folder";
import {useEditorUrl} from "../../lib/editor.ts";

export function FilesLayout() {
    return (
        <AliasProvider>
            <TabsProvider>
                <Outlet/>
            </TabsProvider>
        </AliasProvider>
    );
}

export function FileIndexRedirect() {
    const lastOpened = useTabsStore(state => state.lastOpened);
    const tabs = useTabsStore(state => state.allTabs);

    const editorUrl = useEditorUrl()
    const {aliases} = useAlias()

    const path = lastOpened
        ? editorUrl(lastOpened, tabs[lastOpened])
        : aliases.at(0)?.alias ?? '';

    return <Navigate to={path} replace/>;
}


export const ComposePage = () => {
    const {aliases, isLoading} = useAlias();
    const {host, alias} = useFileComponents();
    const navigate = useNavigate();

    if (isLoading) {
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
                    Loading aliases...
                </Typography>
            </Box>
        );
    }

    const validAlias = aliases.find(value => value.alias === alias);

    if (!validAlias) {
        return (
            <Box sx={{
                height: '100vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                p: 3
            }}>
                <Container maxWidth="sm">
                    <Paper
                        variant="outlined"
                        sx={{
                            p: 6,
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
                        <Box sx={{
                            p: 2, borderRadius: '50%', bgcolor: 'error.lighter',
                            color: 'error.main', mb: 3, display: 'flex'
                        }}>
                            <ErrorIcon sx={{fontSize: 40}}/>
                        </Box>

                        <Typography variant="h5" sx={{fontWeight: 800, mb: 1}}>
                            Invalid Directory Alias
                        </Typography>
                        <Typography variant="body1" color="text.secondary" sx={{mb: 3}}>
                            The alias <Typography component="span" variant="caption" sx={{
                            fontFamily: 'monospace',
                            fontWeight: 700,
                            px: 0.5
                        }}>{alias}</Typography> is not registered on this host.
                        </Typography>

                        <Stack direction="row" spacing={2}>
                            <Button
                                variant="contained"
                                startIcon={<SettingsIcon/>}
                                onClick={() => navigate('/settings')}
                                sx={{borderRadius: 2, fontWeight: 700, boxShadow: 'none'}}
                            >
                                Add alias
                            </Button>

                            <TextField
                                select
                                label="Switch Alias"
                                value={""}
                                onChange={(e) => navigate(`/${host}/files/${e.target.value}`)}
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
                                {aliases.map((f) => (
                                    <MenuItem key={f.alias} value={f.alias}>
                                        <Stack direction="row" spacing={1} alignItems="center">
                                            <FolderIcon sx={{fontSize: 18, color: 'text.disabled'}}/>
                                            <Typography variant="body2" sx={{fontWeight: 600}}>
                                                {f.alias}
                                            </Typography>
                                        </Stack>
                                    </MenuItem>
                                ))}
                            </TextField>
                        </Stack>
                    </Paper>
                </Container>
            </Box>
        );
    }

    return (
        <FilesProvider>
            <Box sx={{
                display: 'flex',
                flexDirection: 'column',
                height: '100vh',
                overflow: 'hidden',
                bgcolor: 'background.default'
            }}>
                <Box sx={{flexGrow: 1, minHeight: 0, position: 'relative'}}>
                    <ComposePageInner/>
                </Box>
                <FileCreate/>
                <FileSearch/>
                <FileDelete/>
                <FileRename/>
            </Box>
        </FilesProvider>
    )
}

export const ComposePageInner = () => {
    const {filename, alias} = useFileComponents()
    const setAlias = useAliasStore(state => state.setAlias)
    useEffect(() => {
        setAlias(alias)
    }, [alias]);

    const clearTabs = useTerminalTabs(state => state.clearAll)
    const host = useHostStore(state => state.host)
    useEffect(() => {
        clearTabs()
    }, [clearTabs, host]);

    return (
        <Box sx={{
            display: 'flex',
            height: '100vh',
            width: '100%',
            overflow: 'hidden'
        }}>
            <ActionBar/>

            <Box sx={{
                flexGrow: 1,
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden'
            }}>
                {/* Main content area */}
                <Box sx={{
                    display: 'flex',
                    flexGrow: 1,
                    overflow: 'hidden'
                }}>
                    <FileList/>

                    <Box sx={{
                        flexGrow: 1,
                        display: 'flex',
                        flexDirection: 'column',
                        overflow: 'hidden'
                    }}>
                        <FileTabBar/>
                        <Box sx={{
                            flexGrow: 1,
                            overflow: 'auto',
                            display: 'flex',
                            flexDirection: 'column'
                        }}>
                            {!filename ?
                                <CoreComposeEmpty/> :
                                <CoreCompose/>
                            }
                        </Box>
                    </Box>
                </Box>
                <LogsPanel/>
            </Box>
        </Box>
    );
};

function getTabName(filename: string): string {
    const s = filename.split("/").pop() ?? filename;
    return s.slice(0, 19) // max name limit of 19 chars
}

const FileTabBar = () => {
    const {filename} = useFileComponents()

    const navigate = useNavigate();
    const {closeTab, onTabClick} = useTabs();

    const {host} = useHostStore.getState();
    const {alias} = useAliasStore.getState();
    const contextKey = `${host}/${alias}`;

    const tabs = useTabsStore(state => state.contextTabs)[contextKey] ?? {}
    const activeTab = useTabsStore(state => state.lastOpened)

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const tabNames = Object.keys(tabs);

            if (e.altKey && !e.ctrlKey && !e.shiftKey && !e.repeat && (e.key == "ArrowLeft" || e.key == "ArrowRight")) {
                let currentIndex = tabNames.indexOf(activeTab);

                switch (e.key) {
                    case "ArrowLeft": {
                        e.preventDefault();
                        if (currentIndex > 0) {
                            currentIndex--;
                        }
                        break;
                    }
                    case "ArrowRight": {
                        e.preventDefault();
                        if (currentIndex < tabNames.length - 1) {
                            currentIndex++
                        }
                        break;
                    }
                }

                const name = tabNames[currentIndex]
                onTabClick(name);
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [navigate, tabs, activeTab, onTabClick])

    const tablist = useMemo(() => {
        return Array.from(tabs);
    }, [tabs])

    return (
        <Box sx={{borderBottom: 1, borderColor: 'divider', flexShrink: 0}}>
            <Tabs
                value={filename}
                onChange={(_event, value) => onTabClick(value as string)}
                variant="scrollable"
                scrollButtons="auto"
            >
                {tablist.map((tabFilename) => (
                    <Tab
                        key={tabFilename}
                        value={tabFilename}
                        sx={{textTransform: 'none', p: 0.5}}
                        label={
                            <Box sx={{
                                display: 'flex',
                                alignItems: 'center',
                                px: 1
                            }}>
                                <Tooltip title={tabFilename}>
                                    <span>{getTabName(tabFilename)}</span>
                                </Tooltip>
                                <IconButton
                                    size="small"
                                    component="div"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        closeTab(tabFilename)
                                    }}
                                    sx={{ml: 1.5}}
                                >
                                    <Close sx={{fontSize: '1rem'}}/>
                                </IconButton>
                            </Box>
                        }
                    />
                ))}
            </Tabs>
        </Box>
    );
};

const CoreCompose = () => {
    const {filename} = useFileComponents()

    const ext = getExt(filename!)

    const specialFileSupport: Map<string, JSX.Element> = new Map([
        ["db", <ViewerSqlite/>],
    ])

    const viewer = specialFileSupport.get(ext)
    if (viewer) {
        return viewer
    }

    return <TextEditor/>;
};
