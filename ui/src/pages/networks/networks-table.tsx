import React from 'react';
import {
    Box,
    Checkbox,
    Chip,
    IconButton,
    Paper,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    TableSortLabel,
    Tooltip,
    Typography
} from '@mui/material';
import {
    CalendarMonth as CalendarIcon,
    DeviceHubOutlined as DriverIcon,
    InfoOutlined as InspectIcon,
    LanOutlined as NetworkIcon,
    ShieldOutlined as InternalIcon
} from '@mui/icons-material';
import scrollbarStyles from "../../components/scrollbar-style.tsx";
import type {Network} from "../../gen/docker/v1/docker_pb.ts";
import {useCopyButton} from "../../hooks/copy.ts";
import CopyButton from "../../components/copy-button.tsx";
import {formatDate} from "../../lib/api.ts";
import {type SortOrder, sortTable, type TableInfo, useSort} from "../../lib/table.ts";
import {useConfig} from "../../hooks/config.ts";
import {useNavigate} from "react-router-dom";

interface NetworkTableProps {
    networks: Network[];
    selectedNetworks?: string[];
    onSelectionChange?: (selectedIds: string[]) => void;
}

export const NetworkTable = ({networks, selectedNetworks = [], onSelectionChange}: NetworkTableProps) => {
    const {handleCopy, copiedId} = useCopyButton();
    const {dockYaml} = useConfig();
    const nav = useNavigate();

    const handleRowSelection = (id: string) => {
        if (!onSelectionChange) return;
        const newSelection = selectedNetworks.includes(id)
            ? selectedNetworks.filter(name => name !== id)
            : [...selectedNetworks, id];
        onSelectionChange(newSelection);
    };

    const handleSelectAll = () => {
        if (!onSelectionChange) return;
        onSelectionChange(selectedNetworks.length === networks.length ? [] : networks.map(n => n.id));
    };

    const {sortField, sortOrder, handleSort} = useSort(
        dockYaml?.networkPage?.sort?.sortField ?? 'Name',
        (dockYaml?.networkPage?.sort?.sortOrder as SortOrder) ?? 'asc'
    );

    const tableInfo: TableInfo<Network> = {
        checkbox: {
            getValue: () => 0,
            header: () => (
                <TableCell padding="checkbox" sx={headerStyles}>
                    <Checkbox
                        indeterminate={selectedNetworks.length > 0 && selectedNetworks.length < networks.length}
                        checked={networks.length > 0 && selectedNetworks.length === networks.length}
                        onChange={handleSelectAll}
                    />
                </TableCell>
            ),
            cell: (n) => (
                <TableCell padding="checkbox">
                    <Checkbox checked={selectedNetworks.includes(n.id)}/>
                </TableCell>
            )
        },
        Name: {
            getValue: (n) => n.name,
            header: (label) => (
                <TableCell sx={headerStyles}>
                    <TableSortLabel active={sortField === label} direction={sortOrder}
                                    onClick={() => handleSort(label)}>
                        {label}
                    </TableSortLabel>
                </TableCell>
            ),
            cell: (n) => (
                <TableCell>
                    <Stack direction="row" spacing={1.5} alignItems="center">
                        <NetworkIcon sx={{fontSize: 18, color: 'text.disabled'}}/>
                        <Box sx={{minWidth: 0}}>
                            <Stack direction="row" spacing={1} alignItems="center">
                                <Typography variant="body2"
                                            sx={{fontWeight: 400, lineHeight: 1.2}}>{n.name}</Typography>
                                {(n.name === "host" || n.name === "bridge" || n.name === "none") && (
                                    <Chip label="System" size="small" variant="outlined" sx={{
                                        height: 16,
                                        fontSize: '0.6rem',
                                        fontWeight: 700,
                                        color: 'warning.main',
                                        borderColor: 'warning.light'
                                    }}/>
                                )}
                            </Stack>
                            <Stack direction="row" spacing={0.5} alignItems="center">
                                <Typography variant="caption"
                                            sx={{fontFamily: 'monospace', color: 'text.secondary', fontSize: '0.7rem'}}>
                                    {n.id.substring(0, 12)}
                                </Typography>
                                <CopyButton tooltip={"Copy Network ID"} handleCopy={handleCopy} thisID={n.id}
                                            activeID={copiedId ?? ""}/>
                            </Stack>
                        </Box>
                    </Stack>
                </TableCell>
            )
        },
        Driver: {
            getValue: (n) => n.driver,
            header: (label) => (
                <TableCell sx={headerStyles}>
                    <TableSortLabel active={sortField === label} direction={sortOrder}
                                    onClick={() => handleSort(label)}>DRIVER</TableSortLabel>
                </TableCell>
            ),
            cell: (n) => (
                <TableCell>
                    <Chip
                        icon={<DriverIcon sx={{fontSize: '12px !important'}}/>}
                        label={n.driver}
                        size="small"
                        variant="outlined"
                        sx={{fontWeight: 600, fontSize: '0.7rem', textTransform: 'uppercase'}}
                    />
                </TableCell>
            )
        },
        Actions: {
            getValue: () => 0,
            header: () => <TableCell sx={{...headerStyles}}>ACTIONS</TableCell>,
            cell: (n) => (
                <TableCell>
                    <Tooltip title="Inspect Network" arrow>
                        <IconButton
                            size="small"
                            color="primary"
                            onClick={(e) => {
                                e.stopPropagation();
                                nav(`inspect/${n.id}`);
                            }}
                            sx={{border: '1px solid', borderColor: 'divider', borderRadius: 1.5, p: 0.5}}
                        >
                            <InspectIcon fontSize="small"/>
                        </IconButton>
                    </Tooltip>
                </TableCell>
            )
        },
        Usage: {
            getValue: (n) => n.containerIds.length,
            header: (label) => (
                <TableCell sx={headerStyles}>
                    <TableSortLabel active={sortField === label} direction={sortOrder}
                                    onClick={() => handleSort(label)}>USAGE</TableSortLabel>
                </TableCell>
            ),
            cell: (n) => (
                <TableCell>
                    <Chip
                        label={`${n.containerIds.length} Containers`}
                        size="small"
                        variant="outlined"
                        color={n.containerIds.length > 0 ? "info" : "default"}
                        sx={{
                            fontWeight: 700,
                            fontSize: '0.65rem',
                            height: 20,
                            bgcolor: 'transparent',
                            borderWidth: 1,
                        }}
                    />
                </TableCell>
            )
        },
        Subnet: {
            getValue: (n) => n.subnet,
            header: (label) => (
                <TableCell sx={headerStyles}>
                    <TableSortLabel active={sortField === label} direction={sortOrder}
                                    onClick={() => handleSort(label)}>SUBNET</TableSortLabel>
                </TableCell>
            ),
            cell: (n) => (
                <TableCell>
                    <Typography variant="body2" sx={{
                        fontFamily: 'monospace',
                        fontWeight: 500,
                        color: n.subnet ? 'text.primary' : 'text.disabled'
                    }}>
                        {n.subnet || '—'}
                    </Typography>
                </TableCell>
            )
        },
        Attributes: {
            getValue: (n) => n.scope,
            header: () => <TableCell sx={headerStyles}>ATTRIBUTES</TableCell>,
            cell: (n) => (
                <TableCell>
                    <Stack direction="row" spacing={1}>
                        <Tooltip title={`Scope: ${n.scope}`}>
                            <Chip label={n.scope} size="small" variant="outlined"
                                  sx={{height: 18, fontSize: '0.6rem', textTransform: 'uppercase'}}/>
                        </Tooltip>
                        {n.internal && (
                            <Tooltip title="Internal Network Only">
                                <InternalIcon sx={{fontSize: 16, color: 'warning.main'}}/>
                            </Tooltip>
                        )}
                    </Stack>
                </TableCell>
            )
        },
        Created: {
            getValue: (n) => n.createdAt,
            header: (label) => (
                <TableCell sx={headerStyles}>
                    <TableSortLabel active={sortField === label} direction={sortOrder}
                                    onClick={() => handleSort(label)}>CREATED</TableSortLabel>
                </TableCell>
            ),
            cell: (n) => (
                <TableCell>
                    <Stack direction="row" spacing={1} alignItems="center" sx={{color: 'text.secondary'}}>
                        <CalendarIcon sx={{fontSize: 14}}/>
                        <Typography variant="body2" sx={{whiteSpace: 'nowrap'}}>{formatDate(n.createdAt)}</Typography>
                    </Stack>
                </TableCell>
            )
        },
    };

    const sortedNetworks = sortTable(networks, sortField, tableInfo, sortOrder);

    return (
        <TableContainer component={Paper} variant="outlined"
                        sx={{height: '100%', borderRadius: 2, overflow: 'auto', ...scrollbarStyles}}>
            <Table stickyHeader size="small">
                <TableHead>
                    <TableRow>
                        {Object.entries(tableInfo).map(([key, val], idx) => (
                            <React.Fragment key={idx}>{val.header(key)}</React.Fragment>
                        ))}
                    </TableRow>
                </TableHead>
                <TableBody>
                    {sortedNetworks.map((n) => (
                        <TableRow
                            key={n.id}
                            hover
                            onClick={() => handleRowSelection(n.id)}
                            selected={selectedNetworks.includes(n.id)}
                            sx={{cursor: 'pointer', '&.Mui-selected': {bgcolor: 'primary.lighter'}}}
                        >
                            {Object.values(tableInfo).map((val, idx) => (
                                <React.Fragment key={idx}>{val.cell(n)}</React.Fragment>
                            ))}
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </TableContainer>
    );
};

const headerStyles = {
    fontWeight: 700,
    fontSize: '0.65rem',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    py: 1.5,
    whiteSpace: 'nowrap'
};
