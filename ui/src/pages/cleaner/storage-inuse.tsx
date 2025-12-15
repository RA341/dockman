import {useCallback, useEffect, useState} from 'react';
import {callRPC, useCleanerClient} from "../../lib/api.ts";
import {type SpaceStat, type SpaceStatusResponse} from "../../gen/cleaner/v1/cleaner_pb.ts";
import {useSnackbar} from "../../hooks/snackbar.ts";
import {
    Box,
    CircularProgress,
    Divider,
    Fade,
    FormControlLabel,
    Grid,
    Paper,
    Stack,
    Switch,
    Typography
} from "@mui/material";
import {type CleanerConfig, useCleanerConfig} from "./state.ts";

function StorageInuse({refetch}: { refetch: boolean }) {
    const cleaner = useCleanerClient()
    const {showError} = useSnackbar()

    const [storage, setStorage] = useState<SpaceStatusResponse | null>(null)
    const [loading, setLoading] = useState(true);

    const fetchStorageStatus = useCallback(async () => {
        // trigger loading state only for null state
        if (!storage) {
            setLoading(true);
        }

        const {val, err} = await callRPC(() => cleaner.spaceStatus({}))
        if (err) {
            showError(err)
            setStorage(null)
        } else {
            setStorage(val)
        }
        setLoading(false);
        // eslint-disable-next-line
    }, [refetch])

    useEffect(() => {
        fetchStorageStatus().then()
    }, [fetchStorageStatus]);

    return (
        <Paper sx={{p: 4}}>
            {(loading) ? (
                <Box display="flex" justifyContent="center" alignItems="center" height={150}>
                    <CircularProgress/>
                </Box>
            ) : storage ? (
                <Fade in={true} timeout={200}>
                    <Grid container spacing={2}>
                        <Grid size={{xs: 12, sm: 6, md: 2.4}}>
                            <SpaceStateDisplay title="Containers" stat={storage.Containers}/>
                        </Grid>
                        <Grid size={{xs: 12, sm: 6, md: 2.4}}>
                            <SpaceStateDisplay title="Images" stat={storage.Images}/>
                        </Grid>
                        <Grid size={{xs: 12, sm: 6, md: 2.4}}>
                            <SpaceStateDisplay title="Volumes" stat={storage.Volumes}/>
                        </Grid>
                        <Grid size={{xs: 12, sm: 6, md: 2.4}}>
                            <SpaceStateDisplay title="BuildCache" stat={storage.BuildCache}/>
                        </Grid>
                        <Grid size={{xs: 12, sm: 6, md: 2.4}}>
                            <SpaceStateDisplay title="Networks" stat={storage.Network}/>
                        </Grid>
                    </Grid>
                </Fade>
            ) : (
                <Fade in={true} timeout={200}>
                    <Box sx={{p: 3, bgcolor: 'error.main', color: 'error.contrastText', borderRadius: 1}}>
                        <Typography variant="body1" fontWeight="bold">
                            Could not load storage information.
                        </Typography>
                    </Box>
                </Fade>
            )}
        </Paper>
    );
}

// remove number properties
type CleanerConfigWithoutNumbers = {
    [K in keyof CleanerConfig as CleanerConfig[K] extends number ? never : K]: CleanerConfig[K]
};

const SpaceStateDisplay = (
    {
        stat,
        title
    }:
    {
        stat: SpaceStat | undefined,
        title: keyof CleanerConfigWithoutNumbers
    }
) => {
    const config = useCleanerConfig(state => state.config?.[title] ?? false)
    const toggle = useCleanerConfig(state => state.SetField)

    if (!stat) {
        return (
            <Paper variant="outlined" sx={{p: 2, height: '100%'}}>
                <Typography variant="subtitle1" fontWeight="bold" color="text.primary" gutterBottom>
                    {title}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                    No data found
                </Typography>
            </Paper>
        );
    }

    return (
        <Paper
            variant="outlined"
            sx={{
                p: 2,
                height: '100%',
                transition: 'box-shadow 0.3s',
                '&:hover': {
                    boxShadow: 3,
                },
            }}
        >
            <Stack spacing={1}>
                <Typography variant="h6" color="primary.main">
                    {title}
                </Typography>
                <FormControlLabel
                    label="Enabled"
                    control={
                        <Switch
                            size={"small"}
                            checked={config}
                            onChange={(_event, checked) => {
                                toggle(title, checked);
                            }}
                            color="primary"
                        />
                    }
                />

                <Divider/>

                <Grid container spacing={1}>
                    <Grid size={{xs: 6}}>
                        <Typography variant="body2" color="text.secondary">Active</Typography>
                        <Typography variant="subtitle1" fontWeight="bold">{stat.ActiveCount}</Typography>
                    </Grid>
                    <Grid size={{xs: 6}}>
                        <Typography variant="body2" color="text.secondary">Total</Typography>
                        <Typography variant="subtitle1" fontWeight="bold">{stat.TotalCount}</Typography>
                    </Grid>
                    <Grid size={{xs: 6}}>
                        <Typography variant="body2" color="text.secondary">Reclaimable</Typography>
                        <Typography variant="subtitle1" color="error.main"
                                    fontWeight="bold">{stat.Reclaimable}</Typography>
                    </Grid>
                    <Grid size={{xs: 6}}>
                        <Typography variant="body2" color="text.secondary">Total Size</Typography>
                        <Typography variant="subtitle1" fontWeight="bold">{stat.TotalSize}</Typography>
                    </Grid>
                </Grid>
            </Stack>
        </Paper>
    );
};

export default StorageInuse;
