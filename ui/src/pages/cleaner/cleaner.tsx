import React, {type ChangeEvent, useCallback, useEffect, useState} from 'react';
import {
    Alert,
    AlertTitle,
    Box,
    Button,
    CircularProgress,
    Divider,
    FormControlLabel,
    Paper,
    Switch,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    TextField,
    Tooltip,
    Typography
} from '@mui/material';
import {PlayArrow, Save} from '@mui/icons-material';
import {CleanerService, type PruneConfig, type PruneHistory} from "../../gen/cleaner/v1/cleaner_pb.ts";
import {callRPC, useClient} from "../../lib/api.ts";
import {useSnackbar} from "../../hooks/snackbar.ts";
import {formatTimeAgo, type TableInfo} from "../../lib/table.ts";

type CleanerConfig = Omit<PruneConfig, "$typeName" | "$unknown">

function DockerCleanerPage() {
    const {showError, showSuccess} = useSnackbar()
    const cleaner = useClient(CleanerService)

    const [config, setConfig] = useState<CleanerConfig>({
        Enabled: false,
        IntervalInHours: 24,
        Volumes: false,
        Networks: false,
        Images: false,
        Containers: false,
        BuildCache: false
    });
    const [configErr, setConfigErr] = useState("")
    const [isLoading, setIsLoading] = useState(false)

    const fetchStorageStatus = useCallback(async () => {
        const {val, err} = await callRPC(() => cleaner.spaceStatus({}))
        if (err) {
            showError(err)
        } else {
            showSuccess(val.toString())
        }
        // eslint-disable-next-line
    }, [])

    useEffect(() => {
        const fetch = async () => {
            setIsLoading(true)

            const {val, err} = await callRPC(() => cleaner.getConfig({}))
            if (err) {
                setConfigErr(err)
            } else {
                setConfig(val!.config!)
            }

            setIsLoading(false)
        }

        fetch().then()
        fetchStorageStatus().then()
        // eslint-disable-next-line
    }, [])

    const handleSwitchChange = (field: keyof CleanerConfig) => (event: ChangeEvent<HTMLInputElement>) => {
        setConfig({
            ...config,
            [field]: event.target.checked
        });
    };

    const handleIntervalChange = (event: ChangeEvent<HTMLInputElement>) => {
        setConfig({
            ...config,
            IntervalInHours: parseInt(event.target.value) || 0
        });
    };

    const handleSave = async () => {
        const {val, err} = await callRPC(() =>
            cleaner.editConfig({
                config
            })
        )
        if (err) {
            showError(`Error saving config:\n${err}`)
        } else {
            setConfig({...val!.config!})
            showSuccess("Config updated")
        }
    };

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
    };

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
        <Box sx={{p: 1}}>
            <Paper elevation={2} sx={{p: 3, mb: 3}}>
                <Box sx={{
                    mb: 3,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4
                }}>
                    <Box>
                        <Typography variant="h5" sx={{fontWeight: 'bold'}}>
                            Docker Cleaner
                        </Typography>
                        <Typography variant="body1">
                            Removes all unused docker resources
                        </Typography>
                    </Box>

                    <Box sx={{display: 'flex', alignItems: 'center'}}>
                        <FormControlLabel
                            control={
                                <Switch
                                    checked={config.Enabled}
                                    onChange={handleSwitchChange('Enabled')}
                                    color="primary"
                                />
                            }
                            label={<Typography variant="h6">Enabled</Typography>}
                        />

                        <TextField
                            label="Interval (hours)"
                            type="number"
                            value={config.IntervalInHours}
                            onChange={handleIntervalChange}
                            sx={{ml: 2, width: 150}}
                            size="small"
                            slotProps={{
                                input: {
                                    inputProps: {min: 1}
                                }
                            }}
                        />
                    </Box>
                    <Box>
                        <Typography variant="h6" sx={{}}>
                            Space In use
                        </Typography>
                        <Typography variant="body1">
                            TODO
                        </Typography>
                    </Box>
                </Box>

                <Divider sx={{my: 2}}/>

                <Typography variant="subtitle1" sx={{mb: 2, fontWeight: 'bold'}}>
                    Cleanup Options
                </Typography>

                <Box sx={{
                    display: 'flex',
                    flexDirection: 'row',
                    flexWrap: 'wrap',
                    gap: 3
                }}>
                    <FormControlLabel
                        control={
                            <Switch
                                checked={config.Volumes}
                                onChange={handleSwitchChange('Volumes')}
                                color="primary"
                            />
                        }
                        label="Volumes"
                    />

                    <FormControlLabel
                        control={
                            <Switch
                                checked={config.Networks}
                                onChange={handleSwitchChange('Networks')}
                                color="primary"
                            />
                        }
                        label="Networks"
                    />

                    <FormControlLabel
                        control={
                            <Switch
                                checked={config.Images}
                                onChange={handleSwitchChange('Images')}
                                color="primary"
                            />
                        }
                        label="Images"
                    />

                    <FormControlLabel
                        control={
                            <Switch
                                checked={config.Containers}
                                onChange={handleSwitchChange('Containers')}
                                color="primary"
                            />
                        }
                        label="Containers"
                    />

                    <FormControlLabel
                        control={
                            <Switch
                                checked={config.BuildCache}
                                onChange={handleSwitchChange('BuildCache')}
                                color="primary"
                            />
                        }
                        label="Build Cache"
                    />
                </Box>
            </Paper>


            <Box sx={{display: 'flex', gap: 2}}>
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

            <CleanerHistory/>
        </Box>
    );
}

