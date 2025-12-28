import React, {useEffect, useState} from 'react';
import {
    Alert,
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
    Step,
    StepLabel,
    Stepper,
    Switch,
    TextField,
    ToggleButton,
    ToggleButtonGroup,
    Typography
} from "@mui/material";
import {
    Add,
    ArrowBack,
    ArrowForward,
    Cancel,
    ChevronRight,
    Close,
    DnsOutlined,
    FolderSpecialOutlined,
    InfoOutlined,
    LanguageOutlined,
    VpnKeyOutlined
} from '@mui/icons-material';
import {ClientType, type Host, HostManagerService} from "../../gen/host/v1/host_pb.ts";
import {callRPC, useClient} from "../../lib/api.ts";
import {useSnackbar} from "../../hooks/snackbar.ts";

const publicKeyHelperText = [
    "When PublicKey is enabled",
    "Password is only used for the initial connection",
    "Dockman installs its public key on the remote host automatically",
    "Enables secure password-less auth for future connections",
    "Your password will not be stored long-term"
];

const passwordHelperText = [
    "When PublicKey is disabled",
    "Standard password authentication is used",
    "Your password is stored to reconnect to the remote host"
];

type CleanHost = Omit<Host, '$typeName' | '$unknown'>;

// Helper to ensure we always have a valid structure for the form
const createDefaultHost = (existing?: Partial<CleanHost>): CleanHost => ({
    id: existing?.id ?? 0,
    name: existing?.name ?? "",
    kind: existing?.kind ?? ClientType.LOCAL,
    enable: existing?.enable ?? true,
    dockerSocket: existing?.dockerSocket ?? "",
    folderAliases: existing?.folderAliases ?? [],
    sshOptions: existing?.sshOptions ?? {
        id: 0,
        name: "",
        host: "",
        port: 22,
        user: "",
        password: "",
        remotePublicKey: "",
        usePublicKeyAuth: true
    }
});

