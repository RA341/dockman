import {useEffect, useState} from 'react';
import {
    Alert,
    AlertTitle,
    Box,
    Button,
    CircularProgress,
    Divider,
    FormControlLabel,
    InputAdornment,
    Paper,
    Stack,
    Switch,
    TextField,
    Typography
} from '@mui/material';
import {
    Bolt as BoltIcon,
    CleaningServices,
    History as HistoryIcon,
    PlayArrow,
    Save,
    ScheduleOutlined as ClockIcon,
    SettingsOutlined as SettingsIcon
} from '@mui/icons-material';
import {callRPC, useHostClient} from "../../lib/api.ts";
import {useSnackbar} from "../../hooks/snackbar.ts";
import StorageInuse from "./storage-inuse.tsx";
import {useCleanerConfig} from "./state.ts";
import CleanerHistory from "./history.tsx";
import scrollbarStyles from "../../components/scrollbar-style.tsx";
import {CleanerService} from "../../gen/cleaner/v1/cleaner_pb.ts";

function DockerCleanerPage() {
    const {showError, showSuccess} = useSnackbar();
    const cleaner = useHostClient(CleanerService);

    const configErr = useCleanerConfig(state => state.err);
    const isLoading = useCleanerConfig(state => state.isLoading);
    const config = useCleanerConfig(state => state.config);
    const fetchConfig = useCleanerConfig(state => state.Fetch);
    const saveConfig = useCleanerConfig(state => state.Save);

    const [refetchUsage, setRefetchUsage] = useState(true);

    useEffect(() => {
        fetchConfig(cleaner).then();
    }, [fetchConfig, cleaner]);

    const handleSave = async () => {
        await saveConfig(
            cleaner,
            err => showError(`Error saving config: ${err}`),
            () => showSuccess("Configuration updated")
        );
    };

    const handleTrigger = async () => {
        const {err} = await callRPC(() => cleaner.runCleaner({}));
        if (err) showError(`Error running cleaner: ${err}`);
        else showSuccess("Maintenance task triggered successfully");
        setRefetchUsage(prev => !prev);
    };

    if (isLoading) {
        return (
            <Box sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100vh',
                gap: 2
            }}>
                <CircularProgress size={40} thickness={5}/>
                <Typography variant="body2" sx={{fontWeight: 700}} color="text.secondary">Loading cleaner
                    config...</Typography>
            </Box>
        );
    }

    if (configErr) {
        return (
            <Box sx={{p: 4, display: 'flex', justifyContent: 'center'}}>
                <Alert severity="error" variant="outlined" sx={{width: '100%', maxWidth: 600, borderRadius: 2}}>
                    <AlertTitle sx={{fontWeight: 800}}>Configuration Error</AlertTitle>
                    {configErr}
                </Alert>
            </Box>
        );
    }

    return (
        <Box sx={{
            display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', ...scrollbarStyles
        }}>
            <Paper elevation={0} square sx={{
                borderBottom: '1px solid', borderColor: 'divider',
                bgcolor: 'background.paper', py: 2, px: 3, flexShrink: 0
            }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Box>
                        <Stack direction="row" spacing={2} alignItems="center">
                            <Box sx={{
                                p: 1,
                                bgcolor: 'primary.lighter',
                                borderRadius: 1.5,
                                color: 'primary.main',
                                display: 'flex'
                            }}>
                                <CleaningServices fontSize="small"/>
                            </Box>
                            <Box>
                                <Typography variant="h5" sx={{fontWeight: 800, letterSpacing: -0.5}}>
                                    Docker Cleaner
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                    Automated pruning of unused resources
                                </Typography>
                            </Box>
                        </Stack>
                    </Box>
                    <Stack direction="row" spacing={2}>
                        <Button
                            variant="outlined"
                            color="inherit"
                            startIcon={<Save/>}
                            onClick={handleSave}
                            sx={{borderRadius: 2, fontWeight: 700}}
                        >
                            Save Settings
                        </Button>
                        <Button
                            variant="contained"
                            startIcon={<PlayArrow/>}
                            onClick={handleTrigger}
                            sx={{borderRadius: 2, fontWeight: 700, boxShadow: 'none'}}
                        >
                            Run Now
                        </Button>
                    </Stack>
                </Stack>
            </Paper>

            <Box sx={{flexGrow: 1, overflowY: 'auto', p: 3, display: 'flex', flexDirection: 'column', gap: 3}}>
                <StorageInuse refetch={refetchUsage}/>

                <Paper variant="outlined" sx={{p: 3, borderRadius: 3}}>
                    <Stack direction="row" spacing={1} alignItems="center" sx={{mb: 2.5}}>
                        <SettingsIcon sx={{fontSize: 18, color: 'text.disabled'}}/>
                        <Typography variant="subtitle2"
                                    sx={{fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em'}}>
                            Scheduler Configuration
                        </Typography>
                    </Stack>

                    <Stack direction={{xs: 'column', md: 'row'}} spacing={4} alignItems="center">
                        <Box sx={{
                            p: 2, borderRadius: 2, border: '1px solid', borderColor: 'divider',
                            bgcolor: config?.Enabled ? 'success.lighter' : '',
                            transition: 'all 0.2s', width: {xs: '100%', md: 'auto'}, minWidth: 200
                        }}>
                            <FormControlLabel
                                control={
                                    <Switch
                                        checked={config?.Enabled}
                                        onChange={(e) => useCleanerConfig.getState().SetField('Enabled', e.target.checked)}
                                        color="success"
                                    />
                                }
                                label={
                                    <Typography variant="subtitle2" sx={{fontWeight: 800}}>
                                        {config?.Enabled ? 'Auto-Pruning Active' : 'Auto-Pruning Disabled'}
                                    </Typography>
                                }
                            />
                        </Box>

                        <TextField
                            label="Maintenance Interval"
                            type="number"
                            size="small"
                            value={config?.IntervalInHours}
                            onChange={(e) => useCleanerConfig.getState().SetField('IntervalInHours', parseInt(e.target.value) || 0)}
                            sx={{width: {xs: '100%', md: 240}}}
                            slotProps={{
                                input: {
                                    startAdornment: (
                                        <InputAdornment position="start">
                                            <ClockIcon fontSize="small"/>
                                        </InputAdornment>
                                    ),
                                    endAdornment: (
                                        <InputAdornment position="end">
                                            Hours
                                        </InputAdornment>
                                    ),
                                    sx: {fontWeight: 700, fontFamily: 'monospace'}
                                }
                            }}
                        />

                        <Divider orientation="vertical" flexItem sx={{display: {xs: 'none', md: 'block'}}}/>

                        <Box sx={{flex: 1}}>
                            <Stack direction="row" spacing={2}>
                                <Button
                                    color="success"
                                    startIcon={<BoltIcon/>}
                                    onClick={async () => {
                                        await handleSave();
                                        await handleTrigger();
                                    }}
                                    sx={{
                                        borderRadius: 2,
                                        fontWeight: 700,
                                        bgcolor: 'success.lighter',
                                        color: 'success.dark'
                                    }}
                                >
                                    Save & Trigger Now
                                </Button>
                            </Stack>
                        </Box>
                    </Stack>
                </Paper>

                {/* History Section */}
                <Box>
                    <Stack direction="row" spacing={1} alignItems="center" sx={{mb: 1, px: 1}}>
                        <HistoryIcon sx={{fontSize: 18, color: 'text.secondary'}}/>
                        <Typography variant="overline" sx={{fontWeight: 800, color: 'text.secondary'}}>
                            Maintenance History
                        </Typography>
                    </Stack>
                    <CleanerHistory/>
                </Box>

            </Box>
        </Box>
    );
}

export default DockerCleanerPage;
