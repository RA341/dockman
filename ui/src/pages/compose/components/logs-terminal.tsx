import {type RefObject, useEffect, useRef} from "react";
import {type ITerminalInitOnlyOptions, type ITerminalOptions, Terminal} from "@xterm/xterm";
import {FitAddon} from "@xterm/addon-fit";
import {Box} from "@mui/material";
import type {TabTerminal} from "../state/state.tsx";

const terminalConfig: ITerminalOptions & ITerminalInitOnlyOptions = {
    theme: {
        background: '#1E1E1E',
        foreground: '#CCCCCC'
    },
    // theme: {background: '#1E1E1E', foreground: '#CCCCCC'},
    scrollback: 5000,
    fontSize: 13,
    lineHeight: 1.2,
    fontFamily: 'monospace, Menlo, Monaco, "Courier New"',
}

const containerClassName = 'logs-terminal-container';
const scrollbarStyles = `
        .${containerClassName} .xterm-viewport::-webkit-scrollbar { width: 8px; height: 8px; }
        .${containerClassName} .xterm-viewport::-webkit-scrollbar-track { background: rgba(255, 255, 255, 0.1); border-radius: 4px; }
        .${containerClassName} .xterm-viewport::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.3); border-radius: 4px; }
        .${containerClassName} .xterm-viewport::-webkit-scrollbar-thumb:hover { background: rgba(255, 255, 255, 0.5); }
        .${containerClassName} .xterm-viewport { scrollbar-width: thin; scrollbar-color: rgba(255, 255, 255, 0.3) rgba(255, 255, 255, 0.1); }
    `;


type AppTerminalProps = TabTerminal & {
    fit?: RefObject<FitAddon>;
    isActive: boolean;
};

const AppTerminal = ({fit, interactive, onTerminal, isActive, onClose}: AppTerminalProps) => {
    const terminalRef = useRef<HTMLDivElement>(null);
    const xtermRef = useRef<Terminal | null>(null);

    useEffect(() => {
        if (!terminalRef.current || !fit?.current) return;

        if (isActive) {
            setTimeout(() => {
                fit.current.fit();
            }, 0);
        }

        const resizeObserver = new ResizeObserver(() => {
            try {
                fit.current.fit();
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
        let term: Terminal;

        if (interactive) {
            term = new Terminal({
                ...terminalConfig,
                cursorBlink: true,
                cursorWidth: 1,
                cursorStyle: 'bar'
            });
        } else {
            term = new Terminal({
                ...terminalConfig,
                cursorBlink: false,
                disableStdin: true,
                // keep this for handling \r\n
                convertEol: true,
            });

            term.write('\x1b[?25l'); // Hide cursor
        }

        if (fit) {
            term.loadAddon(fit.current);
        }

        if (terminalRef.current) {
            term.open(terminalRef?.current);
            fit?.current.fit();
        }

        xtermRef.current = term;

        onTerminal(xtermRef.current)

        setTimeout(() => {
            fit?.current.fit();
        }, 50);

        return () => {
            xtermRef.current?.dispose();
            xtermRef.current = null;
            onClose()
        };
        // eslint-disable-next-line
    }, []);


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
                    padding: '1px'
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
    )
    // return <div
    //     className={containerClassName}
    //     style={{width: '100%', height: '100%'}}
    //     ref={terminalRef}
    //
    // >
    //     <style>{scrollbarStyles}</style>
    //
    // </div>;
};

export default AppTerminal;