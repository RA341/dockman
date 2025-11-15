import {type KeyboardEvent as ReactKV, useEffect, useRef, useState} from 'react';
import {Box, IconButton, TextField, Tooltip} from '@mui/material';
import {Download, KeyboardArrowDown, KeyboardArrowUp,} from '@mui/icons-material';
import {Terminal} from '@xterm/xterm';
import {FitAddon} from '@xterm/addon-fit';
import {SearchAddon} from '@xterm/addon-search';
import "@xterm/xterm/css/xterm.css";

interface TerminalComponentProps {
    logStream: AsyncIterable<string> | string[] | null;
    inputFunc?: (cmd: string) => void;
    // indicate if the terminal is currently visible in the UI.
    isActive: boolean;
}

const LogsTerminal = ({logStream, inputFunc, isActive}: TerminalComponentProps) => {
    const terminalRef = useRef<HTMLDivElement>(null);
    const term = useRef<Terminal | null>(null);
    const fitAddon = useRef<FitAddon | null>(null);
    const searchAddon = useRef<SearchAddon | null>(null);
    const findInputRef = useRef<HTMLInputElement>(null);

    const inputBuffer = useRef<string>('');
    const [searchTerm, setSearchTerm] = useState('');

    const handleDownload = () => {
        if (!term.current) return;

        const buffer = term.current.buffer.active;
        let logContent = '';
        // Iterate through the buffer to get all lines of text
        for (let i = 0; i < buffer.length; i++) {
            const line = buffer.getLine(i);
            if (line) {
                logContent += line.translateToString(true) + '\n';
            }
        }
        const blob = new Blob([logContent], {type: 'text/plain;charset=utf-8'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `terminal-logs-${new Date().toISOString()}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const handleFindNext = () => {
        if (searchAddon.current && searchTerm) {
            searchAddon.current.findNext(searchTerm);
        }
    };

    const handleFindPrevious = () => {
        if (searchAddon.current && searchTerm) {
            searchAddon.current.findPrevious(searchTerm);
        }
    };

    const handleSearchKeyDown = (e: ReactKV<HTMLInputElement>) => {
        if (e.key === 'Enter' || e.key === 'ArrowDown') {
            e.preventDefault();
            handleFindNext();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            handleFindPrevious();
        }
    };

    useEffect(() => {
        if (!terminalRef.current || !fitAddon.current) return;

        const resizeObserver = new ResizeObserver(() => {
            // Debounce rapid resize events
            requestAnimationFrame(() => {
                fitAddon.current?.fit();
            });
        });

        resizeObserver.observe(terminalRef.current);

        return () => {
            resizeObserver.disconnect();
        };
        // eslint-disable-next-line
    }, [fitAddon.current]);

    useEffect(() => {
        // This effect ensures the terminal fits its container when it becomes active.
        if (isActive && fitAddon.current) {
            const timer = setTimeout(() => fitAddon.current?.fit(), 50);
            return () => clearTimeout(timer);
        }
    }, [isActive]);

    useEffect(() => {
        if (!terminalRef.current) return;

        const xterm = new Terminal({
            cursorBlink: true,
            disableStdin: !inputFunc,
            convertEol: true,
            scrollback: 5000,
            theme: {background: '#1E1E1E', foreground: '#CCCCCC'},
            fontFamily: 'monospace',
            lineHeight: 1.5,
        });

        xterm.onKey(({domEvent}) => {
            if (domEvent.ctrlKey || domEvent.metaKey) {
                if (domEvent.key === 'c') {
                    const selection = xterm.getSelection();
                    if (selection) {
                        navigator.clipboard.writeText(selection).then();
                    }
                } else if (domEvent.key === 'f') {
                    domEvent.preventDefault();
                    findInputRef.current?.focus();
                    findInputRef.current?.select();
                }
            }
        });

        const fit = new FitAddon();
        const search = new SearchAddon();
        fitAddon.current = fit;
        searchAddon.current = search;
        term.current = xterm;

        xterm.loadAddon(fit);
        xterm.loadAddon(search);
        xterm.open(terminalRef?.current);
        fit.fit();

        if (!inputFunc) {
            xterm.write('\x1b[?25l'); // hideCursorByte
        }

        // Handler for user input if an input function is provided
        xterm.onData((data) => {
            if (!inputFunc) return;

            if (data === "\r") { // Enter
                if (inputFunc) {
                    if (inputBuffer.current === "clear") {
                        xterm.clear();
                    } else {
                        inputFunc(inputBuffer.current);
                        xterm.write('\r\n');
                    }
                    inputBuffer.current = '';
                }
            } else if (data === "\u007f") { // Backspace
                if (inputBuffer.current.length > 0) {
                    inputBuffer.current = inputBuffer.current.slice(0, -1);
                    xterm.write('\b \b');
                }
            } else if (data === "\u0015") { // Ctrl+U
                const lineLength = inputBuffer.current.length;
                inputBuffer.current = '';
                xterm.write('\r' + ' '.repeat(lineLength) + '\r');
            } else {
                inputBuffer.current += data;
                xterm.write(data);
            }
        });

        const resizeObserver = new ResizeObserver(() => fitAddon.current?.fit());
        resizeObserver.observe(terminalRef.current);

        return () => {
            resizeObserver.disconnect();
            xterm.dispose();
            term.current = null;
            fitAddon.current = null;
            searchAddon.current = null;
        };
    }, [inputFunc]);

    // This effect handles writing the log stream to the terminal.
    useEffect(() => {
        if (!logStream || !term.current) return;

        const currentTerm = term.current;
        currentTerm.clear();
        // todo refactor idiot

        if (Symbol.asyncIterator in logStream) {
            const asyncStream = async () => {
                try {
                    for await (const item of logStream) {
                        if (term.current) {
                            term.current.write(item);
                        }
                    }
                } catch (error) {
                    if (term.current && error instanceof Error && error.name !== 'AbortError') {
                        term.current.write(`\r\n\x1b[31mStream Error: ${error.message}\x1b[0m`);
                    }
                }
            };
            asyncStream().then();
            return;
        }

        const syncStream = () => {
            console.debug("Using sync stream...");
            try {
                for (const item of logStream as string[]) {
                    if (term.current) {
                        term.current.write(item);
                    }
                }
            } catch (error) {
                if (term.current && error instanceof Error && error.name !== 'AbortError') {
                    term.current.write(`\r\n\x1b[31mStream Error: ${error.message}\x1b[0m`);
                }
            }
        };
        syncStream();

    }, [logStream]);

    // custom scrollbar styles to the xterm viewport
    const containerClassName = 'logs-terminal-container';
    const scrollbarStyles = `
        .${containerClassName} .xterm-viewport::-webkit-scrollbar { width: 8px; height: 8px; }
        .${containerClassName} .xterm-viewport::-webkit-scrollbar-track { background: rgba(255, 255, 255, 0.1); border-radius: 4px; }
        .${containerClassName} .xterm-viewport::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.3); border-radius: 4px; }
        .${containerClassName} .xterm-viewport::-webkit-scrollbar-thumb:hover { background: rgba(255, 255, 255, 0.5); }
        .${containerClassName} .xterm-viewport { scrollbar-width: thin; scrollbar-color: rgba(255, 255, 255, 0.3) rgba(255, 255, 255, 0.1); }
    `;

    return (
        <Box
            className={containerClassName}
            sx={{display: 'flex', flexDirection: 'column', width: '100%', height: '100%', bgcolor: '#1E1E1E'}}
        >
            <style>{scrollbarStyles}</style>

            <Box sx={{
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                p: '2px 8px',
                py: 3,
                height: '40px',
                bgcolor: '#2D2D2D',
                borderBottom: '1px solid #444'
            }}>
                <TextField
                    inputRef={findInputRef}
                    variant="outlined"
                    size="small"
                    placeholder="Search (Ctrl+F)"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    onKeyDown={handleSearchKeyDown}
                    sx={{
                        mr: 1,
                        '& .MuiInput-root': {color: '#CCCCCC', fontSize: '0.875rem'},
                        '& .MuiInput-underline:before': {borderBottomColor: 'rgba(255,255,255,0.3)'},
                        '& .MuiInput-underline:hover:not(.Mui-disabled):before': {borderBottomColor: 'rgba(255,255,255,0.7)'},
                    }}
                />
                <IconButton onClick={handleFindPrevious} size="small" title="Previous (↑)">
                    <KeyboardArrowUp sx={{color: '#CCCCCC'}}/>
                </IconButton>
                <IconButton onClick={handleFindNext} size="small" title="Next (↓ or Enter)">
                    <KeyboardArrowDown sx={{color: '#CCCCCC'}}/>
                </IconButton>

                <Box sx={{flexGrow: 0.01}}/>

                <IconButton onClick={handleDownload} size="small" title="Download logs">
                    <Tooltip title={"Download logs"}>
                        <Download sx={{color: '#CCCCCC'}}/>
                    </Tooltip>
                </IconButton>
            </Box>

            <Box
                ref={terminalRef}
                sx={{
                    flexGrow: 1,
                    width: '100%',
                    height: 'calc(100% - 40px)', // Adjust height to account for the bar
                    overflow: 'hidden',
                }}
            />
        </Box>
    );
};

export default LogsTerminal;