import {type JSX, useEffect, useMemo, useRef, useState} from 'react';
import {Navigate, Outlet, useLocation, useNavigate, useParams} from 'react-router-dom';
import {Box, CircularProgress, IconButton, Tab, Tabs, Tooltip, Typography} from '@mui/material';
import {FileList} from "./components/file-list.tsx";
import {ClearAll, Close} from '@mui/icons-material';
import ActionSidebar from "./components/action-sidebar.tsx";
import CoreComposeEmpty, {InvalidAlias} from "./compose-empty.tsx";
import {LogsPanel} from "./components/logs-panel.tsx";
import FileIcon, {getExt} from "./components/file-icon.tsx";
import ViewerSqlite from "./components/viewer-sqlite.tsx";
import ViewerText from "./components/viewer-text.tsx";
import ViewerDockyaml, {formatDockyaml} from "./components/viewer-dockyml.tsx";
import {useFileComponents} from "./state/terminal.tsx";
import {TabsProvider, useTabs, useTabsStore} from "../../context/tab-context.tsx";
import FilesProvider from "../../context/file-context.tsx";
import FileSearch from "./dialogs/file-search.tsx";
import FileCreate from "./dialogs/file-create.tsx";
import FileDelete from "./dialogs/file-delete.tsx";
import FileRename from "./dialogs/file-rename.tsx";
import {useAliasStore, useCompactMode, useLastOpened} from "./state/files.ts";
import AliasProvider, {useAlias} from "../../context/alias-context.tsx";
import AliasDialog from "./components/add-alias-dialog.tsx";
import useResizeBar from "./hooks/resize-hook.ts";

export function FilesLayout() {
    const {host = 'local'} = useParams<{ host: string }>()

    return (
        <AliasProvider key={host}>
            <TabsProvider>
                <Outlet/>
            </TabsProvider>
        </AliasProvider>
    );
}

function FileIndexRedirect() {
    const lastUrl = useLastOpened(state => state.lastEditorUrl)
    const {aliases} = useAlias()
    const {host = 'local'} = useParams<{ host: string }>()

    const lastUrlHost = lastUrl.split('/')[1]
    const path = lastUrl && lastUrlHost === host
        ? lastUrl
        : aliases.at(0)?.alias
            ? `/${host}/files/${aliases[0].alias}`
            : '';

    console.log("last path", path, aliases.at(0)?.alias)

    if (!path) {
        return <InvalidAlias/>
    }

    console.log(`Nav to ${path}`)

    return <Navigate to={path} replace/>;
}

export default FileIndexRedirect

export const ComposePage = () => {
    const location = useLocation()
    const setLast = useLastOpened(state => state.setUrl)

    useEffect(() => {
        const fullPath = location.pathname + location.search + location.hash;
        setLast(fullPath)
    }, [location.pathname, location.search, location.hash, setLast]);

    const {aliases, isLoading} = useAlias();
    const {host, alias} = useFileComponents();

    const isEmpty = aliases.length === 0;
    if (isLoading && isEmpty) {
        return (
            <Box sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100vh',
            }}>
                <CircularProgress size={40} thickness={5}/>
                <Typography
                    variant="body2"
                    sx={{
                        color: "text.secondary",
                        mt: 2,
                        fontWeight: 700
                    }}>
                    Loading aliases...
                </Typography>
            </Box>
        );
    }

    const validAlias = aliases.find(value => value.alias === alias);
    if (isEmpty || !alias || !validAlias) {
        return <InvalidAlias/>
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
            <AliasDialog host={host}/>
        </FilesProvider>
    )
}

