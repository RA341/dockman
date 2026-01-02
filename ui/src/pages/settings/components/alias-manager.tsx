import {useCallback, useEffect, useState} from 'react';
import {
    Box,
    Button,
    CircularProgress,
    Divider,
    IconButton,
    InputAdornment,
    Paper,
    Stack,
    TextField,
    Typography
} from "@mui/material";
import {
    ChevronRight,
    Close,
    DeleteOutline,
    Done,
    EditOutlined,
    Folder as FolderIcon,
    FolderSpecialOutlined
} from '@mui/icons-material';
import {amber} from "@mui/material/colors";
import FolderPickerDialog from "./file-picker.tsx";
import {type FolderAlias, HostManagerService} from "../../../gen/host/v1/host_pb.ts";
import {callRPC, useClient} from "../../../lib/api.ts";
import {useSnackbar} from "../../../hooks/snackbar.ts";
import {SectionHeader} from "./host-wizard.tsx";

function HostAliasManager({hostname, hostId}: { hostname: string, hostId: number }) {
    const hostManager = useClient(HostManagerService);
    const {showError, showSuccess} = useSnackbar();

    const [aliases, setAliases] = useState<FolderAlias[]>([]);
    const [loading, setLoading] = useState(false);

    // Form States
    const [newAlias, setNewAlias] = useState({alias: '', path: ''});
    const [editingId, setEditingId] = useState<number | null>(null);
    const [editData, setEditData] = useState({alias: '', path: ''});

    // Picker State: Tracks if we are picking for the 'new' row or a specific alias 'id'
    const [pickerTarget, setPickerTarget] = useState<'new' | number | null>(null);

    const fetchAliases = useCallback(async () => {
        setLoading(true);
        const {val, err} = await callRPC(() => hostManager.listAlias({host: hostname}));
        if (err) showError(err);
        else setAliases(val?.aliases || []);
        setLoading(false);
    }, [hostname]);

    useEffect(() => {
        fetchAliases().then();
    }, [fetchAliases]);

    const handleAdd = async () => {
        const {err} = await callRPC(() => hostManager.addAlias({
            host: {hostId, hostname},
            alias: {alias: newAlias.alias, fullpath: newAlias.path},
        }));
        if (err) showError(err);
        else {
            showSuccess("Alias added");
            setNewAlias({alias: '', path: ''});
            await fetchAliases();
        }
    };

    const handleDelete = async (name: string) => {
        const {err} = await callRPC(() => hostManager.deleteAlias({
            alias: name,
            host: {hostId, hostname}
        }));
        if (err) showError(err);
        else {
            showSuccess("Alias removed");
            await fetchAliases();
        }
    };

    const handleSaveEdit = async (aliasId: number) => {
        const {err} = await callRPC(() => hostManager.editAlias({
            host: {hostId, hostname},
            alias: {id: aliasId, alias: editData.alias, fullpath: editData.path},
        }));
        if (err) showError(err);
        else {
            showSuccess("Alias updated");
            setEditingId(null);
            await fetchAliases();
        }
    };

    // Helper to determine which path to send to the picker as starting point
    const getInitialPath = () => {
        if (pickerTarget === 'new') return newAlias.path || "/";
        if (typeof pickerTarget === 'number') return editData.path || "/";
        return "/";
    };

    return (
        <Stack spacing={2} sx={{mt: 1}}>
            <SectionHeader icon={<FolderSpecialOutlined/>} title="Manage Path Aliases"/>

            <Paper variant="outlined" sx={{p: 2, borderStyle: 'dashed'}}>
                <Typography variant="caption" sx={{fontWeight: 700, mb: 1, display: 'block', color: 'text.secondary'}}>
                    ADD NEW ALIAS
                </Typography>
                <Stack direction="row" spacing={1}>
                    <TextField
                        size="small" placeholder="Alias"
                        value={newAlias.alias}
                        onChange={e => setNewAlias({...newAlias, alias: e.target.value})}
                        sx={{width: '140px', bgcolor: 'background.paper'}}
                        slotProps={{
                            input: {
                                startAdornment: (
                                    <InputAdornment position="start">
                                        <Typography variant="caption" sx={{fontWeight: 800}}>
                                            @
                                        </Typography>
                                    </InputAdornment>
                                )
                            }
                        }}
                    />
                    <TextField
                        size="small" fullWidth placeholder="Select path..."
                        value={newAlias.path}
                        onClick={() => setPickerTarget('new')}
                        sx={{
                            bgcolor: 'background.paper',
                            cursor: 'pointer',
                            '& input': {fontFamily: 'monospace', fontSize: '0.8rem', cursor: 'pointer'}
                        }}
                        slotProps={{
                            input: {
                                readOnly: true,
                                endAdornment: (
                                    <InputAdornment position="end">
                                        <IconButton size="small" onClick={() => setPickerTarget('new')}>
                                            <FolderIcon fontSize="small" sx={{color: amber[700]}}/>
                                        </IconButton>
                                    </InputAdornment>
                                )
                            }
                        }}
                    />
                    <Button variant="contained" onClick={handleAdd} disabled={!newAlias.alias || !newAlias.path}
                            sx={{fontWeight: 700}}>
                        Add
                    </Button>
                </Stack>
            </Paper>

            <Divider sx={{my: 1}}/>

            {/* LIST */}
            <Stack spacing={1}>
                {loading &&
                    <Box sx={{display: 'flex', justifyContent: 'center', py: 2}}><CircularProgress size={24}/></Box>}
                {!loading && aliases.length === 0 && (
                    <Typography variant="body2" color="text.disabled"
                                sx={{textAlign: 'center', py: 4, fontStyle: 'italic'}}>
                        No aliases configured for this node.
                    </Typography>
                )}
                {aliases.map((a) => {
                    const isEditing = editingId === Number(a.id);
                    return (
                        <Paper key={a.id} variant="outlined" sx={{
                            p: 1.5,
                            transition: 'all 0.2s',
                            bgcolor: isEditing ? 'primary.lighter' : 'background.paper',
                            borderColor: isEditing ? 'primary.main' : 'divider'
                        }}>
                            {isEditing ? (
                                <Stack direction="row" spacing={1} alignItems="center">
                                    <TextField
                                        size="small" value={editData.alias}
                                        onChange={e => setEditData({...editData, alias: e.target.value})}
                                        sx={{width: '120px', bgcolor: 'background.paper'}}
                                    />
                                    <TextField
                                        size="small" fullWidth value={editData.path}
                                        onClick={() => setPickerTarget(Number(a.id))}
                                        sx={{
                                            bgcolor: 'background.paper',
                                            cursor: 'pointer',
                                            '& input': {fontFamily: 'monospace', fontSize: '0.8rem', cursor: 'pointer'}
                                        }}
                                        slotProps={{
                                            input: {
                                                readOnly: true,
                                                endAdornment: (
                                                    <InputAdornment position="end">
                                                        <IconButton size="small" onClick={() => setPickerTarget('new')}>
                                                            <FolderIcon fontSize="small" sx={{color: amber[700]}}/>
                                                        </IconButton>
                                                    </InputAdornment>
                                                )
                                            }
                                        }}
                                    />
                                    <IconButton color="primary" onClick={() => handleSaveEdit(Number(a.id))}
                                                size="small"><Done/></IconButton>
                                    <IconButton onClick={() => setEditingId(null)} size="small"><Close/></IconButton>
                                </Stack>
                            ) : (
                                <Stack direction="row" spacing={1} alignItems="center">
                                    <Typography variant="subtitle2" sx={{
                                        fontWeight: 700,
                                        minWidth: 80,
                                        color: 'primary.main'
                                    }}>@{a.alias}</Typography>
                                    <ChevronRight sx={{color: 'text.disabled', fontSize: 16}}/>
                                    <Typography variant="body2" sx={{
                                        fontFamily: 'monospace',
                                        flex: 1,
                                        color: 'text.secondary',
                                        fontSize: '0.8rem',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis'
                                    }}>
                                        {a.fullpath}
                                    </Typography>
                                    <IconButton size="small" onClick={() => {
                                        setEditingId(Number(a.id));
                                        setEditData({alias: a.alias, path: a.fullpath});
                                    }}><EditOutlined fontSize="small"/></IconButton>
                                    <IconButton size="small" color="error"
                                                onClick={() => handleDelete(a.alias)}><DeleteOutline fontSize="small"/></IconButton>
                                </Stack>
                            )}
                        </Paper>
                    );
                })}
            </Stack>

            {/* SHARED FOLDER PICKER */}
            <FolderPickerDialog
                open={pickerTarget !== null}
                hostname={hostname}
                initialPath={getInitialPath()}
                onClose={() => setPickerTarget(null)}
                onSelect={(pickedPath) => {
                    if (pickerTarget === 'new') {
                        setNewAlias(prev => ({...prev, path: pickedPath}));
                    } else if (typeof pickerTarget === 'number') {
                        setEditData(prev => ({...prev, path: pickedPath}));
                    }
                    setPickerTarget(null);
                }}
            />
        </Stack>
    );
}

export default HostAliasManager