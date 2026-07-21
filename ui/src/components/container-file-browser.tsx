import {
    Alert, Box, Button, Checkbox, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
    FormControlLabel, IconButton, Menu, MenuItem, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead,
    TableRow, TextField, Tooltip, Typography,
} from '@mui/material';
import {
    ArchiveOutlined, ArrowBack, ArrowDownward, ArrowUpward, CreateNewFolderOutlined, DeleteOutlined, DownloadOutlined,
    DriveFileRenameOutline, FileUploadOutlined, FolderOutlined, HomeOutlined, InsertDriveFileOutlined,
    ManageAccountsOutlined, NoteAddOutlined, Refresh, SecurityOutlined, Visibility, VisibilityOff,
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
    uid: number | null;
    gid: number | null;
    linkTarget?: string;
}

interface ListResponse { path: string; entries: FileEntry[]; readOnly?: boolean; rootReadOnly?: boolean }
type SortKey = 'name' | 'size' | 'mode' | 'modified';
type EditDialog = null | {kind: 'new-file' | 'new-folder' | 'rename'; entry?: FileEntry};

const joinPath = (directory: string, name: string) => `${directory === '/' ? '' : directory}/${name}`;
const parentPath = (value: string) => value === '/' ? '/' : value.slice(0, value.lastIndexOf('/')) || '/';
const formatSize = (value: number, directory: boolean) => {
    if (directory || value < 0) return '—';
    if (value < 1024) return `${value} B`;
    const units = ['KB', 'MB', 'GB', 'TB']; let size = value / 1024; let unit = 0;
    while (size >= 1024 && unit < units.length - 1) {size /= 1024; unit += 1;}
    return `${size.toFixed(size >= 10 ? 1 : 2)} ${units[unit]}`;
};
const formatModified = (value: string) => {
    const timestamp = Date.parse(value);
    return Number.isNaN(timestamp) ? '—' : new Date(timestamp).toLocaleString();
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

function OwnershipDialog({entry, open, onClose, onApply}: {
    entry: FileEntry | null; open: boolean; onClose: () => void;
    onApply: (uid: number, gid: number, recursive: boolean) => void;
}) {
    const [uid, setUID] = useState('0'); const [gid, setGID] = useState('0'); const [recursive, setRecursive] = useState(false);
    useEffect(() => {if (entry) {setUID(entry.uid == null ? '' : String(entry.uid)); setGID(entry.gid == null ? '' : String(entry.gid)); setRecursive(false);}}, [entry]);
    const validID = (value: string) => /^\d+$/.test(value) && Number(value) <= 4294967294;
    const valid = validID(uid) && validID(gid);
    return <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth slotProps={{paper: {sx: {bgcolor: t.panel, border: `1px solid ${t.border}`}}}}>
        <DialogTitle sx={{fontWeight: 800}}>Change ownership</DialogTitle>
        <DialogContent>
            <Typography sx={{color: t.textDim, mb: 1.5, fontFamily: t.mono}}>{entry?.name}</Typography>
            <Stack direction="row" spacing={1.5}>
                <TextField fullWidth size="small" label="Owner UID" value={uid} onChange={event => setUID(event.target.value.trim())}
                    error={!validID(uid)} slotProps={{htmlInput: {inputMode: 'numeric'}}}/>
                <TextField fullWidth size="small" label="Group GID" value={gid} onChange={event => setGID(event.target.value.trim())}
                    error={!validID(gid)} slotProps={{htmlInput: {inputMode: 'numeric'}}}/>
            </Stack>
            {entry?.type === 'directory' && <FormControlLabel control={<Checkbox checked={recursive} onChange={(_, value) => setRecursive(value)}/>} label="Apply recursively"/>}
        </DialogContent>
        <DialogActions><Button onClick={onClose}>Cancel</Button><Button variant="contained" disabled={!valid}
            onClick={() => onApply(Number(uid), Number(gid), recursive)}>Apply</Button></DialogActions>
    </Dialog>;
}

export default function ContainerFileBrowser({kind, target, active = true}: {kind: FileBrowserKind; target: string; active?: boolean}) {
    const hostUrl = useHostUrl(); const {showError, showSuccess} = useSnackbar(); const uploadRef = useRef<HTMLInputElement>(null);
    const requestRef = useRef(0); const cacheRef = useRef(new Map<string, ListResponse>());
    const [directory, setDirectory] = useState('/'); const [entries, setEntries] = useState<FileEntry[]>([]);
    const [loading, setLoading] = useState(false); const [error, setError] = useState(''); const [hidden, setHidden] = useState(false);
    const [readOnly, setReadOnly] = useState(false); const [rootReadOnly, setRootReadOnly] = useState(false);
    const [sort, setSort] = useState<SortKey>('name'); const [ascending, setAscending] = useState(true);
    const [edit, setEdit] = useState<EditDialog>(null); const [editValue, setEditValue] = useState('');
    const [permissions, setPermissions] = useState<FileEntry | null>(null); const [ownership, setOwnership] = useState<FileEntry | null>(null);
    const [deleting, setDeleting] = useState<FileEntry | null>(null);
    const [archiveMenu, setArchiveMenu] = useState<{anchor: HTMLElement; path: string} | null>(null);
    const [actionSuppressed, setActionSuppressed] = useState<string | null>(null);
    const base = useMemo(() => `/docker/files/${kind}/${encodeURIComponent(target)}`, [kind, target]);
    const endpoint = useCallback((action: string, params?: Record<string, string>) => {
        const query = new URLSearchParams(params); return hostUrl(`${base}/${action}${query.size ? `?${query}` : ''}`);
    }, [base, hostUrl]);
    const load = useCallback(async () => {
        if (!active || !target) return;
        const request = ++requestRef.current;
        setLoading(true); setError('');
        try {
            const response = await fetch(endpoint('list', {path: directory}));
            if (!response.ok) throw new Error(await responseError(response));
            const data = await response.json() as ListResponse;
            if (request !== requestRef.current || data.path !== directory) return;
            cacheRef.current.set(directory, data); setEntries(data.entries ?? []); setReadOnly(Boolean(data.readOnly)); setRootReadOnly(Boolean(data.rootReadOnly));
        } catch (reason) {if (request === requestRef.current) {setError(reason instanceof Error ? reason.message : String(reason)); setReadOnly(true);}}
        finally {if (request === requestRef.current) setLoading(false);}
    }, [active, directory, endpoint, target]);
    useEffect(() => {requestRef.current += 1; cacheRef.current.clear(); setDirectory('/'); setEntries([]); setReadOnly(false); setRootReadOnly(false);}, [kind, target]);
    useEffect(() => {void load();}, [load]);

    const navigate = (next: string) => {
        // React deliberately ignores state updates to the current value. Do not
        // enter the loading state unless changing directory will trigger load().
        if (next === directory) return;
        requestRef.current += 1;
        setLoading(true);
        const cached = cacheRef.current.get(next);
        if (cached) {setEntries(cached.entries ?? []); setReadOnly(Boolean(cached.readOnly)); setRootReadOnly(Boolean(cached.rootReadOnly)); setError('');}
        else {setEntries([]); setError('');}
        setDirectory(next);
    };

    const shown = useMemo(() => entries.filter(entry => hidden || !entry.name.startsWith('.')).sort((a, b) => {
        if (a.type === 'directory' && b.type !== 'directory') return -1;
        if (a.type !== 'directory' && b.type === 'directory') return 1;
        const direction = ascending ? 1 : -1;
        if (sort === 'size') return direction * (a.size - b.size);
        return direction * String(a[sort]).localeCompare(String(b[sort]), undefined, {numeric: true, sensitivity: 'base'});
    }), [ascending, entries, hidden, sort]);
    const onSort = (column: SortKey) => {if (sort === column) setAscending(value => !value); else {setSort(column); setAscending(true);}};
    const writeBlocked = readOnly || loading;
    const writeTooltip = (label: string) => loading ? 'Loading directory'
        : readOnly ? `${kind === 'volume' ? 'Volume' : 'Container filesystem'} is read-only` : label;
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
    const download = (filePath: string, format?: 'tar' | 'zip') => {
        const anchor = document.createElement('a');
        anchor.href = endpoint('download', {path: filePath, ...(format ? {format} : {})});
        anchor.download = '';
        anchor.style.display = 'none';
        document.body.appendChild(anchor);
        anchor.click();
        window.setTimeout(() => anchor.remove(), 1000);
    };
    const breadcrumbs = directory.split('/').filter(Boolean);
    return <Paper variant="outlined" sx={{height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', bgcolor: t.panel, borderColor: t.border}}>
        <Stack direction="row" sx={{alignItems: 'center', gap: 0.4, px: 1, py: 0.75, flexShrink: 0, borderBottom: `1px solid ${t.border}`}}>
            <Tooltip title="Parent folder"><span><IconButton size="small" disabled={directory === '/'} onClick={() => navigate(parentPath(directory))}><ArrowBack/></IconButton></span></Tooltip>
            <Tooltip title="Root folder"><span><IconButton size="small" disabled={directory === '/'} onClick={() => navigate('/')}><HomeOutlined/></IconButton></span></Tooltip>
            <Typography component="span" sx={{color: t.textDim}}>/</Typography>
            {breadcrumbs.map((part, index) => <Button key={`${part}-${index}`} size="small" color="inherit" onClick={() => navigate('/' + breadcrumbs.slice(0, index + 1).join('/'))}
                sx={{textTransform: 'none', minWidth: 0, px: 0.4, fontFamily: t.mono}}>{part}{index < breadcrumbs.length - 1 ? ' /' : ''}</Button>)}
            <Box sx={{flex: 1}}/>
            {!loading && readOnly && <Typography sx={{px: 0.8, color: '#ffb74d', fontSize: '0.7rem', fontWeight: 800}}>READ-ONLY</Typography>}
            {!loading && !readOnly && rootReadOnly && <Tooltip title="The container root filesystem is read-only, but this mounted path is writable" arrow>
                <Typography sx={{px: 0.8, color: '#66bb6a', fontSize: '0.7rem', fontWeight: 800}}>RW MOUNT</Typography>
            </Tooltip>}
            <Tooltip title={writeTooltip('New file')}><span><IconButton size="small" disabled={writeBlocked} onClick={() => openEdit({kind: 'new-file'})}><NoteAddOutlined/></IconButton></span></Tooltip>
            <Tooltip title={writeTooltip('New folder')}><span><IconButton size="small" disabled={writeBlocked} onClick={() => openEdit({kind: 'new-folder'})}><CreateNewFolderOutlined/></IconButton></span></Tooltip>
            <Tooltip title={writeTooltip('Upload files')}><span><IconButton size="small" disabled={writeBlocked} onClick={() => uploadRef.current?.click()}><FileUploadOutlined/></IconButton></span></Tooltip>
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
                    <TableCell align="right" sx={{width: 180, fontWeight: 800, fontSize: '0.72rem'}}>Actions</TableCell></TableRow></TableHead>
                <TableBody>{shown.map(entry => {const fullPath = joinPath(directory, entry.name); const folder = entry.type === 'directory'; return <TableRow key={entry.name} hover
                    onMouseLeave={() => setActionSuppressed(current => current === entry.name ? null : current)}
                    sx={{'& .file-actions': {opacity: 0}, '&:hover .file-actions': {opacity: actionSuppressed === entry.name ? 0 : 1}}}>
                    <TableCell onClick={() => folder && navigate(fullPath)} sx={{cursor: folder ? 'pointer' : 'default', userSelect: 'text'}}>
                        <Stack direction="row" spacing={1} sx={{alignItems: 'center', minWidth: 0, width: '100%'}}>
                            {folder ? <FolderOutlined color="primary"/> : <InsertDriveFileOutlined sx={{color: '#90caf9'}}/>}
                            <Typography noWrap sx={{fontSize: '0.79rem', fontWeight: folder ? 700 : 500, color: t.text, minWidth: 0}}
                                title={entry.linkTarget ? `${entry.name} → ${entry.linkTarget}` : entry.name}>{entry.name}</Typography>
                        </Stack>
                    </TableCell>
                    <TableCell sx={{fontFamily: t.mono, color: t.textDim, fontSize: '0.72rem'}}>{formatSize(entry.size, entry.type === 'directory')}</TableCell>
                    <TableCell sx={{fontFamily: t.mono, fontSize: '0.72rem'}}>{entry.mode} <Typography component="span" sx={{color: t.textDim, fontFamily: t.mono, fontSize: '0.67rem'}}>{entry.permissions}</Typography>
                        <Typography component="div" sx={{color: t.textDim, fontFamily: t.mono, fontSize: '0.64rem'}}>UID:GID {entry.uid == null || entry.gid == null ? '—' : `${entry.uid}:${entry.gid}`}</Typography>
                    </TableCell>
                    <TableCell sx={{fontFamily: t.mono, color: t.textDim, fontSize: '0.7rem'}}>{formatModified(entry.modified)}</TableCell>
                    <TableCell align="right"><Stack className="file-actions" direction="row" spacing={0} sx={{justifyContent: 'flex-end', transition: 'opacity .15s'}}>
                        <Tooltip title={writeTooltip('Rename')}><span><IconButton size="small" disabled={writeBlocked} onClick={event => {event.currentTarget.blur(); setActionSuppressed(entry.name); openEdit({kind: 'rename', entry});}}><DriveFileRenameOutline fontSize="small"/></IconButton></span></Tooltip>
                        <Tooltip title={writeTooltip('Change permissions')}><span><IconButton size="small" disabled={writeBlocked} onClick={event => {event.currentTarget.blur(); setActionSuppressed(entry.name); setPermissions(entry);}}><SecurityOutlined fontSize="small"/></IconButton></span></Tooltip>
                        <Tooltip title={writeTooltip('Change ownership')}><span><IconButton size="small" disabled={writeBlocked} onClick={event => {event.currentTarget.blur(); setActionSuppressed(entry.name); setOwnership(entry);}}><ManageAccountsOutlined fontSize="small"/></IconButton></span></Tooltip>
                        <Tooltip title={entry.type === 'directory' ? 'Download folder' : 'Download'}><IconButton size="small"
                            onClick={(event: MouseEvent<HTMLButtonElement>) => {event.currentTarget.blur(); setActionSuppressed(entry.name); if (folder) setArchiveMenu({anchor: event.currentTarget, path: fullPath}); else download(fullPath);}}>
                            {entry.type === 'directory' ? <ArchiveOutlined fontSize="small"/> : <DownloadOutlined fontSize="small"/>}</IconButton></Tooltip>
                        <Tooltip title={writeTooltip('Delete')}><span><IconButton size="small" color="error" disabled={writeBlocked} onClick={event => {event.currentTarget.blur(); setActionSuppressed(entry.name); setDeleting(entry);}}><DeleteOutlined fontSize="small"/></IconButton></span></Tooltip>
                    </Stack></TableCell>
                </TableRow>;})}</TableBody>
            </Table>
            {!loading && !error && shown.length === 0 && <Typography sx={{p: 4, textAlign: 'center', color: t.textDim}}>This folder is empty.</Typography>}
        </TableContainer>
        <Menu open={archiveMenu !== null} anchorEl={archiveMenu?.anchor} onClose={() => setArchiveMenu(null)}
            slotProps={{paper: {sx: {bgcolor: t.panel, border: `1px solid ${t.border}`, minWidth: 150}}}}>
            <MenuItem onClick={() => {if (archiveMenu) download(archiveMenu.path, 'tar'); setArchiveMenu(null);}}>Download TAR</MenuItem>
            <MenuItem onClick={() => {if (archiveMenu) download(archiveMenu.path, 'zip'); setArchiveMenu(null);}}>Download ZIP</MenuItem>
        </Menu>
        <Dialog open={edit !== null} onClose={() => setEdit(null)} maxWidth="xs" fullWidth slotProps={{paper: {sx: {bgcolor: t.panel, border: `1px solid ${t.border}`}}}}>
            <DialogTitle>{edit?.kind === 'rename' ? 'Rename' : edit?.kind === 'new-file' ? 'New file' : 'New folder'}</DialogTitle>
            <DialogContent><TextField autoFocus fullWidth size="small" label="Name" value={editValue} onChange={event => setEditValue(event.target.value)} onKeyDown={event => {if (event.key === 'Enter') void applyEdit();}} sx={{mt: 1}}/></DialogContent>
            <DialogActions><Button onClick={() => setEdit(null)}>Cancel</Button><Button variant="contained" disabled={!editValue.trim()} onClick={() => void applyEdit()}>Apply</Button></DialogActions>
        </Dialog>
        <PermissionsDialog entry={permissions} open={permissions !== null} onClose={() => setPermissions(null)} onApply={(mode, recursive) => {
            if (!permissions) return; void action({action: 'chmod', path: joinPath(directory, permissions.name), mode, recursive}, 'Permissions updated').then(ok => {if (ok) setPermissions(null);});
        }}/>
        <OwnershipDialog entry={ownership} open={ownership !== null} onClose={() => setOwnership(null)} onApply={(uid, gid, recursive) => {
            if (!ownership) return; void action({action: 'chown', path: joinPath(directory, ownership.name), uid, gid, recursive}, 'Ownership updated').then(ok => {if (ok) setOwnership(null);});
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
