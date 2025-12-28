import React, {useCallback, useEffect, useState} from 'react';
import {
    Box,
    Button,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Divider,
    FormControlLabel,
    IconButton,
    InputAdornment,
    Paper,
    Stack,
    Switch,
    Tab,
    Tabs,
    TextField,
    ToggleButton,
    ToggleButtonGroup,
    Typography
} from "@mui/material";
import {
    ChevronRight,
    Close,
    DeleteOutline,
    DnsOutlined,
    Done,
    EditOutlined,
    FolderSpecialOutlined,
    InfoOutlined,
    LanguageOutlined,
    SaveOutlined
} from '@mui/icons-material';
import {ClientType, type FolderAlias, type Host, HostManagerService} from "../../gen/host/v1/host_pb.ts";
import {callRPC, useClient} from "../../lib/api.ts";
import {useSnackbar} from "../../hooks/snackbar.ts";
import scrollbarStyles from "../../components/scrollbar-style.tsx";

const publicKeyHelperText = [
    "When PublicKey is enabled, Dockman installs its public key automatically.",
    "Password is only used for the initial connection.",
    "Enables secure password-less auth for future connections."
];

const passwordHelperText = [
    "When PublicKey is disabled, standard password authentication is used.",
    "Your password is stored to reconnect to the remote host."
];

type CleanHost = Omit<Host, '$typeName' | '$unknown'>;

const createDefaultHost = (existing?: Partial<CleanHost>): CleanHost => ({
    id: existing?.id ?? 0,
    name: existing?.name ?? "",
    kind: existing?.kind ?? ClientType.LOCAL,
    enable: existing?.enable ?? true,
    dockerSocket: existing?.dockerSocket ?? "",
    folderAliases: existing?.folderAliases ?? [],
    sshOptions: existing?.sshOptions ?? {
        id: 0, host: "", port: 22, user: "", password: "",
        remotePublicKey: "", usePublicKeyAuth: true,
        $unknown: undefined, $typeName: "host.v1.SSHConfig"
    }
});

