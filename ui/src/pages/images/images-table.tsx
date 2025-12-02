import React from 'react';
import {
    Box,
    Checkbox,
    Chip,
    Link,
    Paper,
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
import {CalendarToday as CalendarIcon} from '@mui/icons-material';
import {getImageHomePageUrl} from "../../hooks/docker-images.ts";
import scrollbarStyles from "../../components/scrollbar-style.tsx";
import {useCopyButton} from "../../hooks/copy.ts";
import type {Image} from "../../gen/docker/v1/docker_pb.ts";
import CopyButton from "../../components/copy-button.tsx";
import {formatDate} from "../../lib/api.ts";
import {type SortOrder, sortTable, type TableInfo, useSort} from "../../lib/table.ts";
import {formatBytes} from "../../lib/editor.ts";
import {useConfig} from "../../hooks/config.ts";

interface ImageTableProps {
    images: Image[];
    selectedImages?: string[];
    onSelectionChange?: (selectedIds: string[]) => void;
}

export const ImageTable = (
    {
        images,
        selectedImages = [],
        onSelectionChange
    }: ImageTableProps
) => {
    const {handleCopy, copiedId} = useCopyButton();

    const handleRowSelection = (imageId: string) => {
        if (!onSelectionChange) return;

        const newSelection = selectedImages.includes(imageId)
            ? selectedImages.filter(id => id !== imageId)
            : [...selectedImages, imageId];

        onSelectionChange(newSelection);
    };

    const handleSelectAll = () => {
        if (!onSelectionChange) return;

        const allSelected = selectedImages.length === images.length;
        const newSelection = allSelected ? [] : images.map(img => img.id);
        onSelectionChange(newSelection);
    };

    const isAllSelected = selectedImages.length === images.length && images.length > 0;
    const isIndeterminate = selectedImages.length > 0 && selectedImages.length < images.length;

    const {dockYaml} = useConfig()

    const {
        sortField,
        sortOrder,
        handleSort
    } = useSort(
        dockYaml?.imagePage?.sort?.sortField ?? "images",
        (dockYaml?.imagePage?.sort?.sortOrder as SortOrder) ?? "desc"
    );

    const tableInfo: TableInfo<Image> = {
        checkbox: {
            getValue: () => 0,
            header: () => (
                <TableCell padding="checkbox">
                    <Checkbox
                        indeterminate={isIndeterminate}
                        checked={isAllSelected}
                        onChange={handleSelectAll}
                    />
                </TableCell>
            ),
            cell: (image) => (
                <TableCell padding="checkbox">
                    <Checkbox
                        checked={selectedImages.includes(image.id)}
                        onChange={() => handleRowSelection(image.id)}
                        onClick={(e) => e.stopPropagation()}
                    />
                </TableCell>
            )
        },
        Images: {
            getValue: (image) => image.repoTags[0] || 'untagged',
            header: (label) => {
                const active = sortField === label;
                return (
                    <TableCell sx={{fontWeight: 'bold'}}>
                        <TableSortLabel
                            active={active}
                            direction={active ? sortOrder : 'asc'}
                            onClick={() => handleSort(label)}
                        >
                            {label}
                        </TableSortLabel>
                    </TableCell>
                )
            },
            cell: (image) => (
                <TableCell>
                    <Box sx={{display: 'flex', alignItems: 'center', gap: 1}}>
                        <Box sx={{flex: 0.6}}>
                            {image.repoTags.length > 0 ? (
                                <Tooltip title="Open image website" arrow>
                                    <Link
                                        href={getImageHomePageUrl(image.repoTags[0])}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        sx={{textDecoration: 'none', color: 'primary.main'}}
                                        onClick={(event) => event.stopPropagation()}
                                    >
                                        <Typography variant="body2" component="span" sx={{
                                            wordBreak: 'break-all',
                                            '&:hover': {textDecoration: 'underline'}
                                        }}>
                                            {image.repoTags[0]}
                                        </Typography>
                                    </Link>
                                </Tooltip>
                            ) : (
                                <Typography variant="body2" sx={{fontWeight: 'medium'}}>
                                    Untagged
                                </Typography>
                            )}
                        </Box>
                        <CopyButton
                            tooltip={"Copy image ID"}
                            handleCopy={handleCopy}
                            thisID={image.id}
                            activeID={copiedId ?? ""}
                        />
                    </Box>
                </TableCell>
            )
        },
        Containers: {
            getValue: (image) => Number(image.containers),
            header: (label) => {
                const active = sortField === label;
                return (
                    <TableCell sx={{fontWeight: 'bold', minWidth: 100}}>
                        <TableSortLabel
                            active={active}
                            direction={active ? sortOrder : 'asc'}
                            onClick={() => handleSort(label)}
                        >
                            {label}
                        </TableSortLabel>
                    </TableCell>
                )
            },
            cell: (image) => (
                <TableCell>
                    {Number(image.containers) > 0 ? (
                        <Chip
                            label={`${Number(image.containers)} using`}
                            size="small"
                            color="success"
                            variant="outlined"
                        />
                    ) : (
                        <Chip
                            label={`Unused ${Number(image.containers)}`}
                            size="small"
                            color="info"
                            variant="outlined"
                        />
                    )}
                </TableCell>
            )
        },
        Size: {
            getValue: (image) => Number(image.size),
            header: (label) => {
                const active = sortField === label;
                return (
                    <TableCell sx={{fontWeight: 'bold', minWidth: 100}}>
                        <TableSortLabel
                            active={active}
                            direction={active ? sortOrder : 'asc'}
                            onClick={() => handleSort(label)}
                        >
                            {label}
                        </TableSortLabel>
                    </TableCell>
                )
            },
            cell: (image) => (
                <TableCell>
                    <Typography variant="body2" sx={{fontWeight: 'medium'}}>
                        {formatBytes(image.size)}
                    </Typography>
                </TableCell>
            )
        },
        "Shared Size": {
            getValue: (image) => Number(image.sharedSize),
            header: (label) => {
                const active = sortField === label;
                return (
                    <TableCell sx={{fontWeight: 'bold', minWidth: 100}}>
                        <TableSortLabel
                            active={active}
                            direction={active ? sortOrder : 'asc'}
                            onClick={() => handleSort(label)}
                        >
                            {label}
                        </TableSortLabel>
                    </TableCell>
                )
            },
            cell: (image) => (
                <TableCell>
                    <Typography variant="body2">
                        {Number(image.sharedSize) > 0 ? formatBytes(image.sharedSize) : '—'}
                    </Typography>
                </TableCell>
            )
        },
        // todo tags
        // tags: {
        //     getValue: (image) => image.repoTags[0],
        //     header: () => <TableCell sx={{fontWeight: 'bold', minWidth: 100}}>Tags</TableCell>,
        //     cell: (image) => (
        //         <TableCell>
        //             <Stack direction="row" spacing={0.5} sx={{flexWrap: 'wrap', gap: 0.5}}>
        //                 {image.repoTags.length > 1 ? (
        //                     <>
        //                         {image.repoTags.slice(1, 3).map((tag, idx) => (
        //                             <Chip
        //                                 key={idx}
        //                                 label={tag}
        //                                 size="small"
        //                                 variant="outlined"
        //                                 color="primary"
        //                                 icon={<TagIcon/>}
        //                                 sx={{fontSize: '0.75rem'}}
        //                             />
        //                         ))}
        //                         {image.repoTags.length > 3 && (
        //                             <Chip
        //                                 label={`+${image.repoTags.length - 3} more`}
        //                                 size="small"
        //                                 variant="outlined"
        //                                 sx={{fontSize: '0.75rem'}}
        //                             />
        //                         )}
        //                     </>
        //                 ) : (
        //                     <Typography variant="body2" color="text.secondary">
        //                         —
        //                     </Typography>
        //                 )}
        //             </Stack>
        //         </TableCell>
        //     )
        // },
        Created: {
            getValue: (image) => image.created,
            header: (label) => {
                const active = sortField === label;
                return (
                    <TableCell sx={{fontWeight: 'bold', minWidth: 150}}>
                        <TableSortLabel
                            active={active}
                            direction={active ? sortOrder : 'asc'}
                            onClick={() => handleSort(label)}
                        >
                            {label}
                        </TableSortLabel>
                    </TableCell>
                )
            },
            cell: (image) => (
                <TableCell>
                    <Box sx={{display: 'flex', alignItems: 'center'}}>
                        <CalendarIcon sx={{fontSize: 14, mr: 0.5, color: 'text.secondary'}}/>
                        <Typography variant="body2">
                            {formatDate(image.created)}
                        </Typography>
                    </Box>
                </TableCell>
            )
        }
    };

    const sortedImages = sortTable(images, sortField, tableInfo, sortOrder);

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
                    {sortedImages.map((image) => (
                        <TableRow
                            key={image.id}
                            hover
                            sx={{
                                '&:last-child td, &:last-child th': {border: 0},
                                cursor: 'pointer',
                                backgroundColor: selectedImages.includes(image.id)
                                    ? 'rgba(25, 118, 210, 0.08)'
                                    : 'transparent'
                            }}
                            onClick={() => handleRowSelection(image.id)}
                        >
                            {Object.values(tableInfo).map((val, index) => (
                                <React.Fragment key={index}>
                                    {val.cell(image)}
                                </React.Fragment>
                            ))}
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </TableContainer>
    );
};
