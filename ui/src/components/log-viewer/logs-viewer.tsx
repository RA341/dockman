import {type CSSProperties, type ReactNode, useCallback, useEffect, useMemo, useRef, useState} from "react";
import {
    Box,
    Chip,
    IconButton,
    InputAdornment,
    MenuItem,
    Popover,
    Select,
    Stack,
    TextField,
    Tooltip,
    Typography,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import FilterAltIcon from "@mui/icons-material/FilterAlt";
import KeyboardArrowUpIcon from "@mui/icons-material/KeyboardArrowUp";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import WrapTextIcon from "@mui/icons-material/WrapText";
import VerticalAlignBottomIcon from "@mui/icons-material/VerticalAlignBottom";
import PauseIcon from "@mui/icons-material/Pause";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import DeleteSweepIcon from "@mui/icons-material/DeleteSweep";
import RefreshIcon from "@mui/icons-material/Refresh";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import CheckIcon from "@mui/icons-material/Check";
import DownloadIcon from "@mui/icons-material/Download";
import DateRangeIcon from "@mui/icons-material/DateRange";
import LocalOfferIcon from "@mui/icons-material/LocalOffer";
import TagIcon from "@mui/icons-material/Tag";
import LightModeIcon from "@mui/icons-material/LightMode";
import DarkModeIcon from "@mui/icons-material/DarkMode";
import scrollbarStyles from "../scrollbar-style.tsx";
import {ANSI_PALETTE_DARK, ANSI_PALETTE_LIGHT, type AnsiSegment} from "./ansi.ts";
import {useCopyButton} from "../../hooks/copy.ts";
import {
    compileQuery,
    containerColor,
    formatLogTime,
    highlightSegments,
    type LogEntry,
    type LogQuery,
    logsToText,
    matchesQuery,
    STREAM_INTERNAL,
} from "./log-model.ts";
import {type LogStreamStatus, useLogsStream} from "./use-logs-stream.ts";

export interface LogsViewerContainer {
    id: string;
    name?: string;
}

interface LogsViewerProps {
    containers: LogsViewerContainer[];
    // hidden tabs pass false: the stream suspends (buffer kept) and the view
    // snaps back to the bottom when shown again
    isActive?: boolean;
}

// scroll distance from the bottom under which the view is considered "at the
// bottom" and auto-scroll stays engaged
const BOTTOM_STICKINESS_PX = 40;

const PREF_TIMESTAMPS = 'dockman-logs-timestamps';
const PREF_WRAP = 'dockman-logs-wrap';
const PREF_TAIL = 'dockman-logs-tail';
const PREF_NAMES = 'dockman-logs-names';
const PREF_LINE_NUMBERS = 'dockman-logs-linenumbers';
const PREF_FONT_SIZE = 'dockman-logs-fontsize';
const PREF_LIGHT = 'dockman-logs-light';

const TAIL_OPTIONS = [100, 500, 1000, 2000];
const FONT_SIZES = [10, 12, 14, 16];

type StreamFilter = 'all' | 'stdout' | 'stderr';

// same default stack as Dockhand's "System Monospace"
const LOG_FONT = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';

interface ViewerTheme {
    bg: string;
    fg: string;
    timestamp: string;
    lineNumber: string;
    lineNumberSep: string;
    singleName: string;
    ansi: string[];
}

// backgrounds match Dockhand: zinc-950 dark, gray-50 light
const DARK_THEME: ViewerTheme = {
    bg: '#09090b',
    fg: '#CCCCCC',
    timestamp: '#858585',
    lineNumber: '#6a6a6a',
    lineNumberSep: 'rgba(255,255,255,0.18)',
    singleName: '#9e9e9e',
    ansi: ANSI_PALETTE_DARK,
};

const LIGHT_THEME: ViewerTheme = {
    bg: '#f9fafb',
    fg: '#1f1f1f',
    timestamp: '#8a8a8a',
    lineNumber: '#9e9e9e',
    lineNumberSep: 'rgba(0,0,0,0.18)',
    singleName: '#757575',
    ansi: ANSI_PALETTE_LIGHT,
};

const STATUS_META: Record<LogStreamStatus, { label: string; color: string }> = {
    idle: {label: 'Idle', color: '#9e9e9e'},
    connecting: {label: 'Connecting', color: '#ffb74d'},
    live: {label: 'Live', color: '#66bb6a'},
    reconnecting: {label: 'Reconnecting', color: '#ffb74d'},
    paused: {label: 'Paused', color: '#9e9e9e'},
    ended: {label: 'Ended', color: '#64b5f6'},
};

const readBoolPref = (key: string, fallback: boolean) => {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : raw === 'true';
};

const segmentStyle = (s: AnsiSegment, ansi: string[]): CSSProperties => ({
    color: s.color ?? (s.colorIdx !== undefined ? ansi[s.colorIdx] : undefined),
    backgroundColor: s.background ?? (s.backgroundIdx !== undefined ? ansi[s.backgroundIdx] : undefined),
    fontWeight: s.bold ? 700 : undefined,
    opacity: s.dim ? 0.6 : undefined,
    fontStyle: s.italic ? 'italic' : undefined,
    textDecoration: s.underline ? 'underline' : undefined,
});

const streamBorder = (stream: number) => {
    if (stream === STREAM_INTERNAL) return 'rgba(255,167,38,0.8)'; // dockman notice
    if (stream === 2) return 'rgba(244,67,54,0.55)'; // stderr
    return 'transparent';
};

function LogRow({entry, lineNumber, query, isCurrentMatch, showTimestamps, showLineNumbers, showName, nameColor, wrap, theme}: {
    entry: LogEntry;
    lineNumber: number;
    query: LogQuery | null;
    isCurrentMatch: boolean;
    showTimestamps: boolean;
    showLineNumbers: boolean;
    showName: boolean;
    nameColor: string;
    wrap: boolean;
    theme: ViewerTheme;
}) {
    const isInternal = entry.stream === STREAM_INTERNAL;

    let content: ReactNode;
    if (query === null) {
        // fast path: no search, render the parsed segments directly
        content = entry.segments.map((s, i) => (
            <span key={i} style={segmentStyle(s, theme.ansi)}>{s.text}</span>
        ));
    } else {
        content = highlightSegments(entry.segments, query).map((piece, i) => {
            const style = segmentStyle(piece.segment, theme.ansi);
            if (!piece.isMatch) {
                return <span key={i} style={style}>{piece.segment.text}</span>;
            }
            return (
                <mark
                    key={i}
                    style={{
                        ...style,
                        backgroundColor: isCurrentMatch ? 'rgba(255,193,7,0.95)' : 'rgba(255,193,7,0.4)',
                        color: isCurrentMatch ? '#000' : style.color ?? theme.fg,
                    }}
                >
                    {piece.segment.text}
                </mark>
            );
        });
    }

    return (
        <div
            data-log-id={entry.id}
            // rendered by the container's ::before rule: pseudo-element text is
            // not selectable and, unlike a user-select:none span, does not
            // block a selection that starts over the gutter
            data-ln={showLineNumbers ? lineNumber : undefined}
            style={{
                whiteSpace: wrap ? 'pre-wrap' : 'pre',
                wordBreak: wrap ? 'break-all' : 'normal',
                borderLeft: `2px solid ${streamBorder(entry.stream)}`,
                paddingLeft: 6,
                minHeight: '1.4em',
                lineHeight: 1.4,
                fontStyle: isInternal ? 'italic' : undefined,
                opacity: isInternal ? 0.85 : undefined,
            }}
        >
            {showTimestamps && entry.timeNano !== 0n && (
                <span style={{color: theme.timestamp}}>{formatLogTime(entry.timeNano)} </span>
            )}
            {showName && entry.containerName !== "" && (
                <span style={{color: nameColor, fontWeight: 600}}>[{entry.containerName}] </span>
            )}
            {content}
        </div>
    );
}

const selectSx = {fontSize: '0.8rem', '& .MuiSelect-select': {py: 0.5}};

function ToolbarSelect<T extends string | number>({value, onChange, options}: {
    value: T;
    onChange: (value: T) => void;
    options: { value: T; label: string }[];
}) {
    return (
        <Select
            size="small"
            value={value}
            onChange={(e) => onChange(e.target.value as T)}
            sx={selectSx}
        >
            {options.map(option => (
                <MenuItem key={String(option.value)} value={option.value} sx={{fontSize: '0.8rem'}}>
                    {option.label}
                </MenuItem>
            ))}
        </Select>
    );
}

const toolbarRowSx = {
    px: 1, py: 0.5,
    borderBottom: '1px solid', borderColor: 'divider',
    flexShrink: 0, bgcolor: '#1E1E1E', position: 'relative', zIndex: 1,
};

export function LogsViewer({containers, isActive = true}: LogsViewerProps) {
    const isMerged = containers.length > 1;
    const hasNames = containers.some(c => c.name !== undefined) || !isMerged;

    // merged view: chips hide a container's lines from display only — the
    // stream keeps running for all of them so the scrollback survives toggles
    const [disabledIds, setDisabledIds] = useState<ReadonlySet<string>>(new Set());

    const [query, setQuery] = useState("");
    const [filterMode, setFilterMode] = useState(false);
    const [currentMatch, setCurrentMatch] = useState(0);
    const [streamFilter, setStreamFilter] = useState<StreamFilter>('all');

    const [showTimestamps, setShowTimestamps] = useState(() => readBoolPref(PREF_TIMESTAMPS, false));
    const [wrap, setWrap] = useState(() => readBoolPref(PREF_WRAP, true));
    const [showNames, setShowNames] = useState(() => readBoolPref(PREF_NAMES, true));
    const [showLineNumbers, setShowLineNumbers] = useState(() => readBoolPref(PREF_LINE_NUMBERS, false));
    const [light, setLight] = useState(() => readBoolPref(PREF_LIGHT, false));
    const [tail, setTail] = useState(() => Number(localStorage.getItem(PREF_TAIL)) || 1000);
    const [fontSize, setFontSize] = useState(() => Number(localStorage.getItem(PREF_FONT_SIZE)) || 12);

    const [paused, setPaused] = useState(false);
    const [autoScroll, setAutoScroll] = useState(true);
    const [reloadKey, setReloadKey] = useState(0);

    // time range: unix seconds once applied; an upper bound ends the stream
    const [range, setRange] = useState<{ since?: number; until?: number }>({});
    const [rangeAnchor, setRangeAnchor] = useState<HTMLElement | null>(null);
    const [sinceInput, setSinceInput] = useState("");
    const [untilInput, setUntilInput] = useState("");

    const theme = light ? LIGHT_THEME : DARK_THEME;

    const allIds = useMemo(() => containers.map(c => c.id), [containers]);
    const {entries, status, lastError, clear} = useLogsStream({
        containerIds: allIds,
        tail,
        since: range.since,
        until: range.until,
        follow: range.until === undefined,
        paused: paused || !isActive,
        reloadKey,
    });

    const handleReload = () => {
        setPaused(false);
        setAutoScroll(true);
        setReloadKey(k => k + 1);
    };

    const boolToggle = (key: string, set: (fn: (prev: boolean) => boolean) => void) => () => set(prev => {
        localStorage.setItem(key, String(!prev));
        return !prev;
    });
    const toggleTimestamps = boolToggle(PREF_TIMESTAMPS, setShowTimestamps);
    const toggleWrap = boolToggle(PREF_WRAP, setWrap);
    const toggleNames = boolToggle(PREF_NAMES, setShowNames);
    const toggleLineNumbers = boolToggle(PREF_LINE_NUMBERS, setShowLineNumbers);
    const toggleLight = boolToggle(PREF_LIGHT, setLight);

    const changeTail = (value: number) => {
        localStorage.setItem(PREF_TAIL, String(value));
        setTail(value);
    };
    const changeFontSize = (value: number) => {
        localStorage.setItem(PREF_FONT_SIZE, String(value));
        setFontSize(value);
    };

    const logQuery = useMemo(() => compileQuery(query), [query]);
    const displayed = useMemo(() => {
        const wantedStream = streamFilter === 'stdout' ? 1 : streamFilter === 'stderr' ? 2 : 0;
        let visible = entries;
        if (isMerged && disabledIds.size > 0) {
            visible = visible.filter(e => !disabledIds.has(e.containerId) || e.stream === STREAM_INTERNAL);
        }
        if (wantedStream !== 0) {
            visible = visible.filter(e => e.stream === wantedStream || e.stream === STREAM_INTERNAL);
        }
        if (filterMode && logQuery) {
            visible = visible.filter(e => matchesQuery(e, logQuery));
        }
        return visible;
    }, [entries, isMerged, disabledIds, streamFilter, filterMode, logQuery]);

    const matchIds = useMemo(
        () => (logQuery ? displayed.filter(e => matchesQuery(e, logQuery)).map(e => e.id) : []),
        [displayed, logQuery],
    );
    // single clamped cursor: the raw state may go stale when matches shrink
    const boundedMatch = matchIds.length === 0 ? 0 : Math.min(currentMatch, matchIds.length - 1);
    const currentMatchId = matchIds[boundedMatch];

    const colorFor = useCallback((containerId: string) => {
        if (!isMerged) return theme.singleName;
        const idx = containers.findIndex(c => c.id === containerId);
        return containerColor(idx < 0 ? 0 : idx);
    }, [containers, isMerged, theme.singleName]);

    // --- scrolling ---
    const scrollRef = useRef<HTMLDivElement | null>(null);
    const programmaticScroll = useRef(false);

    const scrollToBottom = useCallback(() => {
        const el = scrollRef.current;
        if (!el) return;
        programmaticScroll.current = true;
        el.scrollTop = el.scrollHeight;
        requestAnimationFrame(() => {
            programmaticScroll.current = false;
        });
    }, []);

    useEffect(() => {
        if (!autoScroll || paused || !isActive) return;
        scrollToBottom();
    }, [entries, autoScroll, paused, isActive, wrap, showTimestamps, fontSize, scrollToBottom]);

    const handleScroll = () => {
        if (programmaticScroll.current) return;
        const el = scrollRef.current;
        if (!el) return;
        const fromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
        if (fromBottom <= BOTTOM_STICKINESS_PX) {
            if (!autoScroll) setAutoScroll(true);
        } else if (autoScroll) {
            setAutoScroll(false);
        }
    };

    const scrollToEntry = useCallback((entryId: number) => {
        setAutoScroll(false);
        const el = scrollRef.current?.querySelector(`[data-log-id="${entryId}"]`);
        el?.scrollIntoView({block: 'center'});
    }, []);

    const goToMatch = useCallback((direction: 1 | -1) => {
        if (matchIds.length === 0) return;
        const next = (boundedMatch + direction + matchIds.length) % matchIds.length;
        setCurrentMatch(next);
        scrollToEntry(matchIds[next]);
    }, [matchIds, boundedMatch, scrollToEntry]);

    // --- clipboard / file export ---
    const {handleCopy: copyText, copiedId} = useCopyButton();
    const exportText = () => logsToText(displayed, showTimestamps, showNames && hasNames);
    const handleCopy = () => copyText(exportText());
    const handleDownload = () => {
        const label = isMerged ? 'stack' : (containers[0]?.name ?? containers[0]?.id.substring(0, 12) ?? 'container');
        const blob = new Blob([exportText()], {type: 'text/plain'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${label}-logs.txt`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    };

    // --- time range popover ---
    const applyRange = () => {
        const parse = (value: string) => {
            if (!value) return undefined;
            const ms = new Date(value).getTime();
            return Number.isNaN(ms) ? undefined : Math.floor(ms / 1000);
        };
        setRange({since: parse(sinceInput), until: parse(untilInput)});
        setRangeAnchor(null);
    };
    const clearRange = () => {
        setSinceInput("");
        setUntilInput("");
        setRange({});
        setRangeAnchor(null);
    };
    const rangeActive = range.since !== undefined || range.until !== undefined;

    const enabledCount = containers.length - disabledIds.size;
    const toggleContainer = (id: string) => {
        setDisabledIds(prev => {
            if (prev.has(id)) {
                const next = new Set(prev);
                next.delete(id);
                return next;
            }
            // never hide the last visible container
            if (enabledCount <= 1) return prev;
            return new Set(prev).add(id);
        });
    };

    const statusMeta = STATUS_META[status];
    const iconSx = (active: boolean) => ({
        color: active ? 'primary.main' : 'text.secondary',
        p: 0.5,
    });

    return (
        <Box sx={{height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden', bgcolor: theme.bg}}>
            {/* toolbar */}
            <Stack
                direction="row"
                spacing={0.5}
                useFlexGap
                sx={[{
                    alignItems: "center",
                    flexWrap: "wrap"
                }, ...(Array.isArray(toolbarRowSx) ? toolbarRowSx : [toolbarRowSx])]}>
                <TextField
                    size="small"
                    placeholder="Search logs..."
                    value={query}
                    onChange={(e) => {
                        setQuery(e.target.value);
                        setCurrentMatch(0);
                    }}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            goToMatch(e.shiftKey ? -1 : 1);
                        }
                    }}
                    sx={{width: 210, '& .MuiInputBase-root': {fontSize: '0.8rem'}}}
                    slotProps={{
                        input: {
                            startAdornment: (
                                <InputAdornment position="start">
                                    <SearchIcon sx={{fontSize: 16}}/>
                                </InputAdornment>
                            ),
                        },
                    }}
                />
                {logQuery && (
                    <>
                        <Typography variant="caption" sx={{color: 'text.secondary', minWidth: 48, textAlign: 'center'}}>
                            {matchIds.length === 0 ? '0/0' : `${boundedMatch + 1}/${matchIds.length}`}
                        </Typography>
                        <Tooltip title="Previous match (Shift+Enter)">
                            <IconButton size="small" sx={iconSx(false)} onClick={() => goToMatch(-1)}>
                                <KeyboardArrowUpIcon sx={{fontSize: 18}}/>
                            </IconButton>
                        </Tooltip>
                        <Tooltip title="Next match (Enter)">
                            <IconButton size="small" sx={iconSx(false)} onClick={() => goToMatch(1)}>
                                <KeyboardArrowDownIcon sx={{fontSize: 18}}/>
                            </IconButton>
                        </Tooltip>
                    </>
                )}
                <Tooltip title={filterMode ? "Show all lines" : "Only show matching lines"}>
                    <IconButton size="small" sx={iconSx(filterMode)} onClick={() => setFilterMode(f => !f)}>
                        <FilterAltIcon sx={{fontSize: 18}}/>
                    </IconButton>
                </Tooltip>

                <Box sx={{flexGrow: 1}}/>

                <ToolbarSelect<StreamFilter>
                    value={streamFilter}
                    onChange={setStreamFilter}
                    options={[
                        {value: 'all', label: 'All streams'},
                        {value: 'stdout', label: 'stdout'},
                        {value: 'stderr', label: 'stderr'},
                    ]}
                />
                <ToolbarSelect<number>
                    value={tail}
                    onChange={changeTail}
                    options={TAIL_OPTIONS.map(v => ({value: v, label: `${v} lines`}))}
                />
                <ToolbarSelect<number>
                    value={fontSize}
                    onChange={changeFontSize}
                    options={FONT_SIZES.map(v => ({value: v, label: `${v}px`}))}
                />

                <Tooltip title="Time range">
                    <IconButton size="small" sx={iconSx(rangeActive)} onClick={(e) => setRangeAnchor(e.currentTarget)}>
                        <DateRangeIcon sx={{fontSize: 18}}/>
                    </IconButton>
                </Tooltip>
                <Tooltip title="Toggle timestamps">
                    <IconButton size="small" sx={iconSx(showTimestamps)} onClick={toggleTimestamps}>
                        <AccessTimeIcon sx={{fontSize: 18}}/>
                    </IconButton>
                </Tooltip>
                {hasNames && (
                    <Tooltip title="Toggle container name">
                        <IconButton size="small" sx={iconSx(showNames)} onClick={toggleNames}>
                            <LocalOfferIcon sx={{fontSize: 18}}/>
                        </IconButton>
                    </Tooltip>
                )}
                <Tooltip title="Toggle line numbers">
                    <IconButton size="small" sx={iconSx(showLineNumbers)} onClick={toggleLineNumbers}>
                        <TagIcon sx={{fontSize: 18}}/>
                    </IconButton>
                </Tooltip>
                <Tooltip title="Toggle word wrap">
                    <IconButton size="small" sx={iconSx(wrap)} onClick={toggleWrap}>
                        <WrapTextIcon sx={{fontSize: 18}}/>
                    </IconButton>
                </Tooltip>
                <Tooltip title={light ? "Dark log background" : "Light log background"}>
                    <IconButton size="small" sx={iconSx(light)} onClick={toggleLight}>
                        {light ? <DarkModeIcon sx={{fontSize: 18}}/> : <LightModeIcon sx={{fontSize: 18}}/>}
                    </IconButton>
                </Tooltip>
                <Tooltip title="Follow new lines">
                    <IconButton size="small" sx={iconSx(autoScroll)} onClick={() => {
                        const next = !autoScroll;
                        setAutoScroll(next);
                        if (next) scrollToBottom();
                    }}>
                        <VerticalAlignBottomIcon sx={{fontSize: 18}}/>
                    </IconButton>
                </Tooltip>
                <Tooltip title={paused ? "Resume stream" : "Pause stream"}>
                    <IconButton size="small" sx={iconSx(paused)} onClick={() => setPaused(p => !p)}>
                        {paused ? <PlayArrowIcon sx={{fontSize: 18}}/> : <PauseIcon sx={{fontSize: 18}}/>}
                    </IconButton>
                </Tooltip>
                <Tooltip title="Reload stream">
                    <IconButton size="small" sx={iconSx(false)} onClick={handleReload}>
                        <RefreshIcon sx={{fontSize: 18}}/>
                    </IconButton>
                </Tooltip>
                <Tooltip title="Clear">
                    <IconButton size="small" sx={iconSx(false)} onClick={clear}>
                        <DeleteSweepIcon sx={{fontSize: 18}}/>
                    </IconButton>
                </Tooltip>
                <Tooltip title={copiedId ? "Copied!" : "Copy to clipboard"}>
                    <IconButton size="small" sx={iconSx(false)} onClick={handleCopy}>
                        {copiedId
                            ? <CheckIcon sx={{fontSize: 18, color: '#66bb6a'}}/>
                            : <ContentCopyIcon sx={{fontSize: 18}}/>}
                    </IconButton>
                </Tooltip>
                <Tooltip title="Download as .txt">
                    <IconButton size="small" sx={iconSx(false)} onClick={handleDownload}>
                        <DownloadIcon sx={{fontSize: 18}}/>
                    </IconButton>
                </Tooltip>

                <Tooltip title={lastError ? `Last error: ${lastError}` : ""}>
                    <Stack
                        direction="row"
                        spacing={0.75}
                        sx={{
                            alignItems: "center",
                            ml: 0.5
                        }}>
                        <Box sx={{width: 8, height: 8, borderRadius: '50%', bgcolor: statusMeta.color}}/>
                        <Typography variant="caption" sx={{color: 'text.secondary'}}>
                            {statusMeta.label} · {displayed.length}
                        </Typography>
                    </Stack>
                </Tooltip>
            </Stack>
            {/* merged view: container chips */}
            {isMerged && (
                <Stack
                    direction="row"
                    spacing={0.5}
                    useFlexGap
                    sx={[{
                        flexWrap: "wrap"
                    }, ...(Array.isArray(toolbarRowSx) ? toolbarRowSx : [toolbarRowSx])]}>
                    {containers.map((c, idx) => {
                        const enabled = !disabledIds.has(c.id);
                        return (
                            <Chip
                                key={c.id}
                                size="small"
                                label={c.name ?? c.id.substring(0, 12)}
                                onClick={() => toggleContainer(c.id)}
                                variant={enabled ? 'filled' : 'outlined'}
                                icon={<Box sx={{
                                    width: 8, height: 8, borderRadius: '50%',
                                    bgcolor: containerColor(idx), ml: '6px !important',
                                }}/>}
                                sx={{
                                    fontSize: '0.72rem',
                                    opacity: enabled ? 1 : 0.5,
                                    bgcolor: enabled ? 'rgba(255,255,255,0.08)' : 'transparent',
                                }}
                            />
                        );
                    })}
                </Stack>
            )}
            {/* log lines */}
            <Box
                ref={scrollRef}
                onScroll={handleScroll}
                sx={{
                    flexGrow: 1,
                    overflow: 'auto',
                    px: 1,
                    py: 0.5,
                    fontFamily: LOG_FONT,
                    fontSize,
                    color: theme.fg,
                    bgcolor: theme.bg,
                    // the app chrome disables text selection; log content is
                    // exactly the kind of text that must stay selectable
                    userSelect: 'text',
                    cursor: 'text',
                    // line-number gutter as pseudo-elements (Dockhand-style):
                    // never part of the selection or the copied text
                    '& [data-ln]::before': {
                        content: 'attr(data-ln)',
                        display: 'inline-block',
                        minWidth: '3.5em',
                        textAlign: 'right',
                        paddingRight: '0.7em',
                        marginRight: '0.7em',
                        borderRight: `1px solid ${theme.lineNumberSep}`,
                        color: theme.lineNumber,
                    },
                    ...scrollbarStyles,
                }}
            >
                {displayed.length === 0 ? (
                    <Typography variant="body2" sx={{color: theme.timestamp, p: 2, fontStyle: 'italic'}}>
                        {status === 'connecting' ? 'Waiting for logs...'
                            : lastError ? `No log lines — ${lastError}`
                                : 'No log lines'}
                    </Typography>
                ) : (
                    displayed.map((entry, index) => (
                        <LogRow
                            key={entry.id}
                            entry={entry}
                            lineNumber={index + 1}
                            query={logQuery}
                            isCurrentMatch={entry.id === currentMatchId}
                            showTimestamps={showTimestamps}
                            showLineNumbers={showLineNumbers}
                            showName={showNames && hasNames}
                            nameColor={colorFor(entry.containerId)}
                            wrap={wrap}
                            theme={theme}
                        />
                    ))
                )}
            </Box>
            {/* time range popover */}
            <Popover
                open={rangeAnchor !== null}
                anchorEl={rangeAnchor}
                onClose={() => setRangeAnchor(null)}
                anchorOrigin={{vertical: 'bottom', horizontal: 'right'}}
                transformOrigin={{vertical: 'top', horizontal: 'right'}}
            >
                <Stack spacing={1.5} sx={{p: 2, width: 260}}>
                    <Typography variant="subtitle2">Time range</Typography>
                    <TextField
                        label="From"
                        type="datetime-local"
                        size="small"
                        value={sinceInput}
                        onChange={(e) => setSinceInput(e.target.value)}
                        slotProps={{inputLabel: {shrink: true}}}
                    />
                    <TextField
                        label="To"
                        type="datetime-local"
                        size="small"
                        value={untilInput}
                        onChange={(e) => setUntilInput(e.target.value)}
                        slotProps={{inputLabel: {shrink: true}}}
                        helperText="Setting an upper bound stops following"
                    />
                    <Stack direction="row" spacing={1} sx={{
                        justifyContent: "flex-end"
                    }}>
                        <Chip size="small" label="Clear" onClick={clearRange} variant="outlined"/>
                        <Chip size="small" label="Apply" onClick={applyRange} color="primary"/>
                    </Stack>
                </Stack>
            </Popover>
        </Box>
    );
}

export default LogsViewer;
