import {
    Alert, Box, Button, Checkbox, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
    FormControlLabel, IconButton, Menu, MenuItem, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead,
    TableRow, TextField, Tooltip, Typography,
} from '@mui/material';
import {
    ArchiveOutlined, ArrowBack, ArrowDownward, ArrowUpward, CreateNewFolderOutlined, DeleteOutlined, DownloadOutlined,
    DriveFileRenameOutline, FileUploadOutlined, FolderOutlined, HomeOutlined, InsertDriveFileOutlined,
    NoteAddOutlined, Refresh, SecurityOutlined, Visibility, VisibilityOff,
} from '@mui/icons-material';
import {type MouseEvent, useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {useHostUrl} from '../lib/api.ts';
import {useSnackbar} from '../hooks/snackbar.ts';
import scrollbarStyles from './scrollbar-style.tsx';
import {statsTheme as t} from '../pages/compose/components/stats-theme.ts';

export type FileBrowserKind = 'container' | 'volume';

interface FileEntry {
    name: string;
    type: 'directory' | 'file' | 'symlink' | 'other';
    size: number;
    mode: string;
    permissions: string;
    modified: string;
    uid: number;
    gid: number;
    linkTarget?: string;
}

interface ListResponse { path: string; entries: FileEntry[] }
type SortKey = 'name' | 'size' | 'mode' | 'modified';
type EditDialog = null | {kind: 'new-file' | 'new-folder' | 'rename'; entry?: FileEntry};

const joinPath = (directory: string, name: string) => `${directory === '/' ? '' : directory}/${name}`;
const parentPath = (value: string) => value === '/' ? '/' : value.slice(0, value.lastIndexOf('/')) || '/';
const formatSize = (value: number, directory: boolean) => {
    if (directory) return '—';
    if (value < 1024) return `${value} B`;
    const units = ['KB', 'MB', 'GB', 'TB']; let size = value / 1024; let unit = 0;
    while (size >= 1024 && unit < units.length - 1) {size /= 1024; unit += 1;}
    return `${size.toFixed(size >= 10 ? 1 : 2)} ${units[unit]}`;
};

async function responseError(response: Response): Promise<string> {
    const body = (await response.text()).trim();
    return body || `${response.status} ${response.statusText}`;
}

function SortLabel({label, column, sort, ascending, onSort}: {
    label: string; column: SortKey; sort: SortKey; ascending: boolean; onSort: (column: SortKey) => void;
}) {
    return <Button color="inherit" size="small" onClick={() => onSort(column)}
        endIcon={sort === column ? ascending ? <ArrowUpward/> : <ArrowDownward/> : undefined}
        sx={{fontWeight: 800, fontSize: '0.72rem', textTransform: 'none', minWidth: 0, px: 0.4,
            '& .MuiButton-endIcon svg': {fontSize: 14}}}>{label}</Button>;
}

function PermissionsDialog({entry, open, onClose, onApply}: {
    entry: FileEntry | null; open: boolean; onClose: () => void; onApply: (mode: string, recursive: boolean) => void;
}) {
    const [mode, setMode] = useState('755'); const [recursive, setRecursive] = useState(false);
    useEffect(() => {if (entry) {setMode(entry.mode.padStart(3, '0')); setRecursive(false);}}, [entry]);
    const numeric = /^[0-7]{3,4}$/.test(mode) ? Number.parseInt(mode, 8) : 0;
    const bits = [0o400, 0o200, 0o100, 0o040, 0o020, 0o010, 0o004, 0o002, 0o001];
    const setBit = (bit: number, checked: boolean) => setMode((checked ? numeric | bit : numeric & ~bit).toString(8).padStart(3, '0'));
    return <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth slotProps={{paper: {sx: {bgcolor: t.panel, border: `1px solid ${t.border}`}}}}>
        <DialogTitle sx={{fontWeight: 800}}>Change permissions</DialogTitle>
        <DialogContent><Typography sx={{color: t.textDim, mb: 1.5, fontFamily: t.mono}}>{entry?.name}</Typography>
            <Box sx={{display: 'grid', gridTemplateColumns: '90px repeat(3, 1fr)', alignItems: 'center', textAlign: 'center', border: `1px solid ${t.border}`, borderRadius: 1.5, p: 1}}>
                <span/>{['Read', 'Write', 'Execute'].map(v => <Typography key={v} sx={{fontSize: '0.74rem', color: t.textDim}}>{v}</Typography>)}
                {['Owner', 'Group', 'Others'].map((owner, row) => <Box key={owner} sx={{display: 'contents'}}>
                    <Typography sx={{textAlign: 'left', fontSize: '0.78rem'}}>{owner}</Typography>
                    {[0, 1, 2].map(col => {const bit = bits[row * 3 + col]; return <Checkbox key={bit} size="small" checked={(numeric & bit) !== 0} onChange={(_, value) => setBit(bit, value)}/>;})}
                </Box>)}
            </Box>
            <TextField fullWidth size="small" label="Octal mode" value={mode} onChange={event => setMode(event.target.value)} sx={{mt: 2}}
                error={!/^[0-7]{3,4}$/.test(mode)} helperText={`Symbolic: ${entry?.permissions || '—'}`}/>
            {entry?.type === 'directory' && <FormControlLabel control={<Checkbox checked={recursive} onChange={(_, v) => setRecursive(v)}/>} label="Apply recursively"/>}
        </DialogContent>
        <DialogActions><Button onClick={onClose}>Cancel</Button><Button variant="contained" disabled={!/^[0-7]{3,4}$/.test(mode)} onClick={() => onApply(mode, recursive)}>Apply</Button></DialogActions>
    </Dialog>;
}

export default function ContainerFileBrowser({kind, target, active = true}: {kind: FileBrowserKind; target: string; active?: boolean}) {
    const hostUrl = useHostUrl(); const {showError, showSuccess} = useSnackbar(); const uploadRef = useRef<HTMLInputElement>(null);
    const [directory, setDirectory] = useState('/'); const [entries, setEntries] = useState<FileEntry[]>([]);
    const [loading, setLoading] = useState(false); const [error, setError] = useState(''); const [hidden, setHidden] = useState(false);
    const [sort, setSort] = useState<SortKey>('name'); const [ascending, setAscending] = useState(true);
    const [edit, setEdit] = useState<EditDialog>(null); const [editValue, setEditValue] = useState('');
    const [permissions, setPermissions] = useState<FileEntry | null>(null); const [deleting, setDeleting] = useState<FileEntry | null>(null);
    const [archiveMenu, setArchiveMenu] = useState<{anchor: HTMLElement; path: string} | null>(null);
    const base = useMemo(() => `/docker/files/${kind}/${encodeURIComponent(target)}`, [kind, target]);
    const endpoint = useCallback((action: string, params?: Record<string, string>) => {
        const query = new URLSearchParams(params); return hostUrl(`${base}/${action}${query.size ? `?${query}` : ''}`);
    }, [base, hostUrl]);
    const load = useCallback(async () => {
        if (!active || !target) return;
        setLoading(true); setError('');
        try {
            const response = await fetch(endpoint('list', {path: directory}));
            if (!response.ok) throw new Error(await responseError(response));
            const data = await response.json() as ListResponse; setEntries(data.entries ?? []);
        } catch (reason) {setError(reason instanceof Error ? reason.message : String(reason));} finally {setLoading(false);}
    }, [active, directory, endpoint, target]);
    useEffect(() => {void load();}, [load]);
    useEffect(() => {setDirectory('/'); setEntries([]);}, [kind, target]);

    const shown = useMemo(() => entries.filter(entry => hidden || !entry.name.startsWith('.')).sort((a, b) => {
        if (a.type === 'directory' && b.type !== 'directory') return -1;
        if (a.type !== 'directory' && b.type === 'directory') return 1;
        const direction = ascending ? 1 : -1;
        if (sort === 'size') return direction * (a.size - b.size);
        return direction * String(a[sort]).localeCompare(String(b[sort]), undefined, {numeric: true, sensitivity: 'base'});
    }), [ascending, entries, hidden, sort]);
    const onSort = (column: SortKey) => {if (sort === column) setAscending(value => !value); else {setSort(column); setAscending(true);}};
    const action = async (body: Record<string, unknown>, success: string) => {
        try {
            const response = await fetch(endpoint('action'), {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)});
            if (!response.ok) throw new Error(await responseError(response));
            showSuccess(success); await load(); return true;
        } catch (reason) {showError(reason instanceof Error ? reason.message : String(reason)); return false;}
    };
    const openEdit = (value: Exclude<EditDialog, null>) => {setEdit(value); setEditValue(value.entry?.name ?? '');};
    const applyEdit = async () => {
        const value = editValue.trim(); if (!edit || !value) return;
        const oldPath = edit.entry ? joinPath(directory, edit.entry.name) : '';
        const ok = edit.kind === 'rename'
            ? await action({action: 'rename', path: oldPath, newPath: joinPath(directory, value)}, `Renamed to ${value}`)
            : await action({action: edit.kind === 'new-file' ? 'create-file' : 'create-folder', path: joinPath(directory, value)}, `${value} created`);
        if (ok) setEdit(null);
    };
    const upload = async (files: FileList | null) => {
        if (!files) return;
        for (const file of Array.from(files)) {
            try {
                const response = await fetch(endpoint('upload', {path: directory, name: file.name}), {method: 'POST', headers: {'Content-Type': 'application/octet-stream'}, body: file});
                if (!response.ok) throw new Error(await responseError(response)); showSuccess(`${file.name} uploaded`);
            } catch (reason) {showError(reason instanceof Error ? reason.message : String(reason));}
        }
        if (uploadRef.current) uploadRef.current.value = ''; await load();
    };
    const breadcrumbs = directory.split('/').filter(Boolean);
    return <Paper variant="outlined" sx={{height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', bgcolor: t.panel, borderColor: t.border}}>
        <Stack direction="row" sx={{alignItems: 'center', gap: 0.4, px: 1, py: 0.75, flexShrink: 0, borderBottom: `1px solid ${t.border}`}}>
            <Tooltip title="Parent folder"><span><IconButton size="small" disabled={directory === '/'} onClick={() => setDirectory(parentPath(directory))}><ArrowBack/></IconButton></span></Tooltip>
            <IconButton size="small" onClick={() => setDirectory('/')}><HomeOutlined/></IconButton>
            <Typography component="span" sx={{color: t.textDim}}>/</Typography>
            {breadcrumbs.map((part, index) => <Button key={`${part}-${index}`} size="small" color="inherit" onClick={() => setDirectory('/' + breadcrumbs.slice(0, index + 1).join('/'))}
                sx={{textTransform: 'none', minWidth: 0, px: 0.4, fontFamily: t.mono}}>{part}{index < breadcrumbs.length - 1 ? ' /' : ''}</Button>)}
            <Box sx={{flex: 1}}/>
            <Tooltip title="New file"><IconButton size="small" onClick={() => openEdit({kind: 'new-file'})}><NoteAddOutlined/></IconButton></Tooltip>
            <Tooltip title="New folder"><IconButton size="small" onClick={() => openEdit({kind: 'new-folder'})}><CreateNewFolderOutlined/></IconButton></Tooltip>
            <Tooltip title="Upload files"><IconButton size="small" onClick={() => uploadRef.current?.click()}><FileUploadOutlined/></IconButton></Tooltip>
            <input ref={uploadRef} hidden multiple type="file" onChange={event => void upload(event.target.files)}/>
            <Tooltip title={hidden ? 'Hide hidden files' : 'Show hidden files'}><IconButton size="small" color={hidden ? 'primary' : 'default'} onClick={() => setHidden(value => !value)}>{hidden ? <Visibility/> : <VisibilityOff/>}</IconButton></Tooltip>
            <Tooltip title="Refresh"><IconButton size="small" disabled={loading} onClick={() => void load()}>{loading ? <CircularProgress size={18}/> : <Refresh/>}</IconButton></Tooltip>
        </Stack>
        {error && <Alert severity="error" sx={{m: 1, flexShrink: 0}}>{error}</Alert>}
        <TableContainer sx={{flex: 1, minHeight: 0, overflow: 'auto', ...scrollbarStyles}}>
            <Table stickyHeader size="small" sx={{tableLayout: 'fixed', '& .MuiTableCell-root': {borderColor: t.border, py: 0.65, px: 1}}}>
                <TableHead><TableRow><TableCell sx={{width: '42%'}}><SortLabel label="Name" column="name" sort={sort} ascending={ascending} onSort={onSort}/></TableCell>
                    <TableCell sx={{width: 110}}><SortLabel label="Size" column="size" sort={sort} ascending={ascending} onSort={onSort}/></TableCell>
                    <TableCell sx={{width: 150}}><SortLabel label="Permissions" column="mode" sort={sort} ascending={ascending} onSort={onSort}/></TableCell>
                    <TableCell sx={{width: 180}}><SortLabel label="Modified" column="modified" sort={sort} ascending={ascending} onSort={onSort}/></TableCell>
                    <TableCell align="right" sx={{width: 150, fontWeight: 800, fontSize: '0.72rem'}}>Actions</TableCell></TableRow></TableHead>
                <TableBody>{shown.map(entry => {const fullPath = joinPath(directory, entry.name); return <TableRow key={entry.name} hover sx={{'& .file-actions': {opacity: 0}, '&:hover .file-actions, &:focus-within .file-actions': {opacity: 1}}}>
                    <TableCell><Button color="inherit" disabled={entry.type !== 'directory'} onClick={() => entry.type === 'directory' && setDirectory(fullPath)}
                        startIcon={entry.type === 'directory' ? <FolderOutlined color="primary"/> : <InsertDriveFileOutlined sx={{color: '#90caf9'}}/>}
                        sx={{textTransform: 'none', justifyContent: 'flex-start', maxWidth: '100%', minWidth: 0, fontWeight: 650, '& .MuiButton-startIcon': {flexShrink: 0}}}>
                        <Typography noWrap sx={{fontSize: '0.78rem'}} title={entry.linkTarget ? `${entry.name} → ${entry.linkTarget}` : entry.name}>{entry.name}</Typography></Button></TableCell>
                    <TableCell sx={{fontFamily: t.mono, color: t.textDim, fontSize: '0.72rem'}}>{formatSize(entry.size, entry.type === 'directory')}</TableCell>
                    <TableCell sx={{fontFamily: t.mono, fontSize: '0.72rem'}}>{entry.mode} <Typography component="span" sx={{color: t.textDim, fontFamily: t.mono, fontSize: '0.67rem'}}>{entry.permissions}</Typography></TableCell>
                    <TableCell sx={{fontFamily: t.mono, color: t.textDim, fontSize: '0.7rem'}}>{new Date(entry.modified).toLocaleString()}</TableCell>
                    <TableCell align="right"><Stack className="file-actions" direction="row" spacing={0} sx={{justifyContent: 'flex-end', transition: 'opacity .15s'}}>
                        <Tooltip title="Rename"><IconButton size="small" onClick={() => openEdit({kind: 'rename', entry})}><DriveFileRenameOutline fontSize="small"/></IconButton></Tooltip>
                        <Tooltip title="Change permissions"><IconButton size="small" onClick={() => setPermissions(entry)}><SecurityOutlined fontSize="small"/></IconButton></Tooltip>
                        <Tooltip title={entry.type === 'directory' ? 'Download folder' : 'Download'}><IconButton size="small"
                            component={entry.type === 'directory' ? 'button' : 'a'} href={entry.type === 'directory' ? undefined : endpoint('download', {path: fullPath})}
                            onClick={entry.type === 'directory' ? (event: MouseEvent<HTMLButtonElement>) => setArchiveMenu({anchor: event.currentTarget, path: fullPath}) : undefined}>
                            {entry.type === 'directory' ? <ArchiveOutlined fontSize="small"/> : <DownloadOutlined fontSize="small"/>}</IconButton></Tooltip>
                        <Tooltip title="Delete"><IconButton size="small" color="error" onClick={() => setDeleting(entry)}><DeleteOutlined fontSize="small"/></IconButton></Tooltip>
                    </Stack></TableCell>
                </TableRow>;})}</TableBody>
            </Table>
            {!loading && !error && shown.length === 0 && <Typography sx={{p: 4, textAlign: 'center', color: t.textDim}}>This folder is empty.</Typography>}
        </TableContainer>
        <Menu open={archiveMenu !== null} anchorEl={archiveMenu?.anchor} onClose={() => setArchiveMenu(null)}
            slotProps={{paper: {sx: {bgcolor: t.panel, border: `1px solid ${t.border}`, minWidth: 150}}}}>
            <MenuItem component="a" href={archiveMenu ? endpoint('download', {path: archiveMenu.path, format: 'tar'}) : undefined} onClick={() => setArchiveMenu(null)}>Download TAR</MenuItem>
            <MenuItem component="a" href={archiveMenu ? endpoint('download', {path: archiveMenu.path, format: 'zip'}) : undefined} onClick={() => setArchiveMenu(null)}>Download ZIP</MenuItem>
        </Menu>
        <Dialog open={edit !== null} onClose={() => setEdit(null)} maxWidth="xs" fullWidth slotProps={{paper: {sx: {bgcolor: t.panel, border: `1px solid ${t.border}`}}}}>
            <DialogTitle>{edit?.kind === 'rename' ? 'Rename' : edit?.kind === 'new-file' ? 'New file' : 'New folder'}</DialogTitle>
            <DialogContent><TextField autoFocus fullWidth size="small" label="Name" value={editValue} onChange={event => setEditValue(event.target.value)} onKeyDown={event => {if (event.key === 'Enter') void applyEdit();}} sx={{mt: 1}}/></DialogContent>
            <DialogActions><Button onClick={() => setEdit(null)}>Cancel</Button><Button variant="contained" disabled={!editValue.trim()} onClick={() => void applyEdit()}>Apply</Button></DialogActions>
        </Dialog>
        <PermissionsDialog entry={permissions} open={permissions !== null} onClose={() => setPermissions(null)} onApply={(mode, recursive) => {
            if (!permissions) return; void action({action: 'chmod', path: joinPath(directory, permissions.name), mode, recursive}, 'Permissions updated').then(ok => {if (ok) setPermissions(null);});
        }}/>
        <Dialog open={deleting !== null} onClose={() => setDeleting(null)} maxWidth="xs" fullWidth slotProps={{paper: {sx: {bgcolor: t.panel, border: `1px solid ${t.border}`}}}}>
            <DialogTitle>Delete {deleting?.type === 'directory' ? 'folder' : 'file'}?</DialogTitle>
            <DialogContent><Alert severity="warning">This permanently deletes <b>{deleting?.name}</b>{deleting?.type === 'directory' ? ' and all of its contents' : ''}.</Alert></DialogContent>
            <DialogActions><Button onClick={() => setDeleting(null)}>Cancel</Button><Button variant="contained" color="error" onClick={() => {
                if (!deleting) return; void action({action: 'delete', path: joinPath(directory, deleting.name)}, `${deleting.name} deleted`).then(ok => {if (ok) setDeleting(null);});
            }}>Delete</Button></DialogActions>
        </Dialog>
    </Paper>;
}
