import {Alert, Box, Button, CircularProgress, IconButton, Stack, TextField, Tooltip, Typography} from '@mui/material';
import {Check, ContentCopy, DeleteSweep, Terminal as TerminalIcon} from '@mui/icons-material';
import {FitAddon} from '@xterm/addon-fit';
import type {Terminal} from '@xterm/xterm';
import {useEffect, useMemo, useRef, useState} from 'react';
import AppTerminal from './logs-terminal.tsx';
import {createTab, type TabTerminal} from '../state/terminal.tsx';
import {useContainerExecOptionsUrl, useContainerExecWsUrl} from '../../../lib/api.ts';

const sizes = [10, 12, 14, 16];

export default function ExecTerminalPanel({tab, isActive}: {tab: TabTerminal; isActive: boolean}) {
    const fit = useRef(new FitAddon());
    const xterm = useRef<Terminal | null>(null);
    const createExecUrl = useContainerExecWsUrl();
    const createOptionsUrl = useContainerExecOptionsUrl();
    const session = tab.execSession!;
    const initialUserChoice = session.user === '' ? 'context' : ['root', 'nobody'].includes(session.user) ? session.user : 'other';
    const [shells, setShells] = useState<string[] | null>(null);
    const [shellError, setShellError] = useState('');
    const [shell, setShell] = useState(session.shell);
    const [userChoice, setUserChoice] = useState(initialUserChoice);
    const [otherUser, setOtherUser] = useState(initialUserChoice === 'other' ? session.user : '');
    const [connected, setConnected] = useState(true);
    const [fontSize, setFontSize] = useState(() => Number(localStorage.getItem('dockman-exec-fontsize')) || 12);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        const controller = new AbortController();
        setShells(null);
        setShellError('');
        fetch(createOptionsUrl(session.containerID), {signal: controller.signal})
            .then(async response => {
                if (!response.ok) throw new Error(await response.text() || `HTTP ${response.status}`);
                return response.json() as Promise<{shells?: string[]}>;
            })
            .then(result => {
                const available = result.shells ?? [];
                setShells(available);
                setShell(current => available.includes(current) ? current : available[0] ?? '');
            })
            .catch(error => {
                if (error instanceof Error && error.name !== 'AbortError') {
                    setShellError(error.message);
                    setShells([]);
                }
            });
        return () => controller.abort();
    }, [createOptionsUrl, session.containerID]);

    const execUser = userChoice === 'context' ? '' : userChoice === 'other' ? otherUser.trim() : userChoice;
    const terminal = useMemo(() => connected
        ? createTab(createExecUrl(session.containerID, shell, undefined, execUser), tab.title, true)
        : null,
    [connected, createExecUrl, execUser, session.containerID, shell, tab.title]);
    const controlled = useMemo(() => terminal ? ({
        ...terminal,
        onTerminal: (term: Terminal) => {
            xterm.current = term;
            terminal.onTerminal(term);
        },
        onClose: () => {
            xterm.current = null;
            terminal.onClose();
        },
    }) : null, [terminal]);

    const copy = async () => {
        const term = xterm.current;
        if (!term) return;
        const selected = term.getSelection();
        const lines: string[] = [];
        if (!selected) {
            const buffer = term.buffer.active;
            for (let i = 0; i < buffer.length; i++) lines.push(buffer.getLine(i)?.translateToString(true) ?? '');
        }
        await navigator.clipboard.writeText(selected || lines.join('\n').replace(/\n+$/, ''));
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
    };
    const changeFont = (value: number) => {
        localStorage.setItem('dockman-exec-fontsize', String(value));
        setFontSize(value);
    };
    const toggleConnection = () => {
        if (connected) {
            setConnected(false);
            return;
        }
        setConnected(true);
    };
    const fieldSx = {
        '& .MuiInputBase-root': {height: 28, fontSize: '0.68rem'},
        '& .Mui-disabled': {WebkitTextFillColor: 'rgba(255,255,255,0.55)'},
    };

    return <Box sx={{height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column', bgcolor: '#09090b'}}>
        <Stack direction="row" useFlexGap spacing={0.65} sx={{px: 1, py: 0.6, alignItems: 'center', flexWrap: 'wrap', flexShrink: 0, borderBottom: '1px solid rgba(255,255,255,0.14)', bgcolor: '#111318'}}>
            <TerminalIcon sx={{fontSize: 17, color: '#7dd3fc'}}/>
            <Typography sx={{fontSize: '0.73rem', fontWeight: 800}}>{session.containerID.slice(0, 12)}</Typography>
            {shells === null ? <CircularProgress size={15}/> : <TextField select disabled={connected || shells.length === 0} size="small" value={shell}
                onChange={event => setShell(event.target.value)} slotProps={{select: {native: true}}} sx={{width: 135, ...fieldSx}}>
                {shells.map(value => <option key={value} value={value}>{value}</option>)}
            </TextField>}
            <TextField select disabled={connected} size="small" value={userChoice} onChange={event => setUserChoice(event.target.value)}
                slotProps={{select: {native: true}}} sx={{width: 145, ...fieldSx}}>
                <option value="context">Container context</option><option value="root">root</option>
                <option value="nobody">nobody</option><option value="other">Other…</option>
            </TextField>
            {userChoice === 'other' && <TextField size="small" value={otherUser} disabled={connected} onChange={event => setOtherUser(event.target.value)}
                placeholder="UID or user" sx={{width: 105, ...fieldSx}}/>}
            <TextField select size="small" value={fontSize} onChange={event => changeFont(Number(event.target.value))}
                slotProps={{select: {native: true}}} sx={{width: 70, ...fieldSx}}>
                {sizes.map(value => <option key={value} value={value}>{value}px</option>)}
            </TextField>
            <Button size="small" variant={connected ? 'outlined' : 'contained'} color={connected ? 'error' : 'primary'}
                disabled={!connected && (!shell || shells?.length === 0 || (userChoice === 'other' && !otherUser.trim()))}
                onClick={toggleConnection} sx={{height: 27, py: 0, textTransform: 'none'}}>
                {connected ? 'Disconnect' : 'Connect'}
            </Button>
            <Tooltip title="Clear terminal"><span><IconButton size="small" disabled={!connected} onClick={() => xterm.current?.clear()}><DeleteSweep sx={{fontSize: 18}}/></IconButton></span></Tooltip>
            <Tooltip title={copied ? 'Copied!' : 'Copy selection or terminal'}><span><IconButton size="small" disabled={!connected} onClick={() => void copy()}>
                {copied ? <Check sx={{fontSize: 18, color: '#66bb6a'}}/> : <ContentCopy sx={{fontSize: 18}}/>}
            </IconButton></span></Tooltip>
            <Typography sx={{ml: 'auto !important', color: connected ? '#81c784' : 'rgba(255,255,255,0.45)', fontSize: '0.66rem'}}>
                {connected ? 'Interactive session' : 'Disconnected'}
            </Typography>
        </Stack>
        {shellError && <Alert severity="error" sx={{borderRadius: 0, py: 0}}>{shellError}</Alert>}
        {shells?.length === 0 && !shellError && <Alert severity="warning" sx={{borderRadius: 0, py: 0}}>No supported shell is available.</Alert>}
        <Box sx={{flex: 1, minHeight: 0, overflow: 'hidden', bgcolor: '#09090b'}}>
            {controlled ? <AppTerminal {...controlled} fit={fit} isActive={isActive} fontSize={fontSize}/>
                : <Box sx={{height: '100%', display: 'grid', placeItems: 'center'}}><Typography sx={{color: 'rgba(255,255,255,0.45)', fontSize: '0.72rem'}}>Choose a shell and connect.</Typography></Box>}
        </Box>
    </Box>;
}
