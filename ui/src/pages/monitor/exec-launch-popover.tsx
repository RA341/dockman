import {Alert, Box, Button, CircularProgress, MenuItem, Popover, Stack, TextField, Typography} from '@mui/material';
import {PersonOutlined, Terminal as TerminalIcon} from '@mui/icons-material';
import {useEffect, useState} from 'react';
import {useContainerExecOptionsUrl} from '../../lib/api.ts';
import type {MonitorRow} from './monitor-table.tsx';
import {statsTheme as t} from '../compose/components/stats-theme.ts';

export interface ExecLaunch {
    anchor: HTMLElement;
    row: MonitorRow;
}

export default function ExecLaunchPopover({launch, onClose, onConnect}: {
    launch: ExecLaunch | null;
    onClose: () => void;
    onConnect: (row: MonitorRow, shell: string, user: string) => void;
}) {
    const optionsUrl = useContainerExecOptionsUrl();
    const [shells, setShells] = useState<string[] | null>(null);
    const [shell, setShell] = useState('');
    const [userChoice, setUserChoice] = useState('context');
    const [otherUser, setOtherUser] = useState('');
    const [error, setError] = useState('');
    useEffect(() => {
        if (!launch) return;
        const controller = new AbortController();
        setShells(null);
        setShell('');
        setError('');
        setUserChoice('context');
        setOtherUser('');
        fetch(optionsUrl(launch.row.info.id), {signal: controller.signal})
            .then(async response => {
                if (!response.ok) throw new Error(await response.text() || `HTTP ${response.status}`);
                return response.json() as Promise<{shells?: string[]}>;
            })
            .then(result => {
                const values = result.shells ?? [];
                setShells(values);
                setShell(values[0] ?? '');
            })
            .catch(err => {
                if (err instanceof Error && err.name !== 'AbortError') {
                    setError(err.message);
                    setShells([]);
                }
            });
        return () => controller.abort();
    }, [launch, optionsUrl]);

    const user = userChoice === 'context' ? '' : userChoice === 'other' ? otherUser.trim() : userChoice;
    const fieldSx = {
        '& .MuiInputBase-root': {height: 32, bgcolor: '#17191c', fontSize: '0.76rem'},
        '& .MuiOutlinedInput-notchedOutline': {borderColor: t.border},
    };

    return <Popover open={launch !== null} anchorEl={launch?.anchor ?? null} onClose={onClose}
        anchorOrigin={{vertical: 'top', horizontal: 'center'}} transformOrigin={{vertical: 'bottom', horizontal: 'center'}}
        slotProps={{paper: {sx: {
            width: 272,
            borderRadius: 1.25,
            border: `1px solid ${t.border}`,
            bgcolor: t.panel,
            color: t.text,
            backgroundImage: 'none',
            boxShadow: '0 12px 30px rgba(0,0,0,.6)',
        }}}}>
        {launch && <>
            <Stack direction="row" spacing={0.8} sx={{px: 1.25, py: 0.8, alignItems: 'center', bgcolor: t.header, borderBottom: `1px solid ${t.border}`}}>
                <TerminalIcon sx={{fontSize: 18, color: t.textDim}}/>
                <Typography noWrap sx={{fontSize: '0.78rem', fontWeight: 800}}>{launch.row.info.name}</Typography>
            </Stack>
            {shells === null ? <Box sx={{height: 96, display: 'grid', placeItems: 'center'}}><CircularProgress size={20}/></Box>
                : error ? <Stack spacing={0.45} sx={{px: 2, py: 1.8, alignItems: 'center', textAlign: 'center'}}>
                    <Typography sx={{fontSize: 22, lineHeight: 1, color: '#fbbf24'}}>!</Typography>
                    <Typography sx={{fontSize: '0.78rem', fontWeight: 800, color: '#fbbf24'}}>Exec unavailable</Typography>
                    <Alert severity="warning" sx={{width: '100%', py: 0, '& .MuiAlert-message': {fontSize: '0.68rem'}}}>{error}</Alert>
                </Stack> : shells.length === 0 ? <Stack spacing={0.45} sx={{px: 2, py: 1.8, alignItems: 'center', textAlign: 'center'}}>
                    <Typography sx={{fontSize: 22, lineHeight: 1, color: '#fbbf24'}}>!</Typography>
                    <Typography sx={{fontSize: '0.78rem', fontWeight: 800, color: '#fbbf24'}}>No shell available</Typography>
                    <Typography sx={{fontSize: '0.7rem', color: t.textDim}}>This container has no supported shell installed.</Typography>
                </Stack> : <Stack spacing={0.65} sx={{p: 1.25}}>
                    <Typography sx={{fontSize: '0.68rem', fontWeight: 700, color: t.textDim}}>Shell</Typography>
                    <TextField select value={shell} onChange={event => setShell(event.target.value)} sx={fieldSx}>
                        {shells.map(value => <MenuItem key={value} value={value} sx={{fontSize: '0.76rem'}}>{value}</MenuItem>)}
                    </TextField>
                    <Typography sx={{mt: '4px !important', fontSize: '0.68rem', fontWeight: 700, color: t.textDim}}>User</Typography>
                    <TextField select value={userChoice} onChange={event => setUserChoice(event.target.value)} sx={fieldSx}
                        slotProps={{input: {startAdornment: <PersonOutlined sx={{mr: 0.7, fontSize: 17, color: t.textDim}}/>}}}>
                        <MenuItem value="context" sx={{fontSize: '0.76rem'}}>Container context</MenuItem>
                        <MenuItem value="root" sx={{fontSize: '0.76rem'}}>root</MenuItem>
                        <MenuItem value="nobody" sx={{fontSize: '0.76rem'}}>nobody</MenuItem>
                        <MenuItem value="other" sx={{fontSize: '0.76rem'}}>Other…</MenuItem>
                    </TextField>
                    {userChoice === 'other' && <TextField value={otherUser} onChange={event => setOtherUser(event.target.value)} placeholder="UID or user" sx={fieldSx}/>}
                    <Button variant="contained" size="small" startIcon={<TerminalIcon sx={{fontSize: '16px !important'}}/>}
                        disabled={!shell || (userChoice === 'other' && !otherUser.trim())}
                        onClick={() => onConnect(launch.row, shell, user)}
                        sx={{mt: '8px !important', height: 32, textTransform: 'none', fontSize: '0.75rem', fontWeight: 800}}>
                        Connect
                    </Button>
                </Stack>}
        </>}
    </Popover>;
}
