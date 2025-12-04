import {type ChangeEvent, useEffect, useState} from 'react';
import {
    Alert,
    AlertTitle,
    Box,
    Button,
    CircularProgress,
    FormControlLabel,
    Paper,
    Stack,
    Switch,
    TextField,
    Typography
} from '@mui/material';
import {PlayArrow, Save} from '@mui/icons-material';
import {CleanerService} from "../../gen/cleaner/v1/cleaner_pb.ts";
import {callRPC, useClient} from "../../lib/api.ts";
import {useSnackbar} from "../../hooks/snackbar.ts";
import StorageInuse from "./storage-inuse.tsx";
import {type CleanerConfig, useCleanerConfig} from "./state.ts";
import CleanerHistory from "./history.tsx";
import scrollbarStyles from "../../components/scrollbar-style.tsx";

function DockerCleanerPage() {
    const {showError, showSuccess} = useSnackbar()
    const cleaner = useClient(CleanerService)

    const configErr = useCleanerConfig(state => state.err)
    const isLoading = useCleanerConfig(state => state.isLoading)
    const config = useCleanerConfig(state => state.config)

    const fetch = useCleanerConfig(state => state.Fetch)

    useEffect(() => {
        fetch(cleaner).then()
        // eslint-disable-next-line
    }, [])

    const save = useCleanerConfig(state => state.Save)
    const handleSave = async () => {
        await save(
            cleaner,
            err1 => showError(`Error saving config:\n${err1}`),
            () => showSuccess("Config updated")
        )
    }

    const [refetchUsage, setRefetchUsage] = useState(true)

    const handleTrigger = async () => {
        console.log('Triggering cleanup:', config);
        const {err} = await callRPC(() =>
            cleaner.runCleaner({})
        )
        if (err) {
            showError(`Error running cleaner:\n${err}`)
        } else {
            showSuccess("cleaner triggered")
        }

        setRefetchUsage(prevState => !prevState)
    }

    if (isLoading) {
        return (
            <Box
                sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    alignItems: 'center',
                    minHeight: '300px',
                    width: '100%',
                    p: 3
                }}
            >
                <CircularProgress size={50} sx={{mb: 2}}/>
                <Typography variant="h6" color="text.secondary">
                    Fetching Cleaner Configuration...
                </Typography>
            </Box>
        )
    }

    if (configErr) {
        return (
            <Box
                sx={{
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    minHeight: '300px',
                    width: '100%',
                    p: 3
                }}
            >
                <Alert severity="error" sx={{width: '100%', maxWidth: '600px'}}>
                    <AlertTitle>Error Loading Configuration</AlertTitle>
                    <Typography>
                        Could not fetch the Docker Cleaner configuration.
                    </Typography>
                    <Typography variant="body2" sx={{mt: 1}}>
                        Error: {configErr}
                    </Typography>
                </Alert>
            </Box>
        )
    }

    return (
        <Box sx={{
            p: 1,
            ...scrollbarStyles
        }}>
            <Paper elevation={2} sx={{p: 4, mb: 3}}>
                <CleanerHeader/>
                <Box sx={{py: 1.3}}>
                    <StorageInuse refetch={refetchUsage}/>
                </Box>
                <Box sx={{display: 'flex', gap: 2, mt: 1}}>
                    <Button
                        variant="contained"
                        color="primary"
                        startIcon={<Save/>}
                        onClick={handleSave}
                        size="large"
                    >
                        Save
                    </Button>

                    <Button
                        variant="contained"
                        color="success"
                        startIcon={<PlayArrow/>}
                        onClick={handleTrigger}
                        size="large"
                    >
                        Trigger
                    </Button>
                </Box>
            </Paper>
            <CleanerHistory/>
        </Box>
    );
}

function CleanerHeader() {
    const edit = useCleanerConfig(state => state.SetField)
    const config = useCleanerConfig(state => state.config)

    const handleSwitchChange = (field: keyof CleanerConfig) => (event: ChangeEvent<HTMLInputElement>) => {
        edit(field, event.target.checked)
    };

    const handleIntervalChange = (event: ChangeEvent<HTMLInputElement>) => {
        edit(
            'IntervalInHours',
            parseInt(event.target.value) || 0
        )
    };

    return (
        <Box sx={{display: 'flex', alignItems: 'center'}}>
            <Box sx={{paddingRight: 2}}>
                <Stack spacing={0.5}>
                    <Typography variant="h5" component="h1" sx={{fontWeight: 'bold'}}>
                        Docker Cleaner
                    </Typography>
                    <Typography variant="body1" color="text.secondary">
                        Removes all unused docker resources
                    </Typography>
                </Stack>
            </Box>

            <Box sx={{paddingLeft: 2}}>
                <Stack direction="row" spacing={3} alignItems="center">
                    <FormControlLabel
                        control={
                            <Switch
                                size="medium"
                                checked={config?.Enabled}
                                onChange={handleSwitchChange('Enabled')}
                                color="primary"
                            />
                        }
                        label={<Typography variant="h6">Enabled</Typography>}
                    />

                    <TextField
                        label="Interval (hours)"
                        type="number"
                        value={config?.IntervalInHours}
                        onChange={handleIntervalChange}
                        sx={{width: 150}}
                        size="small"
                        slotProps={{
                            input: {
                                inputProps: {min: 1}
                            }
                        }}
                    />
                </Stack>
            </Box>
        </Box>
    );
}


export default DockerCleanerPage