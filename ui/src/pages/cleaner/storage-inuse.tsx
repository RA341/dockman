import {type ReactNode, useCallback, useEffect} from 'react';
import {useHostClient, useRPCRunner} from "../../lib/api.ts";
import {CleanerService, type SpaceStat} from "../../gen/cleaner/v1/cleaner_pb.ts";
import {useSnackbar} from "../../hooks/snackbar.ts";
import {
    Box,
    Button,
    CircularProgress,
    Divider,
    Fade,
    Grid,
    Paper,
    Stack,
    Switch,
    Tooltip,
    Typography
} from "@mui/material";
import {
    DeleteSweepOutlined,
    FolderSpecialOutlined,
    ImageOutlined,
    Inventory2Outlined,
    LanOutlined,
    StorageOutlined
} from '@mui/icons-material';
import {type CleanerConfig, useCleanerConfig} from "./state.ts";
import scrollbarStyles from "../../components/scrollbar-style.tsx";

function StorageInuse({refetch}: { refetch: boolean }) {
    const cleaner = useHostClient(CleanerService);
    const {showError} = useSnackbar();

    const spaceStatusRpc = useRPCRunner(() => cleaner.spaceStatus({}));

    async function fetchStorage() {
        await spaceStatusRpc.runner();
        if (spaceStatusRpc.err) showError(spaceStatusRpc.err);
    }

    const refetcher = useCallback(async () => {
        await fetchStorage();
    }, [refetch]);

    useEffect(() => {
        refetcher().then();
    }, [refetcher]);

    return (
        <Paper variant="elevation" sx={{borderRadius: 3}}>
            <Box sx={{p: 3, flexGrow: 1, overflow: 'auto', ...scrollbarStyles}}>
                {(spaceStatusRpc.loading || !spaceStatusRpc.val) ? (
                    <Box display="flex" flexDirection="column" justifyContent="center" alignItems="center" height="60vh"
                         gap={2}>
                        <CircularProgress size={32} thickness={5}/>
                        <Typography variant="body2" color="text.secondary" sx={{fontWeight: 600}}>Calculating disk
                            usage...</Typography>
                    </Box>
                ) : (
                    <Fade in timeout={400}>
                        <Grid container spacing={3}>
                            <Grid size={{xs: 12, sm: 6, md: 4, lg: 2.4}}>
                                <SpaceStateDisplay icon={<Inventory2Outlined/>} onClean={fetchStorage}
                                                   title="Containers" stat={spaceStatusRpc.val.Containers}/>
                            </Grid>
                            <Grid size={{xs: 12, sm: 6, md: 4, lg: 2.4}}>
                                <SpaceStateDisplay icon={<ImageOutlined/>} onClean={fetchStorage} title="Images"
                                                   stat={spaceStatusRpc.val.Images}/>
                            </Grid>
                            <Grid size={{xs: 12, sm: 6, md: 4, lg: 2.4}}>
                                <SpaceStateDisplay icon={<FolderSpecialOutlined/>} onClean={fetchStorage}
                                                   title="Volumes" stat={spaceStatusRpc.val.Volumes}/>
                            </Grid>
                            <Grid size={{xs: 12, sm: 6, md: 4, lg: 2.4}}>
                                <SpaceStateDisplay icon={<StorageOutlined/>} onClean={fetchStorage} title="BuildCache"
                                                   stat={spaceStatusRpc.val.BuildCache}/>
                            </Grid>
                            <Grid size={{xs: 12, sm: 6, md: 4, lg: 2.4}}>
                                <SpaceStateDisplay icon={<LanOutlined/>} onClean={fetchStorage} title="Networks"
                                                   stat={spaceStatusRpc.val.Network}/>
                            </Grid>
                        </Grid>
                    </Fade>
                )}
            </Box>
        </Paper>
    );
}