function HostWizardDialog({open, onClose, host, onSuccess}: {
    open: boolean,
    onClose: () => void,
    host?: CleanHost,
    onSuccess: () => void
}) {
    const hostManager = useClient(HostManagerService);
    const {showSuccess} = useSnackbar();

    const [activeStep, setActiveStep] = useState(0);
    const [connecting, setConnecting] = useState(false);
    const [error, setError] = useState("");
    const [form, setForm] = useState<CleanHost>(createDefaultHost(host));

    useEffect(() => {
        if (open) {
            setActiveStep(0);
            setError("");
            setForm(createDefaultHost(host));
        }
    }, [open, host]);

    const handleKindChange = (_: React.MouseEvent<HTMLElement>, newKind: number | null) => {
        if (newKind !== null) {
            setForm(prev => ({...prev, kind: newKind}));
        }
    };

    const handleNext = async () => {
        setConnecting(true);
        setError("");

        const {err} = await callRPC(() => hostManager.createHost({
            host: form,
        }));

        setConnecting(false);

        if (err) {
            setError(err);
        } else {
            setActiveStep(1);
        }
    };

    const handleFinish = async () => {
        // Placeholder for an Alias update RPC if needed,
        // usually 'createHost' handles the initial aliases too.
        showSuccess("Environment configured successfully");
        onSuccess();
        onClose();
    };

    const isSsh = form.kind === ClientType.SSH;

    return (
        <Dialog
            open={open}
            onClose={onClose}
            fullWidth
            maxWidth="sm"
            PaperProps={{sx: {borderRadius: 3, backgroundImage: 'none'}}}
        >
            <DialogTitle sx={{p: 3, pb: 2}}>
                <Stack direction="row" alignItems="center" spacing={1.5} sx={{mb: 2}}>
                    <Box sx={{
                        p: 1, borderRadius: 1.5, bgcolor: 'primary.lighter',
                        color: 'primary.main', display: 'flex'
                    }}>
                        <DnsOutlined fontSize="small"/>
                    </Box>
                    <Box>
                        <Typography variant="h6" sx={{fontWeight: 800, lineHeight: 1.2}}>
                            {host?.id ? 'Edit Node' : 'Add New Node'}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                            Configure a local or remote Docker environment
                        </Typography>
                    </Box>
                </Stack>
                <Stepper activeStep={activeStep} sx={{mt: 1}}>
                    <Step><StepLabel><Typography variant="caption"
                                                 sx={{fontWeight: 700}}>Connection</Typography></StepLabel></Step>
                    <Step><StepLabel><Typography variant="caption" sx={{fontWeight: 700}}>Path
                        Aliases</Typography></StepLabel></Step>
                </Stepper>
            </DialogTitle>

            <DialogContent sx={{p: 3, pt: 1, minHeight: 380}}>
                {connecting ? (
                    <Stack spacing={2} alignItems="center" justifyContent="center" sx={{py: 8}}>
                        <CircularProgress size={40} thickness={5}/>
                        <Typography variant="body2" sx={{fontWeight: 600}} color="text.secondary">
                            Verifying host connectivity...
                        </Typography>
                    </Stack>
                ) : activeStep === 0 ? (
                    <Stack spacing={3} sx={{mt: 1}}>
                        <Box>
                            <SectionHeader icon={<LanguageOutlined/>} title="General Identification"/>
                            <Stack direction="row" spacing={2} alignItems="flex-start">
                                <TextField
                                    fullWidth label="Friendly Name"
                                    placeholder="e.g. Production-Web"
                                    value={form.name}
                                    onChange={(e) => setForm({...form, name: e.target.value})}
                                />
                                <ToggleButtonGroup
                                    value={form.kind}
                                    exclusive
                                    size="medium"
                                    onChange={handleKindChange}
                                    sx={{height: 56}}
                                >
                                    <ToggleButton value={ClientType.LOCAL}
                                                  sx={{px: 2, fontWeight: 700}}>Local</ToggleButton>
                                    <ToggleButton value={ClientType.SSH}
                                                  sx={{px: 2, fontWeight: 700}}>SSH</ToggleButton>
                                </ToggleButtonGroup>
                            </Stack>
                        </Box>

                        {isSsh && form.sshOptions && (
                            <Box>
                                <SectionHeader icon={<VpnKeyOutlined/>} title="SSH Configuration"/>
                                <Paper variant="outlined" sx={{p: 2, borderStyle: 'dashed'}}>
                                    <Stack spacing={2}>
                                        <Stack direction="row" spacing={2}>
                                            <TextField label="Hostname / IP" fullWidth value={form.sshOptions.host}
                                                       onChange={(e) => setForm({
                                                           ...form,
                                                           sshOptions: {...form.sshOptions!, host: e.target.value}
                                                       })}/>
                                            <TextField label="Port" type="number" sx={{width: 120}}
                                                       value={form.sshOptions.port} onChange={(e) => setForm({
                                                ...form,
                                                sshOptions: {...form.sshOptions!, port: parseInt(e.target.value) || 0}
                                            })}/>
                                        </Stack>
                                        <Stack direction="row" spacing={2}>
                                            <TextField label="Username" fullWidth value={form.sshOptions.user}
                                                       onChange={(e) => setForm({
                                                           ...form,
                                                           sshOptions: {...form.sshOptions!, user: e.target.value}
                                                       })}/>
                                            <TextField label="Password" type="password" fullWidth
                                                       value={form.sshOptions.password} onChange={(e) => setForm({
                                                ...form,
                                                sshOptions: {...form.sshOptions!, password: e.target.value}
                                            })}/>
                                        </Stack>

                                        <Divider/>

                                        <Box>
                                            <FormControlLabel
                                                control={
                                                    <Switch
                                                        checked={form.sshOptions.usePublicKeyAuth}
                                                        onChange={(e) => setForm({
                                                            ...form,
                                                            sshOptions: {
                                                                ...form.sshOptions!,
                                                                usePublicKeyAuth: e.target.checked
                                                            }
                                                        })}
                                                    />
                                                }
                                                label={<Typography variant="subtitle2" sx={{fontWeight: 700}}>Use Public
                                                    Key Authentication</Typography>}
                                            />

                                            <Box sx={{
                                                p: 1.5,
                                                mt: 1,
                                                borderRadius: 1.5,
                                                bgcolor: 'background.paper',
                                                border: '1px solid',
                                                borderColor: 'divider'
                                            }}>
                                                <Stack direction="row" spacing={1.5}>
                                                    <InfoOutlined sx={{fontSize: 16, mt: 0.3, color: 'primary.main'}}/>
                                                    <Box>
                                                        {(form.sshOptions.usePublicKeyAuth ? publicKeyHelperText : passwordHelperText).map((text, idx) => (
                                                            <Typography key={idx} variant="caption" display="block"
                                                                        color="text.secondary" sx={{lineHeight: 1.4}}>
                                                                • {text}
                                                            </Typography>
                                                        ))}
                                                    </Box>
                                                </Stack>
                                            </Box>
                                        </Box>
                                    </Stack>
                                </Paper>
                            </Box>
                        )}

                        {error && <Alert severity="error" sx={{borderRadius: 2}}>{error}</Alert>}
                    </Stack>
                ) : (
                    <Stack spacing={2} sx={{mt: 1}}>
                        <Stack direction="row" justifyContent="space-between" alignItems="center">
                            <SectionHeader icon={<FolderSpecialOutlined/>} title="Path Mapping Aliases"/>
                            <Button size="small" startIcon={<Add/>} onClick={() => setForm({
                                ...form,
                                folderAliases: [...form.folderAliases, {id: 0, alias: '', fullpath: ''}]
                            })}>
                                Add Alias
                            </Button>
                        </Stack>

                        <Stack spacing={1.5}>
                            {form.folderAliases.length === 0 && (
                                <Typography variant="body2" color="text.disabled"
                                            sx={{textAlign: 'center', py: 4, fontStyle: 'italic'}}>
                                    No aliases defined. Add one to simplify file navigation.
                                </Typography>
                            )}
                            {form.folderAliases.map((fa, i) => (
                                <Paper key={i} variant="outlined" sx={{p: 1.5, bgcolor: 'background.paper'}}>
                                    <Stack direction="row" spacing={1} alignItems="center">
                                        <TextField
                                            size="small"
                                            placeholder="Alias (e.g. app)"
                                            value={fa.alias}
                                            onChange={(e) => {
                                                const next = [...form.folderAliases];
                                                next[i].alias = e.target.value;
                                                setForm({...form, folderAliases: next});
                                            }}
                                            InputProps={{
                                                startAdornment: <InputAdornment position="start">
                                                    <Typography variant="caption" sx={{fontWeight: 800}}>@</Typography>
                                                </InputAdornment>
                                            }}
                                        />
                                        <ChevronRight sx={{color: 'text.disabled'}}/>
                                        <TextField
                                            size="small"
                                            fullWidth
                                            placeholder="/var/lib/docker/volumes/..."
                                            value={fa.fullpath}
                                            sx={{'& input': {fontFamily: 'monospace', fontSize: '0.8rem'}}}
                                            onChange={(e) => {
                                                const next = [...form.folderAliases];
                                                next[i].fullpath = e.target.value;
                                                setForm({...form, folderAliases: next});
                                            }}
                                        />
                                        <IconButton size="small" color="error" onClick={() => setForm({
                                            ...form,
                                            folderAliases: form.folderAliases.filter((_, idx) => idx !== i)
                                        })}>
                                            <Close fontSize="small"/>
                                        </IconButton>
                                    </Stack>
                                </Paper>
                            ))}
                        </Stack>
                    </Stack>
                )}
            </DialogContent>

            <Divider/>

            <DialogActions sx={{p: 2.5}}>
                <Button
                    variant="outlined"
                    color="inherit"
                    onClick={activeStep === 1 ? () => setActiveStep(0) : onClose}
                    startIcon={activeStep === 1 ? <ArrowBack/> : <Cancel/>}
                    sx={{borderRadius: 2, textTransform: 'none', fontWeight: 700}}
                >
                    {activeStep === 1 ? "Back" : "Cancel"}
                </Button>
                <Box sx={{flex: 1}}/>
                <Button
                    variant="contained"
                    onClick={activeStep === 0 ? handleNext : handleFinish}
                    disabled={connecting || !form.name.trim()}
                    endIcon={activeStep === 0 ? <ArrowForward/> : null}
                    sx={{borderRadius: 2, px: 4, textTransform: 'none', fontWeight: 700, boxShadow: 'none'}}
                >
                    {activeStep === 0 ? "Connect & Continue" : "Save Environment"}
                </Button>
            </DialogActions>
        </Dialog>
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