function HostWizardDialog({open, onClose, host, onSuccess}: {
    open: boolean, onClose: () => void, host?: CleanHost, onSuccess: () => void
}) {
    const hostManager = useClient(HostManagerService);
    const {showSuccess, showError} = useSnackbar();

    const [tabValue, setTabValue] = useState(0);
    const [connecting, setConnecting] = useState(false);
    const [form, setForm] = useState<CleanHost>(createDefaultHost(host));
    const isEditMode = !!host?.id;

    useEffect(() => {
        if (open) {
            setTabValue(0);
            setForm(createDefaultHost(host));
        }
    }, [open, host]);

    const handleSaveHost = async () => {
        setConnecting(true);

        let err: string | undefined;
        if (isEditMode) {
            const result = await callRPC(() => hostManager.editHost({host: form}));
            err = result.err;
        } else {
            const result = await callRPC(() => hostManager.createHost({host: form}));
            err = result.err;
        }
        if (err) {
            showError(err);
        } else {
            showSuccess(isEditMode ? "Host updated" : "Host created");
            onSuccess();
            if (!isEditMode) onClose();
        }

        setConnecting(false);
    };

    return (
        <Dialog
            open={open}
            onClose={onClose}
            fullWidth
            maxWidth="sm"
            slotProps={{
                paper: {sx: {borderRadius: 3, backgroundImage: 'none'}}
            }}
        >
            <DialogTitle sx={{p: 3, pb: 0}}>
                <Stack direction="row" alignItems="center" spacing={1.5} sx={{mb: 2}}>
                    <Box sx={{
                        p: 1,
                        borderRadius: 1.5,
                        bgcolor: 'primary.lighter',
                        color: 'primary.main',
                        display: 'flex'
                    }}>
                        <DnsOutlined fontSize="small"/>
                    </Box>
                    <Box>
                        <Typography variant="h6" sx={{fontWeight: 800}}>
                            {isEditMode ? 'Host Settings' : 'Add New Node'}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                            {isEditMode ? `Name: ${host?.name}` : 'Configure a new Docker environment'}
                        </Typography>
                    </Box>
                </Stack>

                <Tabs value={tabValue} onChange={(_, v) => setTabValue(v)}
                      sx={{borderBottom: 1, borderColor: 'divider'}}>
                    <Tab label="Connection" sx={{fontWeight: 700, textTransform: 'none'}}/>
                    <Tab
                        label="Path Aliases"
                        disabled={!isEditMode}
                        sx={{fontWeight: 700, textTransform: 'none'}}
                    />
                </Tabs>
            </DialogTitle>

            <DialogContent sx={{p: 3, minHeight: 450, ...scrollbarStyles}}>
                {tabValue === 0 ? (
                    <Stack spacing={3} sx={{mt: 1}}>
                        <Box>
                            <SectionHeader icon={<LanguageOutlined/>} title="General Identification"/>
                            <Stack direction="row" spacing={2}>
                                <TextField
                                    fullWidth label="Friendly Name"
                                    value={form.name}
                                    onChange={(e) => setForm({...form, name: e.target.value})}
                                />
                                <ToggleButtonGroup
                                    value={form.kind}
                                    exclusive
                                    onChange={(_, v) => v !== null && setForm({...form, kind: v})}
                                >
                                    <ToggleButton value={ClientType.LOCAL} sx={{fontWeight: 700}}>Local</ToggleButton>
                                    <ToggleButton value={ClientType.SSH} sx={{fontWeight: 700}}>SSH</ToggleButton>
                                </ToggleButtonGroup>
                            </Stack>
                        </Box>

                        {form.kind === ClientType.SSH && form.sshOptions && (
                            <Paper variant="outlined" sx={{p: 2, borderStyle: 'dashed'}}>
                                <Stack spacing={2}>
                                    <Stack direction="row" spacing={2}>
                                        <TextField label="Host" fullWidth value={form.sshOptions.host}
                                                   onChange={e => setForm({
                                                       ...form,
                                                       sshOptions: {...form.sshOptions!, host: e.target.value}
                                                   })}/>
                                        <TextField label="Port" type="number" sx={{width: 100}}
                                                   value={form.sshOptions.port} onChange={e => setForm({
                                            ...form,
                                            sshOptions: {...form.sshOptions!, port: parseInt(e.target.value) || 0}
                                        })}/>
                                    </Stack>
                                    <Stack direction="row" spacing={2}>
                                        <TextField label="User" fullWidth value={form.sshOptions.user}
                                                   onChange={e => setForm({
                                                       ...form,
                                                       sshOptions: {...form.sshOptions!, user: e.target.value}
                                                   })}/>
                                        <TextField label="Password" type="password" fullWidth
                                                   value={form.sshOptions.password} onChange={e => setForm({
                                            ...form,
                                            sshOptions: {...form.sshOptions!, password: e.target.value}
                                        })}/>
                                    </Stack>
                                    <Divider/>
                                    <FormControlLabel
                                        control={<Switch checked={form.sshOptions.usePublicKeyAuth}
                                                         onChange={e => setForm({
                                                             ...form,
                                                             sshOptions: {
                                                                 ...form.sshOptions!,
                                                                 usePublicKeyAuth: e.target.checked
                                                             }
                                                         })}/>}
                                        label={<Typography variant="subtitle2" sx={{fontWeight: 700}}>Key
                                            Authentication</Typography>}
                                    />
                                    <Box sx={{
                                        p: 1.5,
                                        bgcolor: 'background.paper',
                                        borderRadius: 1.5,
                                        border: '1px solid',
                                        borderColor: 'divider'
                                    }}>
                                        <Stack direction="row" spacing={1}>
                                            <InfoOutlined sx={{fontSize: 16, color: 'primary.main', mt: 0.2}}/>
                                            <Box>
                                                {(form.sshOptions.usePublicKeyAuth ? publicKeyHelperText : passwordHelperText).map((t, i) => (
                                                    <Typography key={i} variant="caption" display="block"
                                                                color="text.secondary">• {t}</Typography>
                                                ))}
                                            </Box>
                                        </Stack>
                                    </Box>
                                </Stack>
                            </Paper>
                        )}
                    </Stack>
                ) : (
                    <HostAliasManager hostname={host?.name ?? ""} hostId={host?.id ?? 0}/>
                )}
            </DialogContent>

            <Divider/>

            <DialogActions sx={{p: 2.5}}>
                <Button variant="outlined" color="inherit" onClick={onClose}
                        sx={{borderRadius: 2, fontWeight: 700}}>Close</Button>
                <Box sx={{flex: 1}}/>
                {tabValue === 0 && (
                    <Button
                        variant="contained"
                        startIcon={connecting ? <CircularProgress size={18} color="inherit"/> : <SaveOutlined/>}
                        onClick={handleSaveHost}
                        disabled={connecting || !form.name.trim()}
                        sx={{borderRadius: 2, px: 4, fontWeight: 700}}
                    >
                        {isEditMode ? "Save Changes" : "Create Host"}
                    </Button>
                )}
            </DialogActions>
        </Dialog>
    );
}

