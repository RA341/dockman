import React, {useCallback, useEffect, useState} from "react";
import {
    Alert,
    AlertTitle,
    Box,
    Paper,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Tooltip,
    Typography
} from "@mui/material";
import {
    AccessTimeOutlined as TimeIcon,
    FolderSpecialOutlined as VolumeIcon,
    ImageOutlined as ImageIcon,
    Inventory2Outlined as ContainerIcon,
    LanOutlined as NetworkIcon,
    StorageOutlined as CacheIcon
} from '@mui/icons-material';
import {callRPC, useHostClient} from "../../lib/api.ts";
import {CleanerService, type PruneHistory} from "../../gen/cleaner/v1/cleaner_pb.ts";
import {formatTimeAgo, type TableInfo} from "../../lib/table.ts";
import scrollbarStyles from "../../components/scrollbar-style.tsx";

/**
 * Renders the specific results of a prune operation
 */
const PruneDataCell = ({data}: { data: string }) => {
    if (!data || data.toLowerCase().includes("not cleaned")) {
        return (
            <TableCell sx={{color: 'text.disabled', fontStyle: 'italic', fontSize: '0.75rem'}}>
                —
            </TableCell>
        );
    }

    return (
        <TableCell>
            <Typography
                variant="body2"
                sx={{
                    fontFamily: 'monospace',
                    fontSize: '0.75rem',
                    fontWeight: 500,
                    whiteSpace: 'pre-wrap',
                    color: 'success.dark'
                }}
            >
                {data}
            </Typography>
        </TableCell>
    );
};

const CleanerHistory = () => {
    const cleaner = useHostClient(CleanerService);
    const [historyErr, setHistoryErr] = useState<string | null>();
    const [history, setHistory] = useState<PruneHistory[]>([]);

    const fetchHistory = useCallback(async () => {
        const {val, err} = await callRPC(() => cleaner.listHistory({}));
        if (err) setHistoryErr(err);
        else if (val) setHistory(val.history);
    }, [cleaner]);

    useEffect(() => {
        fetchHistory().then();
        const intervalId = setInterval(fetchHistory, 5000);
        return () => clearInterval(intervalId);
    }, [fetchHistory]);

    const tableConfig: TableInfo<PruneHistory> = {
        "Time": {
            getValue: data => data.TimeRan,
            header: label => <HeaderCell label={label} icon={<TimeIcon/>}/>,
            cell: data => {
                const date = new Date(data.TimeRan);
                return (
                    <TableCell>
                        <Tooltip title={date.toLocaleString()} arrow placement="left">
                            <Stack spacing={0}>
                                <Typography variant="body2"
                                            sx={{fontWeight: 700, color: 'primary.main', whiteSpace: 'nowrap'}}>
                                    {formatTimeAgo(date)}
                                </Typography>
                                <Typography variant="caption"
                                            sx={{fontFamily: 'monospace', color: 'text.disabled', fontSize: '0.65rem'}}>
                                    {date.toLocaleTimeString([], {
                                        hour: '2-digit',
                                        minute: '2-digit'
                                    })} • {date.toLocaleDateString()}
                                </Typography>
                            </Stack>
                        </Tooltip>
                    </TableCell>
                );
            },
        },
        "Containers": {
            getValue: data => data.Containers,
            header: label => <HeaderCell label={label} icon={<ContainerIcon/>}/>,
            cell: data => <PruneDataCell data={data.Containers}/>,
        },
        "Images": {
            getValue: data => data.Images,
            header: label => <HeaderCell label={label} icon={<ImageIcon/>}/>,
            cell: data => <PruneDataCell data={data.Images}/>,
        },
        "Volumes": {
            getValue: data => data.Volumes,
            header: label => <HeaderCell label={label} icon={<VolumeIcon/>}/>,
            cell: data => <PruneDataCell data={data.Volumes}/>,
        },
        "Build Cache": {
            getValue: data => data.BuildCache,
            header: label => <HeaderCell label={label} icon={<CacheIcon/>}/>,
            cell: data => <PruneDataCell data={data.BuildCache}/>,
        },
        "Networks": {
            getValue: data => data.Networks,
            header: label => <HeaderCell label={label} icon={<NetworkIcon/>}/>,
            cell: data => <PruneDataCell data={data.Networks}/>,
        }
    };

    if (historyErr) {
        return (
            <Alert severity="error" variant="outlined" sx={{borderRadius: 2}}>
                <AlertTitle sx={{fontWeight: 800}}>History Unavailable</AlertTitle>
                {historyErr}
            </Alert>
        );
    }

    return (
        <Paper variant="outlined" sx={{borderRadius: 3, overflow: 'hidden', bgcolor: 'background.paper'}}>
            <TableContainer sx={{maxHeight: 600, ...scrollbarStyles}}>
                <Table stickyHeader size="small">
                    <TableHead>
                        <TableRow>
                            {Object.entries(tableConfig).map(([key, val], idx) => (
                                <React.Fragment key={idx}>{val.header(key)}</React.Fragment>
                            ))}
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {history.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={6} sx={{py: 8, textAlign: 'center'}}>
                                    <Typography variant="body2" color="text.disabled" sx={{fontStyle: 'italic'}}>
                                        No maintenance logs found
                                    </Typography>
                                </TableCell>
                            </TableRow>
                        ) : (
                            history.map((item, index) => (
                                <TableRow key={index} hover>
                                    {Object.values(tableConfig).map((val, idx) => (
                                        <React.Fragment key={idx}>{val.cell(item)}</React.Fragment>
                                    ))}
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </TableContainer>
        </Paper>
    );
};

const HeaderCell = ({label, icon}: { label: string, icon: React.ReactNode }) => (
    <TableCell sx={{
        fontWeight: 700,
        fontSize: '0.65rem',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        py: 1.5,
        zIndex: 2
    }}>
        <Stack direction="row" spacing={1} alignItems="center">
            <Box sx={{color: 'text.disabled', display: 'flex'}}>
                {React.cloneElement(icon as React.ReactElement)}
            </Box>
            <span>{label}</span>
        </Stack>
    </TableCell>
);

export default CleanerHistory;
