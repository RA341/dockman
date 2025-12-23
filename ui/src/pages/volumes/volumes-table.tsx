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
    Typography
} from '@mui/material';
import {CalendarToday as CalendarIcon, FolderOpen as FolderIcon} from '@mui/icons-material';
import scrollbarStyles from "../../components/scrollbar-style.tsx";
import type {Volume} from "../../gen/docker/v1/docker_pb.ts";
import {formatBytes} from "../../lib/editor.ts";
import {useCopyButton} from "../../hooks/copy.ts";
import CopyButton from "../../components/copy-button.tsx";
import ComposeLink from "../../components/compose-link.tsx";
import {type SortOrder, sortTable, type TableInfo, useSort} from "../../lib/table.ts";
import {formatDate} from "../../lib/api.ts";
import {useConfig} from "../../hooks/config.ts";

interface VolumeTableProps {
    volumes: Volume[];
    selectedVolumes?: string[];
    onSelectionChange?: (selectedIds: string[]) => void;
}

export const VolumeTable = ({
                                volumes,
                                selectedVolumes = [],
                                onSelectionChange
                            }: VolumeTableProps) => {
    const {handleCopy, copiedId} = useCopyButton();
    const {dockYaml} = useConfig();

    const handleRowSelection = (volumeName: string) => {
        if (!onSelectionChange) return;
        const newSelection = selectedVolumes.includes(volumeName)
            ? selectedVolumes.filter(name => name !== volumeName)
            : [...selectedVolumes, volumeName];
        onSelectionChange(newSelection);
    };

    const handleSelectAll = () => {
        if (!onSelectionChange) return;
        onSelectionChange(selectedVolumes.length === volumes.length ? [] : volumes.map(vol => vol.name));
    };

    const {sortField, sortOrder, handleSort} = useSort(
        dockYaml?.volumesPage?.sort?.sortField ?? 'name',
        (dockYaml?.volumesPage?.sort?.sortOrder as SortOrder) ?? 'asc'
    );

    const tableInfo: TableInfo<Volume> = {
        checkbox: {
            getValue: () => 0,
            header: () => (
                <TableCell padding="checkbox" sx={headerStyles}>
                    <Checkbox
                        indeterminate={selectedVolumes.length > 0 && selectedVolumes.length < volumes.length}
                        checked={volumes.length > 0 && selectedVolumes.length === volumes.length}
                        onChange={handleSelectAll}
                    />
                </TableCell>
            ),
            cell: (volume) => (
                <TableCell padding="checkbox">
                    <Checkbox checked={selectedVolumes.includes(volume.name)}/>
                </TableCell>
            )
        },
        "Volume Name": {
            getValue: (volume) => volume.name,
            header: (label) => (
                <TableCell sx={headerStyles}>
                    <TableSortLabel active={sortField === label} direction={sortOrder}
                                    onClick={() => handleSort(label)}>
                        {label}
                    </TableSortLabel>
                </TableCell>
            ),
            cell: (volume) => (
                <TableCell>
                    <Stack direction="row" spacing={1.5} alignItems="center">
                        <Box sx={{minWidth: 0}}>
                            <Typography variant="body2" sx={{fontWeight: 200, lineHeight: 1.2, wordBreak: 'break-all'}}>
                                {volume.name}
                            </Typography>
                            <CopyButton
                                handleCopy={handleCopy}
                                thisID={volume.name}
                                activeID={copiedId ?? ""}
                                tooltip="Copy Name"
                            />
                        </Box>
                    </Stack>
                </TableCell>
            )
        },
        Usage: {
            getValue: (volume) => !!volume.containerID,
            header: (label) => (
                <TableCell sx={headerStyles}>
                    <TableSortLabel active={sortField === label} direction={sortOrder}
                                    onClick={() => handleSort(label)}>
                        STATUS
                    </TableSortLabel>
                </TableCell>
            ),
            cell: (volume) => (
                <TableCell>
                    {volume.containerID ? (
                        <Chip
                            label="In Use"
                            size="small"
                            color="success"
                            variant="outlined"
                            sx={{fontWeight: 700, fontSize: '0.65rem', height: 20, bgcolor: 'success.lighter'}}
                        />
                    ) : (
                        <Chip
                            label="Unused"
                            size="small"
                            variant="outlined"
                            sx={{fontWeight: 700, fontSize: '0.65rem', height: 20, color: 'text.disabled'}}
                        />
                    )}
                </TableCell>
            )
        },
        Project: {
            getValue: (volume) => volume.composeProjectName || '',
            header: (label) => (
                <TableCell sx={headerStyles}>
                    <TableSortLabel active={sortField === label} direction={sortOrder}
                                    onClick={() => handleSort(label)}>
                        {label}
                    </TableSortLabel>
                </TableCell>
            ),
            cell: (volume) => (
                <TableCell>
                    {volume.composeProjectName ? (
                        <Stack direction="row" spacing={1} alignItems="center">
                            <ComposeLink
                                servicePath={volume.composePath}
                                stackName={volume.composeProjectName}
                            />
                        </Stack>
                    ) : (
                        <Typography variant="caption" color="text.disabled">—</Typography>
                    )}
                </TableCell>
            )
        },
        Size: {
            getValue: (volume) => volume.size,
            header: (label) => (
                <TableCell sx={headerStyles}>
                    <TableSortLabel active={sortField === label} direction={sortOrder}
                                    onClick={() => handleSort(label)}>
                        {label}
                    </TableSortLabel>
                </TableCell>
            ),
            cell: (volume) => (
                <TableCell>
                    <Typography variant="body2" sx={{fontFamily: 'monospace', fontWeight: 600}}>
                        {formatBytes(volume.size)}
                    </Typography>
                </TableCell>
            )
        },
        "Mount Point": {
            getValue: (volume) => volume.mountPoint,
            header: (label) => (
                <TableCell sx={headerStyles}>
                    <TableSortLabel active={sortField === label} direction={sortOrder}
                                    onClick={() => handleSort(label)}>
                        MOUNT POINT
                    </TableSortLabel>
                </TableCell>
            ),
            cell: (volume) => (
                <TableCell>
                    <Stack direction="row" spacing={1} alignItems="center">
                        <FolderIcon sx={{fontSize: 14, color: 'text.disabled'}}/>
                        <Typography variant="caption"
                                    sx={{fontFamily: 'monospace', color: 'text.secondary', wordBreak: 'break-all'}}>
                            {volume.mountPoint}
                        </Typography>
                        <CopyButton
                            handleCopy={handleCopy}
                            thisID={volume.mountPoint}
                            activeID={copiedId ?? ""}
                            tooltip="Copy Path"
                        />
                    </Stack>
                </TableCell>
            )
        },
        Created: {
            getValue: (volume) => volume.createdAt,
            header: (label) => (
                <TableCell sx={headerStyles}>
                    <TableSortLabel active={sortField === label} direction={sortOrder}
                                    onClick={() => handleSort(label)}>
                        {label}
                    </TableSortLabel>
                </TableCell>
            ),
            cell: (volume) => (
                <TableCell>
                    <Stack direction="row" spacing={1} alignItems="center" sx={{color: 'text.secondary'}}>
                        <CalendarIcon sx={{fontSize: 14}}/>
                        <Typography variant="body2" sx={{whiteSpace: 'nowrap'}}>
                            {formatDate(volume.createdAt)}
                        </Typography>
                    </Stack>
                </TableCell>
            )
        }
    };

    const sortedVolumes = sortTable(volumes, sortField, tableInfo, sortOrder);

    return (
        <TableContainer
            component={Paper}
            variant="outlined"
            sx={{height: '100%', borderRadius: 2, overflow: 'auto', ...scrollbarStyles}}
        >
            <Table stickyHeader size="small">
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
                    {sortedVolumes.map((volume) => (
                        <TableRow
                            key={volume.name}
                            hover
                            onClick={() => handleRowSelection(volume.name)}
                            selected={selectedVolumes.includes(volume.name)}
                            sx={{
                                cursor: 'pointer',
                                '&.Mui-selected': {bgcolor: 'primary.lighter'},
                                '&:last-child td, &:last-child th': {border: 0}
                            }}
                        >
                            {Object.values(tableInfo).map((val, index) => (
                                <React.Fragment key={index}>
                                    {val.cell(volume)}
                                </React.Fragment>
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