function HostAliasManager({hostname, hostId}: { hostname: string, hostId: number }) {
    const hostManager = useClient(HostManagerService);
    const {showError, showSuccess} = useSnackbar();

    const [aliases, setAliases] = useState<FolderAlias[]>([]);
    const [loading, setLoading] = useState(false);

    const [newAlias, setNewAlias] = useState({alias: '', path: ''});

    const [editingId, setEditingId] = useState<number | null>(null);
    const [editData, setEditData] = useState({alias: '', path: ''});

    const fetchAliases = useCallback(async () => {
        setLoading(true);
        const {val, err} = await callRPC(() => hostManager.listAlias({host: hostname}));
        if (err) showError(err);
        else setAliases(val?.aliases || []);
        setLoading(false);
    }, [hostname, hostId]);

    useEffect(() => {
        fetchAliases().then();
    }, [fetchAliases]);

    const handleAdd = async () => {
        const {err} = await callRPC(() => hostManager.addAlias({
            hostId: hostId,
            alias: {
                alias: newAlias.alias,
                fullpath: newAlias.path,
            },
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
            hostId: hostId
        }));
        if (err) showError(err);
        else {
            showSuccess("Alias removed");
            await fetchAliases();
        }
    };

    const handleSaveEdit = async (aliasId: number) => {
        const {err} = await callRPC(() => hostManager.editAlias({
            hostId: hostId,
            alias: {
                id: aliasId,
                alias: editData.alias,
                fullpath: editData.path
            },
        }));
        if (err) showError(err);
        else {
            showSuccess("Alias updated");
            setEditingId(null);
            await fetchAliases();
        }
    };

    return (
        <Stack spacing={2} sx={{mt: 1}}>
            <SectionHeader icon={<FolderSpecialOutlined/>} title="Manage Path Aliases"/>

            {/* ADD ROW */}
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
                                startAdornment: <InputAdornment position="start">@</InputAdornment>
                            }
                        }}
                    />
                    <TextField
                        size="small" fullWidth placeholder="/var/lib/docker/..."
                        value={newAlias.path}
                        onChange={e => setNewAlias({...newAlias, path: e.target.value})}
                        sx={{bgcolor: 'background.paper', '& input': {fontFamily: 'monospace', fontSize: '0.8rem'}}}
                    />
                    <Button variant="contained" onClick={handleAdd} disabled={!newAlias.alias || !newAlias.path}>
                        Add
                    </Button>
                </Stack>
            </Paper>

            <Divider/>

            {/* LIST */}
            <Stack spacing={1}>
                {loading && <CircularProgress size={20} sx={{alignSelf: 'center', my: 2}}/>}
                {!loading && aliases.length === 0 && (
                    <Typography variant="body2" color="text.disabled" sx={{textAlign: 'center', py: 2}}>
                        No aliases configured for this host.
                    </Typography>
                )}
                {aliases.map((a) => (
                    <Paper key={a.id} variant="outlined"
                           sx={{p: 1.5, bgcolor: editingId === Number(a.id) ? 'primary.lighter' : 'background.paper'}}>
                        {editingId === Number(a.id) ? (
                            <Stack direction="row" spacing={1} alignItems="center">
                                <TextField
                                    size="small" value={editData.alias}
                                    onChange={e => setEditData({...editData, alias: e.target.value})}
                                    sx={{width: '120px'}}
                                />
                                <TextField
                                    size="small" fullWidth value={editData.path}
                                    onChange={e => setEditData({...editData, path: e.target.value})}
                                    sx={{'& input': {fontFamily: 'monospace', fontSize: '0.8rem'}}}
                                />
                                <IconButton color="primary"
                                            onClick={() => handleSaveEdit(Number(a.id))}><Done/></IconButton>
                                <IconButton onClick={() => setEditingId(null)}><Close/></IconButton>
                            </Stack>
                        ) : (
                            <Stack direction="row" spacing={1} alignItems="center">
                                <Typography variant="subtitle2"
                                            sx={{fontWeight: 700, minWidth: 80}}>@{a.alias}</Typography>
                                <ChevronRight sx={{color: 'text.disabled', fontSize: 16}}/>
                                <Typography variant="body2" sx={{
                                    fontFamily: 'monospace',
                                    flex: 1,
                                    color: 'text.secondary',
                                    fontSize: '0.8rem'
                                }}>
                                    {a.fullpath}
                                </Typography>
                                <IconButton size="small" onClick={() => {
                                    setEditingId(Number(a.id));
                                    setEditData({alias: a.alias, path: a.fullpath});
                                }}><EditOutlined fontSize="small"/></IconButton>
                                <IconButton
                                    size="small"
                                    color="error"
                                    onClick={() => handleDelete(a.alias)}
                                >
                                    <DeleteOutline fontSize="small"/>
                                </IconButton>
                            </Stack>
                        )}
                    </Paper>
                ))}
            </Stack>
        </Stack>
    );
}

const SectionHeader = ({icon, title}: { icon: any, title: string }) => (
    <Stack direction="row" spacing={1} alignItems="center" sx={{mb: 1}}>
        {React.cloneElement(icon, {sx: {fontSize: 16, color: 'primary.main'}})}
        <Typography variant="overline" sx={{fontWeight: 800, color: 'text.secondary', letterSpacing: '0.05em'}}>
            {title}
        </Typography>
    </Stack>
);

export default HostWizardDialog;
