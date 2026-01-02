import {Box, Divider, LinearProgress, Paper, Stack, Typography} from "@mui/material";
import {
    Dns as ContainerIcon,
    ImportExport as NetworkIcon,
    Memory as MemoryIcon,
    Speed as CpuIcon,
    Storage as StorageIcon
} from "@mui/icons-material";
import {type ContainerStats} from "../../../gen/docker/v1/docker_pb";
import {formatBytes, getUsageColor} from "../../../lib/editor.ts";
import type {ReactNode} from "react";

interface AggregateStatsProps {
    containers: ContainerStats[];
    loading?: boolean;
}

function AggregateStats({containers}: AggregateStatsProps) {
    const totals = containers.reduce((acc, curr) => {
        acc.cpu += curr.cpuUsage;
        acc.memUsed += Number(curr.memoryUsage);
        acc.memLimit += Number(curr.memoryLimit);
        acc.netRx += Number(curr.networkRx);
        acc.netTx += Number(curr.networkTx);
        acc.diskR += Number(curr.blockRead);
        acc.diskW += Number(curr.blockWrite);
        return acc;
    }, {
        cpu: 0, memUsed: 0, memLimit: 0,
        netRx: 0, netTx: 0, diskR: 0, diskW: 0
    });

    const memPercent = totals.memLimit > 0 ? (totals.memUsed / totals.memLimit) * 100 : 0;
    const activeContainers = containers.length;

    return (
        <Paper
            variant="outlined"
            sx={{
                p: 2,
                mb: 2,
                borderRadius: 2,
                bgcolor: 'background.paper',
                display: 'flex',
                alignItems: 'center'
            }}
        >
            <Stack
                direction="row"
                spacing={4}
                divider={<Divider orientation="vertical" flexItem/>}
                sx={{width: '100%', overflowX: 'auto'}}
            >
                {/* Container Count */}
                <StatItem
                    icon={<ContainerIcon color="primary"/>}
                    label="Containers"
                    value={activeContainers.toString()}
                    subValue="Active Instances"
                />

                {/* Total CPU Load */}
                <StatItem
                    icon={<CpuIcon sx={{color: getUsageColor(totals.cpu / 10)}}/>}
                    label="Total CPU"
                    value={`${totals.cpu.toFixed(1)}%`}
                    subValue="Cumulative Load"
                />

                {/* Memory Aggregation */}
                <Box sx={{minWidth: 200}}>
                    <Stack direction="row" spacing={1} alignItems="center" sx={{mb: 0.5}}>
                        <MemoryIcon sx={{color: getUsageColor(memPercent), fontSize: 20}}/>
                        <Typography variant="overline" sx={{fontWeight: 700, color: 'text.secondary', lineHeight: 1}}>
                            Aggregate Memory
                        </Typography>
                    </Stack>
                    <Typography variant="h6" sx={{fontFamily: 'monospace', fontWeight: 800, lineHeight: 1}}>
                        {formatBytes(totals.memUsed)}
                    </Typography>
                    <Box sx={{mt: 1}}>
                        <LinearProgress
                            variant="determinate"
                            value={Math.min(memPercent, 100)}
                            sx={{
                                height: 6,
                                borderRadius: 3,
                                bgcolor: 'grey.100',
                                '& .MuiLinearProgress-bar': {bgcolor: getUsageColor(memPercent)}
                            }}
                        />
                        <Typography variant="caption" color="text.secondary" sx={{display: 'block', mt: 0.5}}>
                            {memPercent.toFixed(1)}% of total limits
                        </Typography>
                    </Box>
                </Box>

                {/* Network Totals */}
                <StatItem
                    icon={<NetworkIcon sx={{color: 'info.main'}}/>}
                    label="Network I/O"
                    value={formatBytes(totals.netRx + totals.netTx)}
                    subValue={`↓${formatBytes(totals.netRx)}  ↑${formatBytes(totals.netTx)}`}
                />

                {/* Disk Totals */}
                <StatItem
                    icon={<StorageIcon sx={{color: 'warning.main'}}/>}
                    label="Block I/O"
                    value={formatBytes(totals.diskR + totals.diskW)}
                    subValue={`R: ${formatBytes(totals.diskR)} W: ${formatBytes(totals.diskW)}`}
                />
            </Stack>
        </Paper>
    );
}

export default AggregateStats;

/**
 * Reusable sub-component for individual statistics
 */
function StatItem({icon, label, value, subValue}: {
    icon: ReactNode,
    label: string,
    value: string,
    subValue: string
}) {
    return (
        <Box sx={{minWidth: 140}}>
            <Stack direction="row" spacing={1} alignItems="center" sx={{mb: 0.5}}>
                {icon}
                <Typography variant="overline" sx={{fontWeight: 700, color: 'text.secondary', lineHeight: 1}}>
                    {label}
                </Typography>
            </Stack>
            <Typography variant="h6" sx={{fontFamily: 'monospace', fontWeight: 800, lineHeight: 1}}>
                {value}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{whiteSpace: 'nowrap'}}>
                {subValue}
            </Typography>
        </Box>
    );
}

