import React, {useEffect, useState} from 'react'
import {
    Box,
    Checkbox,
    Chip,
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
} from '@mui/material'
import {DocumentScannerOutlined, Terminal, Update} from '@mui/icons-material'
import {ContainerInfoPort} from './container-info-port.tsx'
import type {ContainerList, Port} from "../../../gen/docker/v1/docker_pb.ts"
import {getImageHomePageUrl} from "../../../hooks/docker-images.ts"
import scrollbarStyles from "../../../components/scrollbar-style.tsx"
import CopyButton from "../../../components/copy-button.tsx"
import {useCopyButton} from "../../../hooks/copy.ts"
import ComposeLink from "../../../components/compose-link.tsx"
import {type SortOrder, sortTable, type TableInfo, useSort} from '../../../lib/table.ts'
import {useConfig} from "../../../hooks/config.ts";

interface ContainerTableProps {
    containers: ContainerList[]
    loading: boolean
    selectedServices: string[]
    onShowLogs: (containerId: string, containerName: string) => void
    setSelectedServices: (services: string[]) => void,
    useContainerId?: boolean,
    onExec?: (containerId: string, containerName: string) => void
}

export function ContainerTable(
    {
        containers,
        onShowLogs,
        loading,
        setSelectedServices,
        selectedServices,
        useContainerId = false,
        onExec,
    }: ContainerTableProps) {

    const [isLoaded, setIsLoaded] = useState(false)
    const {handleCopy, copiedId} = useCopyButton()

    const getContName = (container: ContainerList) => useContainerId ? container.id : container.serviceName


    useEffect(() => {
        if (!loading && !isLoaded) setTimeout(() => setIsLoaded(true), 50)
    }, [loading, isLoaded])

    const handleSelectAll = () => {
        const allSelected = selectedServices.length === containers.length
        setSelectedServices(allSelected ? [] : containers.map(getContName))
    }

    const {dockYaml} = useConfig()
    const {
        sortField,
        sortOrder,
        handleSort,
    } = useSort(
        dockYaml?.containerPage?.sort?.sortField ?? 'name',
        (dockYaml?.containerPage?.sort?.sortOrder as SortOrder) ?? 'asc'
    )

    const handleRowClick = (id: string) => {
        const newSelected = selectedServices.includes(id)
            ? selectedServices.filter(s => s !== id)
            : [...selectedServices, id]
        setSelectedServices(newSelected)
    }

    const tableInfo: TableInfo<ContainerList> = {
        checkbox: {
            getValue: () => 0,
            header: () => (
                <TableCell padding="checkbox">
                    <Checkbox
                        color="primary"
                        indeterminate={selectedServices.length > 0 && selectedServices.length < containers.length}
                        checked={containers.length > 0 && selectedServices.length === containers.length}
                        onChange={handleSelectAll}
                        slotProps={{input: {'aria-label': 'select all containers'}}}
                    />
                </TableCell>
            ),
            cell: (container) => (
                <TableCell padding="checkbox">
                    <Checkbox
                        color="primary"
                        checked={selectedServices.includes(getContName(container))}
                        slotProps={{input: {'aria-labelledby': `container-table-checkbox-${container.id}`}}}
                    />
                </TableCell>
            )
        },
        Name: {
            getValue: (c) => c.serviceName,
            header: (label) => (
                <TableCell sx={tableHeaderStyles}>
                    <TableSortLabel
                        active={sortField === label}
                        direction={sortField === label ? sortOrder : 'asc'}
                        onClick={() => handleSort(label)}
                    >
                        {label}
                    </TableSortLabel>
                </TableCell>
            ),
            cell: (container) => (
                <TableCell component="th" id={`container-table-checkbox-${container.id}`} scope="row">
                    <Box sx={{display: 'flex', alignItems: 'center', gap: 1}}>
                        <Typography variant="body1" fontWeight="500">{container.name}</Typography>
                        <CopyButton
                            handleCopy={handleCopy}
                            thisID={container.id}
                            activeID={copiedId ?? ""}
                            tooltip={"Copy Container ID"}
                        />
                    </Box>
                </TableCell>
            )
        },
        Status: {
            getValue: (c) => c.status,
            header: (label) => (
                <TableCell sx={tableHeaderStyles}>
                    <TableSortLabel
                        active={sortField === label}
                        direction={sortField === label ? sortOrder : 'asc'}
                        onClick={() => handleSort(label)}
                    >
                        {label}
                    </TableSortLabel>
                </TableCell>
            ),
            cell: (container) => (
                <TableCell>
                    <Chip label={container.status} color={getStatusChipColor(container.status)} size="small"
                          sx={{textTransform: 'capitalize'}}/>
                </TableCell>
            )
        },
        Actions: {
            getValue: () => 0,
            header: () => <TableCell sx={tableHeaderStyles}>Actions</TableCell>,
            cell: (container) => (
                <TableCell align="right">
                    <Stack direction="row" spacing={1}>
                        <Tooltip title="Show container logs">
                            <DocumentScannerOutlined
                                aria-label="Show container logs"
                                color="primary"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onShowLogs(container.id, container.name)
                                }}
                                sx={{cursor: 'pointer'}}
                            />
                        </Tooltip>
                        {onExec && (
                            <Tooltip title="Exec into container">
                                <Terminal
                                    aria-label="Exec into container"
                                    color="primary"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onExec(container.id, container.name)
                                    }}
                                    sx={{cursor: 'pointer'}}
                                />
                            </Tooltip>
                        )}
                    </Stack>
                </TableCell>
            )
        },
        Image: {
            getValue: (c) => c.imageName,
            header: (label) => (
                <TableCell sx={tableHeaderStyles}>
                    <TableSortLabel
                        active={sortField === label}
                        direction={sortField === label ? sortOrder : 'asc'}
                        onClick={() => handleSort(label)}
                    >
                        {label}
                    </TableSortLabel>
                </TableCell>
            ),
            cell: (container) => (
                <TableCell>
                    {container.updateAvailable && (
                        <Tooltip title={"Update available"}>
                            <Update sx={{fontSize: 16, color: 'gold', verticalAlign: 'middle', mr: 1}}/>
                        </Tooltip>
                    )}
                    <Tooltip title="Open image website" arrow>
                        <Link
                            href={getImageHomePageUrl(container.imageName)}
                            target="_blank"
                            rel="noopener noreferrer"
                            sx={{textDecoration: 'none', color: 'primary.main'}}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <Typography variant="body2" component="span"
                                        sx={{wordBreak: 'break-all', '&:hover': {textDecoration: 'underline'}}}>
                                {container.imageName}
                            </Typography>
                        </Link>
                    </Tooltip>
                </TableCell>
            )
        },
        Stack: {
            getValue: (c) => c.stackName,
            header: (label) => (
                <TableCell sx={tableHeaderStyles}>
                    <TableSortLabel
                        active={sortField === label}
                        direction={sortField === label ? sortOrder : 'asc'}
                        onClick={() => handleSort(label)}
                    >
                        {label}
                    </TableSortLabel>
                </TableCell>
            ),
            cell: (container) => (
                <TableCell>
                    <ComposeLink
                        stackName={container.stackName}
                        servicePath={container.servicePath}
                    />
                </TableCell>
            )
        },
        Ports: {
            getValue: () => 0,
            header: (label) => (
                <TableCell sx={tableHeaderStyles}>
                    {label}
                </TableCell>),
            cell: (container) => (
                <TableCell width={360}>
                    {formatPorts(container.ports)}
                </TableCell>
            )
        }
    }

    const sortedContainers = sortTable(containers, sortField, tableInfo, sortOrder)
    const isEmpty = !loading && containers.length === 0

    return (
        <TableContainer component={Paper} sx={{flexGrow: 1, boxShadow: 3, borderRadius: 2, ...scrollbarStyles}}>
            <Table stickyHeader aria-label="docker containers table">
                <TableHead>
                    <TableRow>
                        {Object.entries(tableInfo).map(([key, val], idx) => <React.Fragment
                            key={idx}>{val.header(key)}</React.Fragment>)}
                    </TableRow>
                </TableHead>
                <TableBody sx={{opacity: isLoaded ? 1 : 0, transition: 'opacity 200ms ease-in-out'}}>
                    {isEmpty ? (
                        <TableRow>
                            <TableCell colSpan={7} sx={{border: 0, height: 550}}>
                                <Box sx={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    height: '100%'
                                }}>
                                    <Typography variant="h5" color="text.secondary">No containers found</Typography>
                                </Box>
                            </TableCell>
                        </TableRow>
                    ) : sortedContainers.map(container => {
                        const isItemSelected = selectedServices.includes(getContName(container))
                        return (
                            <TableRow
                                hover
                                onClick={() => handleRowClick(getContName(container))}
                                role="checkbox"
                                aria-checked={isItemSelected}
                                tabIndex={-1}
                                key={container.id}
                                selected={isItemSelected}
                                sx={{cursor: 'pointer', '&:last-child td, &:last-child th': {border: 0}}}
                            >
                                {Object.values(tableInfo).map((col, idx) => <React.Fragment
                                    key={idx}>{col.cell(container)}</React.Fragment>)}
                            </TableRow>
                        )
                    })}
                </TableBody>
            </Table>
        </TableContainer>
    )
}

const tableHeaderStyles = {fontWeight: 'bold', backgroundColor: 'background.paper'}

const formatPorts = (ports: Port[]) => {
    if (!ports || ports.length === 0) return <>—</>
    return (<>{ports.map((port, idx) => <React.Fragment
        key={`${port.host}-${port.public}-${port.private}-${port.type}`}>
        <ContainerInfoPort port={port}/>
        {idx < ports.length - 1 && ', '}
    </React.Fragment>)}</>)
}

const getStatusChipColor = (status: string): "success" | "warning" | "default" | "error" => {
    const s = status.toLowerCase()
    if (s.startsWith('up')) return 'success'
    if (s.startsWith('exited')) return 'error'
    if (s.includes('restarting')) return 'warning'
    return 'default'
}