export const ComposePageInner = () => {
    const {filename, alias, splitFilename} = useFileComponents()

    const setAlias = useAliasStore(state => state.setAlias)
    useEffect(() => {
        setAlias(alias)
    }, [alias, setAlias]);

    const containerRef = useRef<HTMLDivElement>(null);
    const [containerWidth, setContainerWidth] = useState(1200);

    useEffect(() => {
        if (!containerRef.current) return;
        const observer = new ResizeObserver(([entry]) => {
            setContainerWidth(entry.contentRect.width);
        });
        observer.observe(containerRef.current);
        return () => observer.disconnect();
    }, []);

    const {panelRef, panelSize, handleMouseDown, cursor} =
        useResizeBar('right',
            800,
            150,
            containerWidth - 150);

    const needSplit = !!splitFilename

    return (
        <Box sx={{
            display: 'flex',
            height: '100vh',
            width: '100%',
            overflow: 'hidden'
        }}>
            <ActionSidebar/>

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

                    {/* Left editor - resizable */}
                    <Box
                        ref={panelRef}
                        sx={{
                            flexGrow: needSplit ? 0 : 1,
                            width: needSplit ? panelSize : 'auto',
                            flexShrink: needSplit ? 0 : 1,
                            display: 'flex',
                            flexDirection: 'column',
                            overflow: 'hidden'
                        }}
                    >
                        <FileTabBar track={0}/>
                        <Box sx={{
                            flexGrow: 1,
                            overflow: 'auto',
                            display: 'flex',
                            flexDirection: 'column'
                        }}>
                            {!filename ?
                                <CoreComposeEmpty/> :
                                <CoreCompose filename={filename} track={0}/>
                            }
                        </Box>
                    </Box>

                    {needSplit && (
                        <>
                            {/* Resize handle */}
                            <Box
                                onMouseDown={handleMouseDown}
                                sx={{
                                    width: '4px',
                                    flexShrink: 0,
                                    cursor: cursor,
                                    backgroundColor: 'divider',
                                    '&:hover': {
                                        backgroundColor: 'primary.main',
                                    },
                                    transition: 'background-color 0.2s',
                                }}
                            />

                            {/* Right editor - takes remaining space */}
                            <Box sx={{
                                flexGrow: 1,
                                display: 'flex',
                                flexDirection: 'column',
                                overflow: 'hidden'
                            }}>
                                <FileTabBar track={1}/>
                                <Box sx={{
                                    flexGrow: 1,
                                    overflow: 'auto',
                                    display: 'flex',
                                    flexDirection: 'column'
                                }}>
                                    {!splitFilename ?
                                        <CoreComposeEmpty/> :
                                        <CoreCompose filename={splitFilename} track={1}/>
                                    }
                                </Box>
                            </Box>
                        </>
                    )}
                </Box>
                <LogsPanel/>
            </Box>
        </Box>
    );
};

interface TabLabel {
    name: string;
    // disambiguating parent folder, only set when several open tabs share
    // the same file name (VS Code behavior)
    hint: string;
}

// buildTabLabels labels every tab with its file name, adding the parent
// folder as a hint when open tabs collide on the same name — and walking up
// the path while the hints themselves collide (bounded, most trees are flat).
function buildTabLabels(filenames: string[]): Map<string, TabLabel> {
    const byBase = new Map<string, string[]>();
    for (const f of filenames) {
        const base = f.split('/').pop() ?? f;
        byBase.set(base, [...(byBase.get(base) ?? []), f]);
    }

    const labels = new Map<string, TabLabel>();
    for (const [base, paths] of byBase) {
        if (paths.length === 1) {
            labels.set(paths[0], {name: base, hint: ''});
            continue;
        }

        let hints: string[] = [];
        for (let depth = 1; depth <= 3; depth++) {
            hints = paths.map(p => {
                const parts = p.split('/');
                return parts.slice(Math.max(0, parts.length - 1 - depth), -1).join('/');
            });
            if (new Set(hints).size === paths.length) break;
        }
        paths.forEach((p, i) => labels.set(p, {name: base, hint: hints[i]}));
    }
    return labels;
}