const SpaceStateDisplay = ({stat, title, icon, onClean}: {
    stat: SpaceStat | undefined,
    title: keyof CleanerConfigWithoutNumbers,
    icon: ReactNode,
    onClean: () => Promise<void>
}) => {
    const {showError, showSuccess} = useSnackbar();
    const config = useCleanerConfig(state => state.config?.[title] ?? false);
    const toggle = useCleanerConfig(state => state.SetField);
    const cleaner = useHostClient(CleanerService);

    const runOnceRpc = useRPCRunner(() => cleaner.cleanOnce({config: {[title]: true}}));

    const cleanOnce = async () => {
        await runOnceRpc.runner();
        if (runOnceRpc.err) showError(`Could not clean: ${runOnceRpc.err}`);
        else {
            showSuccess(`${title} pruned successfully`);
            await onClean();
        }
    };

    const isCleanable = !stat || stat.Reclaimable === "0 B" || stat.Reclaimable === "0";

    return (
        <Paper variant="outlined" sx={{
            p: 2.5, borderRadius: 3, height: '100%', bgcolor: 'background.paper',
            transition: 'all 0.2s', '&:hover': {borderColor: 'primary.main', boxShadow: '0 4px 12px rgba(0,0,0,0.05)'}
        }}>
            <Stack spacing={2}>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Stack direction="row" spacing={1} alignItems="center">
                        <Box sx={{color: 'text.disabled', display: 'flex'}}>{icon}</Box>
                        <Typography variant="subtitle2"
                                    sx={{fontWeight: 400, textTransform: 'uppercase', letterSpacing: '0.05em'}}>
                            {title}
                        </Typography>
                    </Stack>
                    <Tooltip title={`Auto-clean ${title}`}>
                        <Switch
                            size="small"
                            checked={config}
                            onChange={(_, checked) => toggle(title, checked)}
                        />
                    </Tooltip>
                </Stack>

                <Box sx={{py: 1}}>
                    <Typography variant="caption" color="text.disabled"
                                sx={{fontWeight: 700, textTransform: 'uppercase'}}>
                        Reclaimable
                    </Typography>
                    <Typography variant="h5" sx={{
                        fontFamily: 'monospace', fontWeight: 800,
                        color: !isCleanable ? 'error.main' : 'text.disabled'
                    }}>
                        {stat?.Reclaimable || '0 B'}
                    </Typography>
                </Box>

                <Divider sx={{borderStyle: 'dashed'}}/>

                <Grid container spacing={1}>
                    <StatInfo label="Active" value={stat?.ActiveCount?.toString() || '0'}/>
                    <StatInfo label="Total" value={stat?.TotalCount?.toString() || '0'}/>
                    <StatInfo label="Usage" value={stat?.TotalSize || '0 B'} mono/>
                </Grid>

                <Button
                    fullWidth
                    color="primary"
                    startIcon={<DeleteSweepOutlined/>}
                    onClick={cleanOnce}
                    disabled={runOnceRpc.loading || isCleanable}
                    sx={{
                        mt: 'auto', borderRadius: 2, fontWeight: 700,
                        bgcolor: 'primary.lighter', '&:hover': {color: 'colors.info'}
                    }}
                >
                    {runOnceRpc.loading ? 'Pruning...' : 'Prune'}
                </Button>
            </Stack>
        </Paper>
    );
};

const StatInfo = ({label, value, mono = false}: { label: string, value: string, mono?: boolean }) => (
    <Grid size={{xs: 6}}>
        <Typography variant="caption" color="text.disabled"
                    sx={{fontWeight: 700, display: 'block'}}>{label}</Typography>
        <Typography variant="body2" sx={{fontWeight: 700, fontFamily: mono ? 'monospace' : 'inherit'}}>
            {value}
        </Typography>
    </Grid>
);

type CleanerConfigWithoutNumbers = {
    [K in keyof CleanerConfig as CleanerConfig[K] extends number ? never : K]: CleanerConfig[K]
};

export default StorageInuse;