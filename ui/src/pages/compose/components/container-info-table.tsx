import React, {useEffect, useState} from 'react'
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
} from '@mui/material'
import {
    DocumentScannerOutlined as LogsIcon,
    InfoOutlined as InspectIcon,
    OpenInNew as OpenIcon,
    Terminal as ExecIcon,
    TerminalOutlined as ContainerIcon,
    Update as UpdateIcon
} from '@mui/icons-material'
import {ContainerInfoPort} from './container-info-port.tsx'
import type {ContainerList, Port} from "../../../gen/docker/v1/docker_pb.ts"
import scrollbarStyles from "../../../components/scrollbar-style.tsx"
import CopyButton from "../../../components/copy-button.tsx"
import {useCopyButton} from "../../../hooks/copy.ts"
import ComposeLink from "../../../components/compose-link.tsx"
import {type SortOrder, sortTable, type TableInfo, useSort} from '../../../lib/table.ts'
import {useConfig} from "../../../hooks/config.ts";
import {getImageHomePageUrl} from "../../images/docker-images.ts";

interface ContainerTableProps {
    containers: ContainerList[],
    loading: boolean,
    selectedServices: string[],
    onShowLogs: (containerId: string, containerName: string) => void,
    setSelectedServices: (services: string[]) => void,
    useContainerId?: boolean,
    onExec?: (containerId: string, containerName: string) => void,
    onInspect?: (containerId: string) => void
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
        onInspect
    }: ContainerTableProps) {
    const [isLoaded, setIsLoaded] = useState(false);
    const {handleCopy, copiedId} = useCopyButton();
    const {handleCopy: handleCopyIP, copiedId: copiedIPId} = useCopyButton();
    const {dockYaml} = useConfig();

    useEffect(() => {
        if (!loading) setIsLoaded(true);
    }, [loading]);

    const getContName = (c: ContainerList) => useContainerId ? c.id : c.serviceName;

    const {sortField, sortOrder, handleSort} = useSort(
        dockYaml?.containerPage?.sort?.sortField ?? 'Name',
        (dockYaml?.containerPage?.sort?.sortOrder as SortOrder) ?? 'asc'
    );

    const tableInfo: TableInfo<ContainerList> = {
        checkbox: {
            getValue: () => 0,
            header: () => (
                <TableCell padding="checkbox" sx={headerStyles}>
                    <Checkbox
                        indeterminate={selectedServices.length > 0 && selectedServices.length < containers.length}
                        checked={containers.length > 0 && selectedServices.length === containers.length}
                        onChange={() => setSelectedServices(selectedServices.length === containers.length ? [] : containers.map(getContName))}
                    />
                </TableCell>
            ),
            cell: (c) => (
                <TableCell padding="checkbox">
                    <Checkbox checked={selectedServices.includes(getContName(c))}/>
                </TableCell>
            )
        },
        Name: {
            getValue: (c) => c.name,
            header: (label) => (
                <TableCell sx={headerStyles}>
                    <TableSortLabel active={sortField === label} direction={sortOrder}
                                    onClick={() => handleSort(label)}>
                        {label}
                    </TableSortLabel>
                </TableCell>
            ),
            cell: (c) => (
                <TableCell>
                    <Stack direction="row" spacing={1.5} alignItems="center">
                        <ContainerIcon sx={{fontSize: 18, color: 'text.disabled'}}/>
                        <Box sx={{minWidth: 0}}>
                            <Typography variant="body2" sx={{fontWeight: 700, lineHeight: 1.2}}>{c.name}</Typography>
                            <Stack direction="row" spacing={0.5} alignItems="center">
                                <Typography variant="caption" sx={{
                                    fontFamily: 'monospace',
                                    color: 'text.secondary',
                                    fontSize: '0.65rem'
                                }}>
                                    {c.id.substring(0, 12)}
                                </Typography>
                                <CopyButton
                                    tooltip={"Copy Container ID"}
                                    handleCopy={handleCopy}
                                    thisID={c.id}
                                    activeID={copiedId ?? ""}
                                />
                            </Stack>
                        </Box>
                    </Stack>
                </TableCell>
            )
        },
        Status: {
            getValue: (c) => c.status,
            header: (label) => (
                <TableCell sx={headerStyles}>
                    <TableSortLabel active={sortField === label} direction={sortOrder}
                                    onClick={() => handleSort(label)}>STATUS</TableSortLabel>
                </TableCell>
            ),
            cell: (c) => <TableCell><StatusChip status={c.status}/></TableCell>
        },
        Actions: {
            getValue: () => 0,
            header: () => <TableCell sx={headerStyles}>ACTIONS</TableCell>,
            cell: (c) => (
                <TableCell>
                    <Stack direction="row" spacing={0.5} onClick={(e) => e.stopPropagation()}>
                        <ActionBtn icon={<InspectIcon fontSize="inherit"/>} title="Inspect"
                                   onClick={() => onInspect?.(c.id)}/>
                        <ActionBtn icon={<LogsIcon fontSize="inherit"/>} title="Logs"
                                   onClick={() => onShowLogs(c.id, c.name)}/>
                        <ActionBtn icon={<ExecIcon fontSize="inherit"/>} title="Terminal"
                                   onClick={() => onExec?.(c.id, c.name)}/>
                    </Stack>
                </TableCell>
            )
        },
        Image: {
            getValue: (c) => c.imageName,
            header: (label) => (
                <TableCell sx={headerStyles}>
                    <TableSortLabel active={sortField === label} direction={sortOrder}
                                    onClick={() => handleSort(label)}>IMAGE</TableSortLabel>
                </TableCell>
            ),
            cell: (c) => (
                <TableCell>
                    <Stack direction="row" alignItems="center" spacing={1}>
                        <Link
                            href={getImageHomePageUrl(c.imageName)}
                            target="_blank"
                            sx={{
                                fontSize: '0.75rem',
                                fontWeight: 600,
                                display: 'flex',
                                alignItems: 'center',
                                gap: 0.5,
                                textDecoration: 'none'
                            }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            {c.imageName.split(':')[0]} <OpenIcon sx={{fontSize: 10}}/>
                        </Link>
                        {c.updateAvailable && <UpdateIcon sx={{fontSize: 14, color: 'warning.main'}}/>}
                    </Stack>
                </TableCell>
            )
        },
        Stack: {
            getValue: (c) => c.stackName,
            header: (label) => (
                <TableCell sx={headerStyles}>
                    <TableSortLabel active={sortField === label} direction={sortOrder}
                                    onClick={() => handleSort(label)}>STACK</TableSortLabel>
                </TableCell>
            ),
            cell: (c) => (
                <TableCell>
                    <Stack direction="row" spacing={1} alignItems="center">
                        <ComposeLink stackName={c.stackName} servicePath={c.servicePath}/>
                    </Stack>
                </TableCell>
            )
        },
        IP: {
            getValue: (c) => c.IPAddress,
            header: (_) => <TableCell sx={headerStyles}>IP ADDRESS</TableCell>,
            cell: (c) => (
                <TableCell>
                    {c.IPAddress ? (
                        <Stack direction="row" spacing={0.5} alignItems="center">
                            <Typography variant="caption"
                                        sx={{fontFamily: 'monospace', fontWeight: 600}}>{c.IPAddress}</Typography>
                            <CopyButton tooltip={"Copy IP"} handleCopy={handleCopyIP} thisID={c.IPAddress}
                                        activeID={copiedIPId ?? ""}/>
                        </Stack>
                    ) : <Typography variant="caption" color="text.disabled">—</Typography>}
                </TableCell>
            )
        },
        Ports: {
            getValue: (v) => v.ports.at(0)?.public ?? 0,
            header: (label) => {
                return <TableCell sx={headerStyles}>
                    <TableSortLabel active={sortField === label} direction={sortOrder}
                                    onClick={() => handleSort(label)}>PORTS</TableSortLabel>
                </TableCell>
            },
            cell: (c) => (
                <TableCell sx={{maxWidth: 330}}>
                    <Box sx={{display: 'flex', flexWrap: 'wrap', gap: 0.5}}>{formatPorts(c.ports)}</Box>
                </TableCell>
            )
        }
    }

    const sortedContainers = sortTable(containers, sortField, tableInfo, sortOrder)

    const handleRowClick = (id: string) => {
        const newSelected = selectedServices.includes(id)
            ? selectedServices.filter(s => s !== id)
            : [...selectedServices, id]
        setSelectedServices(newSelected)
    }

    return (
        <TableContainer
            component={Paper} variant="outlined"
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
                        {Object.entries(tableInfo).map(
                            ([key, val], idx) =>
                                <React.Fragment key={idx}>
                                    {val.header(key)}
                                </React.Fragment>
                        )}
                    </TableRow>
                </TableHead>
                <TableBody sx={{opacity: isLoaded ? 1 : 0, transition: 'opacity 200ms ease-in-out'}}>
                    {sortedContainers.map(c => (
                        <TableRow
                            hover
                            onClick={() => handleRowClick(getContName(c))}
                            selected={selectedServices.includes(getContName(c))}
                            key={c.id}
                            sx={{cursor: 'pointer', '&.Mui-selected': {bgcolor: 'primary.lighter'}}}
                        >
                            {Object.values(tableInfo).map((col, idx) => <React.Fragment
                                key={idx}>{col.cell(c)}</React.Fragment>)}
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </TableContainer>
    )
}

const headerStyles = {
    fontWeight: 700,
    fontSize: '0.65rem',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    py: 1.5,
    whiteSpace: 'nowrap',
    bgcolor: 'background.paper',
    zIndex: 2,
};

const ActionBtn = ({icon, title, onClick}: { icon: any, title: string, onClick: () => void }) => (
    <Tooltip title={title} arrow>
        <IconButton
            size="small"
            onClick={onClick}
            sx={{
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 1.5,
                p: 0.4,
                fontSize: '1.1rem',
                color: 'primary.main'
            }}
        >
            {icon}
        </IconButton>
    </Tooltip>
);

const StatusChip = ({status}: { status: string }) => {
    const s = status.toLowerCase();
    let color: any = "default";
    if (s.startsWith('up')) color = "success";
    else if (s.startsWith('exited')) color = "error";
    else if (s.includes('restarting')) color = "warning";

    return (
        <Chip
            label={status} size="small" variant="outlined" color={color}
            sx={{
                fontWeight: 700,
                fontSize: '0.6rem',
                height: 18,
                textTransform: 'uppercase',
                bgcolor: color === 'default' ? 'transparent' : `${color}.lighter`
            }}
        />
    );
};

const formatPorts = (ports: Port[]) => {
    if (!ports?.length) return <Typography variant="caption" color="text.disabled">—</Typography>;
    return ports
        // .sort((a, b) => a.public - b.public)
        .map((p, i) => (
            <Box
                key={i}
                component="span"
                sx={{
                    bgcolor: 'action.hover',
                    px: 0.5,
                    py: 0.1,
                    borderRadius: 0.5,
                    border: '1px solid',
                    borderColor: 'divider'
                }}
            >
                <ContainerInfoPort port={p}/>
            </Box>
        ));
};
