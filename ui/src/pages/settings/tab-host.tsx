import {useEffect, useState} from 'react';
import {
    Box,
    Button,
    Chip,
    CircularProgress,
    Divider,
    Grid,
    IconButton,
    Paper,
    Stack,
    Switch,
    Tooltip,
    Typography
} from "@mui/material";
import {Add, DeleteOutline, DnsOutlined, EditOutlined, FolderSpecialOutlined, Refresh} from '@mui/icons-material';
import {callRPC, useClient} from "../../lib/api.ts";
import {ClientType, type Host, HostManagerService} from "../../gen/host/v1/host_pb.ts";
import EmptyHostDisplay from "./tab-host-empty.tsx";
import HostWizardDialog from "./tab-host-wizard.tsx";
import {useSnackbar} from "../../hooks/snackbar.ts";
import {useHostManager} from "../../context/host-context.tsx";

function TabDockerHosts() {
    const hostClient = useClient(HostManagerService);
    const {showError} = useSnackbar()

    const {fetchHosts} = useHostManager()

    const [hosts, setHosts] = useState<Host[]>([]);
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState("");

    const [dialogOpen, setDialogOpen] = useState(false);
    const [selectedHost, setSelectedHost] = useState<Host | null>(null);

    const loadHosts = async () => {
        setLoading(true);
        setErr("");

        const {val, err} = await callRPC(() => hostClient.listAllHosts({}));
        if (err) {
            setErr(err);
        } else {
            setHosts(val?.hosts ?? []);
        }

        setLoading(false);
    };

    useEffect(() => {
        loadHosts().then();
    }, []);

    const handleToggle = async (host: Host, val: boolean) => {
        const {err} = await callRPC(() => hostClient.toggleClient({name: host.name, enable: val}))
        if (err) showError(`Failed to toggle host ${host.name}`);

        await loadHosts()
    };

    const handleDelete = async (hostname: string) => {
        const {err} = await callRPC(() => hostClient.deleteHost({host: hostname}))
        if (err) {
            showError(`Error occurred while deleting host ${err}`);
        }

        await loadHosts()
    };

    function onClose() {
        loadHosts().then()
        fetchHosts().then()
        setDialogOpen(false)
    }

    return (
        <Box sx={{p: 3}}>
            <Stack direction="row" justifyContent="" alignItems="center" sx={{mb: 4}}>
                <Box sx={{pr: 3}}>
                    <Typography variant="h5" sx={{fontWeight: 800}}>Hosts</Typography>
                    <Typography variant="body2" color="text.secondary">
                        Manage local and remote Docker engines
                    </Typography>
                </Box>

                <Stack direction="row" spacing={2}>
                    <Button
                        variant="contained"
                        onClick={() => {
                            loadHosts().then()
                        }}
                        sx={{borderRadius: 2, minWidth: 'auto', px: 1.5, py: 1}}
                    >
                        <Refresh/>
                    </Button>
                    <Button
                        variant="contained"
                        startIcon={<Add/>}
                        onClick={() => {
                            setSelectedHost(null);
                            setDialogOpen(true);
                        }}
                        sx={{borderRadius: 2, px: 3}}
                    >
                        Add Host
                    </Button>
                </Stack>
            </Stack>

            {err && <Chip label={err} color="error" variant="outlined" sx={{mb: 2}}/>}

            {loading && hosts.length === 0 ? (
                <Box sx={{display: 'flex', justifyContent: 'center', py: 8}}><CircularProgress/></Box>
            ) : hosts.length > 0 ? (
                <Grid container spacing={3}>
                    {hosts.map((h) => (
                        <Grid size={{xs: 12, sm: 3, md: 2}} key={h.id.toString()}>
                            <HostCard
                                host={h}
                                onEdit={() => {
                                    setSelectedHost(h);
                                    setDialogOpen(true);
                                }}
                                onDelete={() => handleDelete((h.name))}
                                onToggle={(val: boolean) => handleToggle(h, val)}
                            />
                        </Grid>
                    ))}
                </Grid>
            ) : (
                <EmptyHostDisplay onAdd={() => setDialogOpen(true)}/>
            )}

            <HostWizardDialog
                open={dialogOpen}
                onClose={onClose}
                host={selectedHost ?? undefined}
                onSuccess={loadHosts}
            />
        </Box>
    );
}

function HostCard({host, onEdit, onDelete, onToggle}: {
    host: Host,
    onEdit: () => void,
    onDelete: () => void,
    onToggle: (val: boolean) => Promise<void>
}) {
    const [isToggling, setIsToggling] = useState(false)

    const kind = ClientType[host.kind].toLowerCase();
    return (
        <Paper variant="outlined" sx={{
            p: 2,
            borderRadius: 3,
            position: 'relative',
            transition: 'all 0.2s',
            '&:hover': {borderColor: 'primary.main', boxShadow: '0 4px 12px rgba(0,0,0,0.05)'}
        }}>
            <Stack spacing={2}>
                <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                    <Stack direction="row" spacing={1.5} alignItems="center">
                        <Box sx={{
                            p: 1,
                            bgcolor: host.enable ? 'primary.lighter' : 'primary.darker',
                            borderRadius: 2,
                            color: host.enable ? 'primary.main' : 'text.disabled',
                            display: 'flex'
                        }}>
                            <DnsOutlined/>
                        </Box>
                        <Box>
                            <Typography variant="subtitle1" sx={{fontWeight: 800}}>{host.name}</Typography>
                            <Typography variant="caption" color="text.secondary" sx={{fontFamily: 'monospace'}}>
                                Type:{kind}
                            </Typography>
                        </Box>
                    </Stack>
                    {isToggling ? (
                        <Box sx={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: 58,
                            height: 38
                        }}>
                            <CircularProgress size={20}/>
                        </Box>
                    ) : (
                        <Switch
                            checked={host.enable}
                            onChange={async event => {
                                setIsToggling(true)
                                await onToggle(event.target.checked)
                                setIsToggling(false)
                            }}
                            size="small"
                        />
                    )}
                </Stack>

                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                    <Chip
                        size="small"
                        icon={<FolderSpecialOutlined sx={{fontSize: '14px !important'}}/>}
                        label={`${host.folderAliases?.length || 0} Alias`}
                        variant="outlined"
                    />
                </Stack>

                <Divider/>

                <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Box>
                        <Tooltip title="Edit Host">
                            <IconButton size="small" onClick={onEdit}>
                                <EditOutlined fontSize="small"/>
                            </IconButton>
                        </Tooltip>
                        <Tooltip title="Remove Host">
                            <IconButton size="small" color="error" onClick={onDelete}>
                                <DeleteOutline fontSize="small"/>
                            </IconButton>
                        </Tooltip>
                    </Box>
                </Stack>
            </Stack>
        </Paper>
    );
}

export default TabDockerHosts
