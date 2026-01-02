import React from 'react';
import {
    Box,
    Checkbox,
    Chip,
    IconButton,
    Link,
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
import {CalendarToday as CalendarIcon, InfoOutlined as InspectIcon, OpenInNew as OpenIcon} from '@mui/icons-material';
import scrollbarStyles from "../../components/scrollbar-style.tsx";
import {useCopyButton} from "../../hooks/copy.ts";
import type {Image} from "../../gen/docker/v1/docker_pb.ts";
import CopyButton from "../../components/copy-button.tsx";
import {formatDate} from "../../lib/api.ts";
import {type SortOrder, sortTable, type TableInfo, useSort} from "../../lib/table.ts";
import {formatBytes} from "../../lib/editor.ts";
import {useConfig} from "../../hooks/config.ts";
import {useNavigate} from "react-router-dom";
import {getImageHomePageUrl} from "./docker-images.ts";

interface ImageTableProps {
    images: Image[];
    selectedImages?: string[];
    onSelectionChange?: (selectedIds: string[]) => void;
}

export const ImageTable = ({images, selectedImages = [], onSelectionChange}: ImageTableProps) => {
    const {handleCopy, copiedId} = useCopyButton();
    const {dockYaml} = useConfig();
    const navigate = useNavigate();

    const handleRowSelection = (imageId: string) => {
        if (!onSelectionChange) return;
        const newSelection = selectedImages.includes(imageId)
            ? selectedImages.filter(id => id !== imageId)
            : [...selectedImages, imageId];
        onSelectionChange(newSelection);
    };

    const handleSelectAll = () => {
        if (!onSelectionChange) return;
        onSelectionChange(selectedImages.length === images.length ? [] : images.map(img => img.id));
    };

    const {sortField, sortOrder, handleSort} = useSort(
        dockYaml?.imagePage?.sort?.sortField ?? "Images",
        (dockYaml?.imagePage?.sort?.sortOrder as SortOrder) ?? "desc"
    );

    const tableInfo: TableInfo<Image> = {
        checkbox: {
            getValue: () => 0,
            header: () => (
                <TableCell padding="checkbox" sx={headerStyles}>
                    <Checkbox
                        indeterminate={selectedImages.length > 0 && selectedImages.length < images.length}
                        checked={selectedImages.length === images.length && images.length > 0}
                        onChange={handleSelectAll}
                    />
                </TableCell>
            ),
            cell: (image) => (
                <TableCell padding="checkbox">
                    <Checkbox checked={selectedImages.includes(image.id)}/>
                </TableCell>
            )
        },
        Images: {
            getValue: (image) => image.repoTags[0] || 'untagged',
            header: (label) => (
                <TableCell sx={headerStyles}>
                    <TableSortLabel active={sortField === label} direction={sortOrder}
                                    onClick={() => handleSort(label)}>
                        {label}
                    </TableSortLabel>
                </TableCell>
            ),
            cell: (image) => (
                <TableCell>
                    <Stack direction="row" spacing={1.5} alignItems="center">
                        <Box sx={{minWidth: 0}}>
                            {image.repoTags.length > 0 ? (
                                <Link
                                    href={getImageHomePageUrl(image.repoTags[0])}
                                    target="_blank"
                                    rel="noopener"
                                    sx={{
                                        fontWeight: 700,
                                        fontSize: '0.85rem',
                                        textDecoration: 'none',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 0.5,
                                        color: 'primary.main',
                                        '&:hover': {textDecoration: 'underline'}
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    {image.repoTags[0]}
                                    <OpenIcon sx={{fontSize: 12}}/>
                                </Link>
                            ) : (
                                <Typography variant="body2"
                                            sx={{fontWeight: 700, color: 'text.disabled', fontStyle: 'italic'}}>
                                    untagged
                                </Typography>
                            )}
                            <Stack direction="row" spacing={0.5} alignItems="center">
                                <Typography variant="caption"
                                            sx={{fontFamily: 'monospace', color: 'text.secondary', fontSize: '0.7rem'}}>
                                    {image.id.substring(0, 12)}
                                </Typography>
                                <CopyButton
                                    handleCopy={handleCopy}
                                    thisID={image.id}
                                    activeID={copiedId ?? ""}
                                    tooltip={"Copy Image ID"}
                                />
                            </Stack>
                        </Box>
                    </Stack>
                </TableCell>
            )
        },
        Actions: {
            getValue: () => 0,
            header: () => <TableCell sx={{...headerStyles,}}>ACTIONS</TableCell>,
            cell: (image) => (
                <TableCell>
                    <Tooltip title="Inspect Image" arrow>
                        <IconButton
                            size="small"
                            color="primary"
                            onClick={(e) => {
                                e.stopPropagation();
                                navigate(`inspect/${image.id}`);
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
            getValue: (image) => Number(image.containers),
            header: (label) => (
                <TableCell sx={headerStyles}>
                    <TableSortLabel active={sortField === label} direction={sortOrder}
                                    onClick={() => handleSort(label)}>
                        USAGE
                    </TableSortLabel>
                </TableCell>
            ),
            cell: (image) => (
                <TableCell>
                    {Number(image.containers) > 0 ? (
                        <Chip
                            label={`${image.containers} In Use`}
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
        Size: {
            getValue: (image) => Number(image.size),
            header: (label) => (
                <TableCell sx={headerStyles}>
                    <TableSortLabel active={sortField === label} direction={sortOrder}
                                    onClick={() => handleSort(label)}>
                        {label}
                    </TableSortLabel>
                </TableCell>
            ),
            cell: (image) => (
                <TableCell>
                    <Typography variant="body2" sx={{fontFamily: 'monospace', fontWeight: 600}}>
                        {formatBytes(image.size)}
                    </Typography>
                </TableCell>
            )
        },
        Shared: {
            getValue: (image) => Number(image.sharedSize),
            header: (label) => (
                <TableCell sx={headerStyles}>
                    <TableSortLabel active={sortField === label} direction={sortOrder}
                                    onClick={() => handleSort(label)}>
                        SHARED
                    </TableSortLabel>
                </TableCell>
            ),
            cell: (image) => (
                <TableCell>
                    <Typography variant="body2" sx={{fontFamily: 'monospace', color: 'text.secondary'}}>
                        {Number(image.sharedSize) > 0 ? formatBytes(image.sharedSize) : '—'}
                    </Typography>
                </TableCell>
            )
        },
        Created: {
            getValue: (image) => image.created,
            header: (label) => (
                <TableCell sx={headerStyles}>
                    <TableSortLabel active={sortField === label} direction={sortOrder}
                                    onClick={() => handleSort(label)}>
                        {label}
                    </TableSortLabel>
                </TableCell>
            ),
            cell: (image) => (
                <TableCell>
                    <Stack direction="row" spacing={1} alignItems="center" sx={{color: 'text.secondary'}}>
                        <CalendarIcon sx={{fontSize: 14}}/>
                        <Typography variant="body2" sx={{whiteSpace: 'nowrap'}}>
                            {formatDate(image.created)}
                        </Typography>
                    </Stack>
                </TableCell>
            )
        },
    };

    const sortedImages = sortTable(images, sortField, tableInfo, sortOrder);

    return (
        <TableContainer
            component={Paper}
            variant="outlined"
            sx={{
                flexGrow: 1,
                minHeight: 0,
                borderRadius: 2,
                overflow: 'auto',
                ...scrollbarStyles
            }}
        >
            <Table stickyHeader size="small">
                <TableHead>
                    <TableRow>
                        {Object.entries(tableInfo).map(([key, val], index) => (
                            <React.Fragment key={index}>{val.header(key)}</React.Fragment>
                        ))}
                    </TableRow>
                </TableHead>
                <TableBody>
                    {sortedImages.map((image) => (
                        <TableRow
                            key={image.id}
                            hover
                            onClick={() => handleRowSelection(image.id)}
                            selected={selectedImages.includes(image.id)}
                            sx={{
                                cursor: 'pointer',
                                '&.Mui-selected': {bgcolor: 'primary.lighter'},
                                '&:last-child td, &:last-child th': {border: 0}
                            }}
                        >
                            {Object.values(tableInfo).map((val, index) => (
                                <React.Fragment key={index}>{val.cell(image)}</React.Fragment>
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
