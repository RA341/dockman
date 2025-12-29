import React, {useCallback, useEffect, useState} from "react";
import {
    Alert,
    AlertTitle,
    Box,
    Fade,
    Paper,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Tooltip,
    Typography
} from "@mui/material";
import {callRPC, useHostClient} from "../../lib/api.ts";
import {CleanerService, type PruneHistory} from "../../gen/cleaner/v1/cleaner_pb.ts";
import {formatTimeAgo, type TableInfo} from "../../lib/table.ts";

function formatCleanerData(data: string) {
    return (
        <TableCell component="th" scope="row" style={{whiteSpace: 'pre-wrap'}}>
            {data ? data : "Not Cleaned"}
        </TableCell>
    )
}

const CleanerHistory = () => {
    // const {showError, showSuccess} = useSnackbar()
    const cleaner = useHostClient(CleanerService)
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
        <Fade in={true} timeout={200}>
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
        </Fade>
    )
}

export default CleanerHistory