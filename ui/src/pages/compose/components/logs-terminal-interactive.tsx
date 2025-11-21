import {type RefObject, useEffect, useRef} from "react";
import {Terminal} from "@xterm/xterm";
import {FitAddon} from "@xterm/addon-fit";
import {containerClassName, scrollbarStyles, terminalConfig} from "../state/state.tsx";
import { Box } from "@mui/material";


const InteractiveTerminal = ({wsUrl, onClose, isActive = true, fit}: {
    wsUrl: string;
    onClose?: () => void;
    isActive?: boolean;
    fit?: RefObject<FitAddon>
}) => {
    const terminalRef = useRef<HTMLDivElement>(null);
    const wsRef = useRef<WebSocket | null>(null);
    const xtermRef = useRef<Terminal | null>(null);

    // Handle Resizing
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
        const term = new Terminal({
            ...terminalConfig,
            cursorBlink: true,
            cursorWidth: 1,
            cursorStyle: 'bar'
        });

        if (fit) {
            term.loadAddon(fit.current);
        }

        if (terminalRef.current) {
            term.open(terminalRef.current);
            fit?.current.fit();
        }

        xtermRef.current = term;

        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;
        ws.binaryType = "arraybuffer";

        ws.onopen = () => {
            term.write('\x1b[32m*** Connected to Container ***\x1b[0m\r\n');
            term.focus();
        };

        ws.onmessage = (event) => {
            term.write(
                typeof event.data === 'string' ?
                    event.data :
                    new Uint8Array(event.data)
            );
        };

        ws.onclose = () => {
            term.write('\r\n\x1b[31m*** Connection Closed ***\x1b[0m\r\n');
            onClose?.()
        };

        ws.onerror = (err) => {
            console.error("WS Error", err);
            term.write('\r\n\x1b[31m*** Connection Error ***\x1b[0m\r\n');
        };

        term.onData((data) => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(data);
            }
        });

        xtermRef.current = term;

        setTimeout(() => {
            fit?.current.fit();
        }, 50);

        return () => {
            xtermRef.current?.dispose();
            xtermRef.current = null;
        };
        // eslint-disable-next-line
    }, [wsUrl]);


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

export default InteractiveTerminal;