const FileTabBar = ({track}: { track: number }) => {
    const {filename, splitFilename, host, alias} = useFileComponents()
    const currentFilename = track === 0 ? filename : (splitFilename ?? '')

    const navigate = useNavigate();
    const {closeTab, onTabClick, closeAllTabs} = useTabs();
    const reorderTab = useTabsStore(state => state.reorder);
    // Chrome-style drag: the dragged tab slides into the hovered slot live
    const [draggedTab, setDraggedTab] = useState<string | null>(null);

    const contextKey = `${host}/${alias}`
    const compact = useCompactMode(state => state.enabled)
    const tabMinHeight = compact ? 34 : undefined

    const contextTabs = useTabsStore(state => state.contextTabs)[contextKey]
    const tabs = useMemo(() => contextTabs?.[track] ?? new Set<string>(), [contextTabs, track])
    const activeTab = useTabsStore(state => state.lastOpened[track])

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const tabNames = Array.from(tabs);

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
                onTabClick(name, track);
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [navigate, tabs, activeTab, onTabClick, track])

    const tablist = useMemo(() => {
        return Array.from(tabs);
    }, [tabs])

    const tabLabels = useMemo(() => buildTabLabels(tablist), [tablist])

    return (
        <Box
            sx={{borderBottom: 1, borderColor: 'divider', flexShrink: 0, display: 'flex', alignItems: 'center'}}
            // accept drops over the whole strip (gaps, whitespace) so no
            // release point triggers the browser's snap-back animation
            onDragOver={(e) => {
                if (!draggedTab) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
            }}
            onDrop={(e) => e.preventDefault()}
        >
            <Tabs
                value={currentFilename}
                onChange={(_event, value) => onTabClick(value as string, track)}
                variant="scrollable"
                scrollButtons="auto"
                sx={{minHeight: tabMinHeight, flexGrow: 1, minWidth: 0}}
                slotProps={{
                    // the sliding underline chasing tabs mid-drag reads as
                    // the drop not having happened — freeze it while dragging
                    indicator: {sx: {transition: draggedTab ? 'none' : undefined}},
                }}
            >
                {tablist.map((tabFilename) => {
                    const label = tabLabels.get(tabFilename) ?? {
                        name: tabFilename.split('/').pop() ?? tabFilename,
                        hint: '',
                    };
                    return (
                        <Tab
                            key={tabFilename}
                            value={tabFilename}
                            draggable
                            onDragStart={(e) => {
                                e.dataTransfer.effectAllowed = 'move';
                                setDraggedTab(tabFilename);
                            }}
                            onDragOver={(e) => {
                                if (!draggedTab) return;
                                // always accept the drop — releasing over an
                                // unaccepted zone (including the dragged tab
                                // itself) plays the browser's translucent
                                // snap-back-to-origin animation
                                e.preventDefault();
                                e.dataTransfer.dropEffect = 'move';
                                if (draggedTab === tabFilename) return;
                                // Only swap once the pointer crosses the middle of the
                                // hovered tab in the travel direction: tabs have
                                // variable widths, and swapping on first contact makes
                                // the swapped-in neighbor land under the pointer and
                                // swap straight back — a visible jitter loop.
                                const rect = e.currentTarget.getBoundingClientRect();
                                const middle = rect.left + rect.width / 2;
                                const from = tablist.indexOf(draggedTab);
                                const to = tablist.indexOf(tabFilename);
                                if (to > from && e.clientX < middle) return;
                                if (to < from && e.clientX > middle) return;
                                reorderTab(draggedTab, to, track);
                            }}
                            onDrop={(e) => e.preventDefault()}
                            onDragEnd={() => setDraggedTab(null)}
                            sx={{
                                textTransform: 'none',
                                p: 0.5,
                                minHeight: tabMinHeight,
                                maxWidth: 200,
                                opacity: draggedTab === tabFilename ? 0.4 : 1,
                            }}
                            label={
                                <Box sx={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 0.75,
                                    px: 0.5,
                                    minWidth: 0,
                                    // the icon slot doubles as the close button on
                                    // hover — no reserved width, no layout shift
                                    '&:hover .tab-icon': {opacity: 0},
                                    '&:hover .tab-close': {opacity: 1},
                                }}>
                                    <Box sx={{position: 'relative', width: 18, height: 18, flexShrink: 0}}>
                                        <Box
                                            className="tab-icon"
                                            sx={{
                                                position: 'absolute',
                                                inset: 0,
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                transition: 'opacity 0.1s',
                                                '& img': {width: 16, height: 16},
                                                '& svg': {fontSize: 16},
                                            }}
                                        >
                                            <FileIcon filename={tabFilename}/>
                                        </Box>
                                        <IconButton
                                            className="tab-close"
                                            size="small"
                                            component="div"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                closeTab(tabFilename, track)
                                            }}
                                            sx={{
                                                position: 'absolute',
                                                inset: 0,
                                                p: 0,
                                                opacity: 0,
                                                transition: 'opacity 0.1s',
                                            }}
                                        >
                                            <Close sx={{fontSize: '1rem'}}/>
                                        </IconButton>
                                    </Box>
                                    <Tooltip title={tabFilename}>
                                        <Box sx={{
                                            display: 'flex',
                                            alignItems: 'baseline',
                                            gap: 0.6,
                                            minWidth: 0,
                                        }}>
                                            <Typography component="span" variant="body2" noWrap>
                                                {label.name.slice(0, 19)}
                                            </Typography>
                                            {label.hint && (
                                                <Typography component="span" variant="caption" noWrap sx={{
                                                    color: 'text.secondary',
                                                    fontSize: '0.7rem',
                                                    maxWidth: 84,
                                                }}>
                                                    · {label.hint}
                                                </Typography>
                                            )}
                                        </Box>
                                    </Tooltip>
                                </Box>
                            }
                        />
                    );
                })}
            </Tabs>
            {tablist.length > 0 && (
                <Tooltip title="Close all tabs">
                    <IconButton
                        size="small"
                        onClick={() => closeAllTabs(track)}
                        sx={{
                            mx: 0.5,
                            flexShrink: 0,
                            color: 'text.secondary',
                            '&:hover': {color: 'error.main', bgcolor: 'action.hover'},
                        }}
                    >
                        <ClearAll sx={{fontSize: 18}}/>
                    </IconButton>
                </Tooltip>
            )}
        </Box>
    );
};

const specialFileSupport = (filename: string): Map<string, JSX.Element> => new Map([
    ["db", <ViewerSqlite filename={filename}/>],
])

const CoreCompose = ({filename, track}: { filename: string, track: number }) => {
    const {host, alias} = useFileComponents()

    if (filename === formatDockyaml(alias, host)) {
        return <ViewerDockyaml filename={filename}/>
    }

    const ext = getExt(filename)

    const viewer = specialFileSupport(filename).get(ext)
    if (viewer) {
        return viewer
    }

    return <ViewerText filename={filename} track={track}/>;
};