function formatCleanerData(data: string) {
    return (
        <TableCell component="th" scope="row" style={{whiteSpace: 'pre-wrap'}}>
            {data ? data : "Not Cleaned"}
        </TableCell>
    )
}

const CleanerHistory = () => {
    // const {showError, showSuccess} = useSnackbar()
    const cleaner = useClient(CleanerService)
    const [historyErr, setHistoryErr] = useState<string | null>()
    const [history, setHistory] = useState<PruneHistory[]>([])

    const fetchHistory = useCallback(async () => {
        setHistoryErr(null)

        const {val, err} = await callRPC(() => cleaner.listHistory({}))
        if (err) {
            setHistoryErr(err)
        } else {
            setHistory(val!.history)
        }

        // eslint-disable-next-line
    }, [])

    useEffect(() => {
        fetchHistory().then()
        const intervalId = setInterval(fetchHistory, 2000)
        return () => clearInterval(intervalId)
    }, [fetchHistory]);

    const tableConfig: TableInfo<PruneHistory> = {
        "Containers": {
            getValue: data => data.Containers,
            cell: data => formatCleanerData(data.Containers),
            header: label => (
                <TableCell>{label}</TableCell>
            ),
        },
        "Images": {
            getValue: data => data.Images,
            cell: data => formatCleanerData(data.Images),
            header: label => (
                <TableCell>{label}</TableCell>
            ),
        },
        "Volumes": {
            getValue: data => data.Volumes,
            cell: data => formatCleanerData(data.Volumes),
            header: label => (
                <TableCell>{label}</TableCell>
            ),
        },
        "Build Cache": {
            getValue: data => data.BuildCache,
            cell: data => formatCleanerData(data.BuildCache),
            header: label => (
                <TableCell>{label}</TableCell>
            ),
        },
        "Networks": {
            getValue: data => data.Networks,
            cell: data => formatCleanerData(data.Networks),
            header: label => (
                <TableCell>{label}</TableCell>
            ),
        },
        "Time": {
            getValue: data => data.TimeRan,
            cell: data => {
                const date = new Date(data.TimeRan);
                const relativeTime = formatTimeAgo(date)
                return (
                    <TableCell component="th" scope="row">
                        <Tooltip title={date.toString()} arrow>
                            <Typography
                                variant="body2"
                                color="textPrimary"
                                sx={{display: 'inline-block'}}
                            >
                                {relativeTime}
                            </Typography>
                        </Tooltip>
                    </TableCell>)
            },
            header: label => (
                <TableCell>{label}</TableCell>
            ),
        },
    }

    return (
        <Box sx={{display: 'flex', gap: 2, p: 1}}>
            {historyErr ?
                (
                    <Box
                        sx={{
                            display: 'flex',
                            justifyContent: 'center',
                            alignItems: 'center',
                            minHeight: '300px',
                            width: '100%',
                            p: 2
                        }}
                    >
                        <Alert severity="error" sx={{width: '100%', maxWidth: '600px'}}>
                            <AlertTitle>Error Loading Cleaner history</AlertTitle>
                            <Typography variant="body1" sx={{mt: 1}}>
                                {historyErr}
                            </Typography>
                        </Alert>
                    </Box>
                ) :
                (
                    <TableContainer component={Paper} style={{flex: 1}}>
                        <Table stickyHeader sx={{minWidth: 650}}>
                            <TableHead>
                                <TableRow>
                                    {Object.entries(tableConfig).map(([key, val], index) => (
                                        <React.Fragment key={index}>
                                            {val.header(key)}
                                        </React.Fragment>
                                    ))}
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {history.map((image, index) => (
                                    <TableRow
                                        key={index}
                                        hover
                                        sx={{
                                            '&:last-child td, &:last-child th': {border: 0},
                                            cursor: 'pointer',
                                            backgroundColor: 'transparent'
                                        }}
                                        // onClick={() => handleRowSelection(image.id)}
                                    >
                                        {Object.values(tableConfig).map((val, index) => (
                                            <React.Fragment key={index}>
                                                {val.cell(image)}
                                            </React.Fragment>
                                        ))}
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TableContainer>
                )}
        </Box>
    )
}

export default DockerCleanerPage