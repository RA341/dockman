import React from 'react';
import {
    Box,
    Checkbox,
    Chip,
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
import {CalendarMonth, InfoOutlineRounded, Label as LabelIcon} from '@mui/icons-material';
import scrollbarStyles from "../../components/scrollbar-style.tsx";
import type {Network} from "../../gen/docker/v1/docker_pb.ts";
import {useCopyButton} from "../../hooks/copy.ts";
import CopyButton from "../../components/copy-button.tsx";
import {formatDate} from "../../lib/api.ts";
import {type SortOrder, sortTable, type TableInfo, useSort} from "../../lib/table.ts";
import {TableLabelWithSort} from "../../lib/table-shared.tsx";
import {useConfig} from "../../hooks/config.ts";
import {useNavigate} from "react-router-dom";

interface NetworkTableProps {
    networks: Network[];
    selectedNetworks?: string[];
    onSelectionChange?: (selectedIds: string[]) => void;
}

export const NetworkTable = ({networks, selectedNetworks = [], onSelectionChange}: NetworkTableProps) => {
    const {handleCopy, copiedId} = useCopyButton()

    const handleRowSelection = (volumeName: string) => {
        if (!onSelectionChange) return;

        const newSelection = selectedNetworks.includes(volumeName)
            ? selectedNetworks.filter(name => name !== volumeName)
            : [...selectedNetworks, volumeName];

        onSelectionChange(newSelection);
    };
    const handleSelectAll = () => {
        if (!onSelectionChange) return;

        const allSelected = selectedNetworks.length === networks.length;
        const newSelection = allSelected ? [] : networks.map(vol => vol.id);
        onSelectionChange(newSelection);
    };
    const isAllSelected = selectedNetworks.length === networks.length && networks.length > 0;
    const isIndeterminate = selectedNetworks.length > 0 && selectedNetworks.length < networks.length;

    const {dockYaml} = useConfig()
    const {
        sortField,
        sortOrder,
        handleSort,
    } = useSort(
        dockYaml?.networkPage?.sort?.sortField ?? 'name',
        (dockYaml?.networkPage?.sort?.sortOrder as SortOrder) ?? 'asc'
    )

    const nav = useNavigate()

    const tableInfo: TableInfo<Network> = {
        checkbox: {
            header: () => (
                <TableCell padding="checkbox">
                    <Checkbox
                        indeterminate={isIndeterminate}
                        checked={isAllSelected}
                        onChange={handleSelectAll}/>
                </TableCell>
            ),
            cell: (network: Network) => (
                <TableCell padding="checkbox">
                    <Checkbox
                        checked={selectedNetworks.includes(network.id)}
                        onChange={() => handleRowSelection(network.id)}
                        onClick={(e) => e.stopPropagation()}/>
                </TableCell>
            ),
            getValue: () => 0
        },
        "Network Name": {
            header: (label) => {
                const active = sortField === label;
                return (
                    <TableCell sx={{fontWeight: "bold"}}>
                        <TableSortLabel
                            active={active}
                            direction={active ? sortOrder : "asc"}
                            onClick={() => handleSort(label)}
                        >
                            {label}
                        </TableSortLabel>
                    </TableCell>
                );
            },
            cell: (network: Network) => (
                <TableCell>
                    <Box sx={{display: "flex", alignItems: "center", gap: 0.5}}>
                        <Box sx={{flex: 1, display: "flex", alignItems: "center", gap: 1}}>
                            <Typography
                                variant="body2"
                                sx={{wordBreak: "break-all", fontWeight: "medium"}}
                            >
                                {network.name}
                            </Typography>
                            {(network.name === "host" || network.name === "bridge" || network.name === "none") && (
                                <Chip
                                    label="System"
                                    size="small"
                                    color="warning"
                                    variant="outlined"/>
                            )}
                        </Box>
                        <CopyButton
                            handleCopy={handleCopy}
                            thisID={network.id}
                            activeID={copiedId ?? ""}
                            tooltip="Copy Network ID"/>
                    </Box>
                </TableCell>
            ),
            getValue: (data) => data.name,
        },
        Action: {
            getValue: (image) => Number(image.id),
            header: (label) => {
                return (
                    <TableCell sx={{fontWeight: 'bold', minWidth: 100}}>
                        {label}
                    </TableCell>
                )
            },
            cell: (image) => (
                <TableCell>
                    <Stack direction="row" spacing={1}>
                        <Tooltip title="Inspect network">
                            <InfoOutlineRounded
                                aria-label="Inspect network"
                                color="primary"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    nav(`inspect/${image.id}`)
                                }}
                                sx={{cursor: 'pointer'}}
                            />
                        </Tooltip>
                    </Stack>
                </TableCell>
            )
        },
        Project: {
            getValue: data => data.composeProject,
            header: (label) => {
                return (
                    <TableCell sx={{fontWeight: "bold", minWidth: 100}}>
                        <TableLabelWithSort
                            label={label}
                            activeLabel={sortField}
                            sortOrder={sortOrder}
                            handleSort={handleSort}
                        />
                    </TableCell>
                );
            },
            cell: (network: Network) => (
                <TableCell>
                    {network.composeProject ? (
                        <Chip
                            label={network.name}
                            size="small"
                            variant="outlined"
                            color="secondary"
                            icon={<LabelIcon/>}
                            sx={{fontSize: "0.75rem"}}
                        />
                    ) : (
                        <Typography variant="body2" color="text.secondary">—</Typography>
                    )}
                </TableCell>
            )
        },
        "In use": {
            getValue: data => data.containerIds.length,
            header: (label) => {
                return (
                    <TableCell sx={{fontWeight: "bold", minWidth: 120}}>
                        <TableLabelWithSort
                            label={label}
                            activeLabel={sortField}
                            sortOrder={sortOrder}
                            handleSort={handleSort}
                        />
                    </TableCell>
                );
            },
            cell: (network: Network) => (
                <TableCell>
                    <Chip
                        label={`${network.containerIds.length} using`}
                        size="small"
                        variant="outlined"
                        color={network.containerIds.length === 0 ? "secondary" : "info"}
                        sx={{fontSize: "0.75rem"}}
                    />
                </TableCell>
            )
        },
        Subnet: {
            getValue: data => data.subnet,
            header: (label) => {
                return (
                    <TableCell sx={{fontWeight: "bold", minWidth: 120}}>
                        <TableLabelWithSort
                            label={label}
                            activeLabel={sortField}
                            sortOrder={sortOrder}
                            handleSort={handleSort}
                        />
                    </TableCell>
                );
            },
            cell: (network: Network) => (
                <TableCell>
                    <Typography variant="body2" color="text.primary">
                        {network.subnet}
                    </Typography>
                </TableCell>
            )
        },
        Scope: {
            getValue: data => data.scope,
            header: (label) => {
                return (
                    <TableCell sx={{fontWeight: "bold", minWidth: 120}}>
                        <TableLabelWithSort
                            label={label}
                            activeLabel={sortField}
                            sortOrder={sortOrder}
                            handleSort={handleSort}
                        />
                    </TableCell>
                );
            },
            cell: (network: Network) => (
                <TableCell>
                    <Typography variant="body2" color="text.primary">
                        {network.scope}
                    </Typography>
                </TableCell>
            )
        },
        Driver: {
            getValue: data => data.driver,
            header: (label) => {
                return (
                    <TableCell sx={{fontWeight: "bold", minWidth: 200}}>
                        <TableLabelWithSort
                            label={label}
                            activeLabel={sortField}
                            sortOrder={sortOrder}
                            handleSort={handleSort}
                        />
                    </TableCell>
                );
            },
            cell: (network: Network) => (
                <TableCell>
                    <Typography variant="body2" color="text.primary">
                        {network.driver === "null" ? "-----" : network.driver}
                    </Typography>
                </TableCell>
            )
        },
        Internal: {
            getValue: data => data.internal.toString(),
            header: (label) => {
                return (
                    <TableCell sx={{fontWeight: "bold", minWidth: 150}}>
                        <TableLabelWithSort
                            label={label}
                            activeLabel={sortField}
                            sortOrder={sortOrder}
                            handleSort={handleSort}
                        />
                    </TableCell>
                );
            },
            cell: (network: Network) => (
                <TableCell>
                    <Typography variant="body2" color="text.primary">
                        {network.internal.toString()}
                    </Typography>
                </TableCell>
            )
        },
        Attachable: {
            getValue: data => data.attachable,
            header: (label) => {
                return (
                    <TableCell sx={{fontWeight: "bold", minWidth: 150}}>
                        <TableLabelWithSort
                            label={label}
                            activeLabel={sortField}
                            sortOrder={sortOrder}
                            handleSort={handleSort}
                        />
                    </TableCell>
                );
            },
            cell: (network: Network) => (
                <TableCell>
                    <Typography variant="body2" color="text.primary">
                        {network.attachable.toString()}
                    </Typography>
                </TableCell>
            )
        },
        "Created": {
            getValue: data => data.createdAt,
            header: (label) => {
                return (
                    <TableCell sx={{fontWeight: "bold", minWidth: 150}}>
                        <TableLabelWithSort
                            label={label}
                            activeLabel={sortField}
                            sortOrder={sortOrder}
                            handleSort={handleSort}
                        />
                    </TableCell>
                );
            },
            cell: (network: Network) => (
                <TableCell>
                    <Box sx={{display: "flex", alignItems: "center"}}>
                        <CalendarMonth sx={{fontSize: 14, mr: 0.5, color: "text.secondary"}}/>
                        <Typography variant="body2">{formatDate(network.createdAt)}</Typography>
                    </Box>
                </TableCell>
            )
        }
    };

    const sortedNetworks = sortTable(networks, sortField, tableInfo, sortOrder);

    return (
        <TableContainer
            component={Paper}
            sx={{
                height: '100%',
                overflow: 'auto',
                ...scrollbarStyles
            }}
        >
            <Table stickyHeader sx={{minWidth: 650}}>
                <TableHead>
                    <TableRow>
                        {Object.entries(tableInfo).map(([key, val], index) => (
                            <React.Fragment key={index}>
                                {val.header(key)}
                            </React.Fragment>
                        ))}
                    </TableRow>
                </TableHead>
                <TableBody>
                    {sortedNetworks.map((network) => (
                        <TableRow
                            key={network.name}
                            hover
                            sx={{
                                '&:last-child td, &:last-child th': {border: 0},
                                cursor: 'pointer',
                                backgroundColor: selectedNetworks.includes(network.name)
                                    ? 'rgba(25, 118, 210, 0.08)'
                                    : 'transparent'
                            }}
                            onClick={() => handleRowSelection(network.id)}
                        >
                            {Object.values(tableInfo).map((val, index) => (
                                <React.Fragment key={index}>
                                    {val.cell(network)}
                                </React.Fragment>
                            ))}
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </TableContainer>
    );
};