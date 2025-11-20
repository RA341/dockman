import {type RefObject, useEffect, useRef} from "react";
import {Terminal} from "@xterm/xterm";
import {FitAddon} from "@xterm/addon-fit";
import {SearchAddon} from "@xterm/addon-search";
import {Box} from '@mui/material'
import {containerClassName, scrollbarStyles} from "../state/state.tsx";

function ReadOnlyTerm({stream, isActive, fit}: {
    fit?: RefObject<FitAddon>;
    stream: AsyncIterable<string> | null;
    isActive: boolean
}) {
    const terminalRef = useRef<HTMLDivElement>(null);
    const term = useRef<Terminal | null>(null);

    // Handle Resizing
    useEffect(() => {
        if (!terminalRef.current || !fit?.current) return;

        if (isActive) {
            setTimeout(() => {
                fit?.current?.fit();
            }, 0);
        }

        const resizeObserver = new ResizeObserver(() => {
            try {
                fit?.current?.fit();
            } catch (e) {
                console.warn("Resize error", e);
            }
        });

        resizeObserver.observe(terminalRef.current);

        return () => {
            resizeObserver.disconnect();
        };
    }, [fit, isActive]);

    useEffect(() => {
        if (!terminalRef.current) return;

        const xterm = new Terminal({
            cursorBlink: false,
            disableStdin: true,
            convertEol: true,
            scrollback: 5000,
            fontFamily: 'monospace, Menlo, Monaco, "Courier New"',
        });

        const search = new SearchAddon();
        term.current = xterm;

        if (fit) {
            xterm.loadAddon(fit.current);
        }
        xterm.loadAddon(search);
        xterm.open(terminalRef.current);

        xterm.write('\x1b[?25l'); // Hide cursor

        // Initial fit
        setTimeout(() => {
            fit?.current.fit();
        }, 50);

        return () => {
            xterm.dispose();
            term.current = null;
        };
    }, [fit]);

    // Handle Stream
    useEffect(() => {
        if (stream == null) return;

        const asyncStream = async () => {
            try {
                for await (const item of stream!) {
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
    }, [stream]);

    return (
        <Box
            className={containerClassName}
            sx={{
                flex: 1,
                width: '100%',
                height: '100%',
                overflow: 'hidden',
                position: 'relative',
                bgcolor: '#1E1E1E',
                '& .xterm': {
                    height: '100%',
                    padding: '10px'
                },
                '& .xterm-viewport': {
                    overflowY: 'auto !important'
                }
            }}
        >
            <style>{scrollbarStyles}</style>

            <div
                ref={terminalRef}
                style={{width: '100%', height: '100%'}}
            />
        </Box>
    );
}

export default ReadOnlyTerm;