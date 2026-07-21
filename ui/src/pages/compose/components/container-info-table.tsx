import React, {type ReactNode, useEffect, useState} from 'react'
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
    Update as UpdateIcon
} from '@mui/icons-material'
import {ContainerInfoPort} from './container-info-port.tsx'
import type {ContainerList, Port} from "../../../gen/docker/v1/docker_pb.ts"
import scrollbarStyles from "../../../components/scrollbar-style.tsx"
import CopyButton from "../../../components/copy-button.tsx"
import {useCopyButton} from "../../../hooks/copy.ts"
import ComposeLink from "../../../components/compose-link.tsx"
import {formatTimeAgo, type SortOrder, sortTable, type TableInfo, useSort} from '../../../lib/table.ts'
import {useConfig} from "../../../hooks/config.ts";
import {getImageHomePageUrl} from "../../images/docker-images.ts";

interface ContainerTableProps {
    containers: ContainerList[],
    loading: boolean,
    selectedServices: string[],
    setSelectedServices: (services: string[]) => void,
    useContainerId?: boolean,
    onLogs?: (containerId: string, containerName: string) => void,
    onExec?: (containerId: string, containerName: string) => void,
    onInspect?: (containerId: string) => void
}

export function ContainerTable(
    {
        containers,
        loading,
        selectedServices,
        setSelectedServices,
        useContainerId = false,
        onLogs,
        onExec,
        onInspect
    }: ContainerTableProps) {
    const [isLoaded, setIsLoaded] = useState(false);
    const {handleCopy, copiedId} = useCopyButton();

    const {dockYaml} = useConfig();

    useEffect(() => {
        if (!loading) setIsLoaded(true);
    }, [loading]);

    // relative times ("28 seconds ago") are computed at render time; since
    // data refreshes are event-driven (no fast polling anymore), tick a
    // re-render so the labels keep counting between refreshes. `now` feeds
    // formatTimeAgo explicitly so memoization recomputes on each tick.
    const [now, setNow] = useState(() => Date.now());
    // rows created moments ago tick every 2s so their age counts smoothly
    // right after an action; stable tables settle to a 10s tick
    const hasFresh = containers.some(c => {
        const age = now - new Date(c.created).getTime();
        return age >= 0 && age < 90_000;
    });
    useEffect(() => {
        const id = setInterval(() => setNow(Date.now()), hasFresh ? 2000 : 10000);
        return () => clearInterval(id);
    }, [hasFresh]);

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
                    <TableSortLabel active={sortField === label}
                                    direction={sortOrder}
                                    onClick={() => handleSort(label)}>
                        {label}
                    </TableSortLabel>
                </TableCell>
            ),
            cell: (c) => (
                <TableCell>
                    <Stack direction="row" spacing={1.5} sx={{
                        alignItems: "center"
                    }}>
                        <Box sx={{minWidth: 0}}>
                            <Typography variant="body2" sx={{fontWeight: 700, lineHeight: 1.2}}>{c.name}</Typography>
                            <Stack direction="row" spacing={0.5} sx={{
                                alignItems: "center"
                            }}>
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
            getValue: (c) => c.state,
            header: (label) => (
                <TableCell sx={headerStyles}>
                    <TableSortLabel
                        active={sortField === label} direction={sortOrder}
                        onClick={() => handleSort(label)}
                    >
                        STATUS
                    </TableSortLabel>
                </TableCell>
            ),
            cell: (c) => (
                <TableCell sx={{width: 120}}>
                    <StatusChip status={c.state} health={c.health}/>

                </TableCell>
            )
        },
        Uptime: {
            getValue: (c) => new Date(c.created),
            header: (label) => (
                <TableCell sx={headerStyles}>
                    <TableSortLabel
                        active={sortField === label} direction={sortOrder}
                        onClick={() => handleSort(label)}
                    >
                        CREATED
                    </TableSortLabel>
                </TableCell>
            ),
            cell: (c) => (
                <TableCell sx={{width: 150, whiteSpace: 'nowrap'}}>
                    <Tooltip title={new Date(c.created).toLocaleString()} arrow placement="top">
                        <Box>
                            <Typography variant="body2" sx={{fontWeight: 500, lineHeight: 1.3}}>
                                {formatTimeAgo(new Date(c.created), now)}
                            </Typography>
                            <Typography
                                variant="caption"
                                sx={{
                                    color: 'text.secondary',
                                    fontSize: '0.68rem',
                                    whiteSpace: 'nowrap',
                                }}
                            >
                                {new Date(c.created).toLocaleDateString()}{' '}
                                {new Date(c.created).toLocaleTimeString([], {
                                    hour: '2-digit',
                                    minute: '2-digit'
                                })}
                            </Typography>
                        </Box>
                    </Tooltip>
                </TableCell>
            )
        },
        Actions: {
            getValue: () => 0,
            header: () => <TableCell sx={headerStyles}>ACTIONS</TableCell>,
            cell: (c) => (
                <TableCell>
                    <Stack direction="row" spacing={0.5} onClick={(e) => e.stopPropagation()}>
                        {onInspect && (<ActionBtn
                            icon={<InspectIcon fontSize="inherit"/>}
                            title="Inspect"
                            onClick={() => onInspect?.(c.id)}
                        />)}
                        {onLogs && (<ActionBtn
                            icon={<LogsIcon fontSize="inherit"/>}
                            title="Logs"
                            onClick={() => onLogs?.(c.id, c.name)}
                        />)}
                        {onExec && (<ActionBtn
                            icon={<ExecIcon fontSize="inherit"/>}
                            title="Terminal"
                            onClick={() => onExec?.(c.id, c.name)}
                        />)}
                    </Stack>
                </TableCell>
            )
        },
        Image: {
            getValue: (c) => c.imageName,
            header: (label) => (
                <TableCell sx={headerStyles}>
                    <TableSortLabel
                        active={sortField === label}
                        direction={sortOrder}
                        onClick={() => handleSort(label)}
                    >
                        IMAGE
                    </TableSortLabel>
                </TableCell>
            ),
            cell: (c) => (
                <TableCell>
                    <Stack direction="row" spacing={1} sx={{
                        alignItems: "center"
                    }}>
                        <Link
                            href={getImageHomePageUrl(c.imageName)}
                            target="_blank"
                            sx={{
                                fontSize: '0.75rem',
                                fontWeight: 500,
                                color: 'text.secondary',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 0.5,
                                textDecoration: 'none',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                maxWidth: 240,
                                '&:hover': {color: 'primary.main'},
                            }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            {c.imageName.split(':')[0]} <OpenIcon sx={{fontSize: 10, flexShrink: 0}}/>
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
                    <TableSortLabel
                        active={sortField === label}
                        direction={sortOrder}
                        onClick={() => handleSort(label)}
                    >
                        STACK
                    </TableSortLabel>
                </TableCell>
            ),
            cell: (c) => (
                <TableCell sx={{maxWidth: 150}}>
                    <Tooltip title={c.stackName} arrow placement="top">
                        <Box sx={{overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>
                            <ComposeLink stackName={c.stackName} servicePath={c.servicePath}/>
                        </Box>
                    </Tooltip>
                </TableCell>
            )
        },
        IP: {
            getValue: (c) => c.IPAddress.length,
            header: () => <TableCell sx={headerStyles}>ADDRESS</TableCell>,
            cell: (c) => (
                <TableCell>
                    {c.IPAddress ?
                        <Stack direction="row" spacing={0.5} sx={{
                            alignItems: "center"
                        }}>
                            <Box sx={{display: 'flex', flexWrap: 'wrap', gap: 0.5}}>
                                {formatIPAddr(c.IPAddress)}
                            </Box>
                        </Stack>
                        : <Typography variant="caption" sx={{
                        color: "text.disabled"
                    }}>—</Typography>
                    }
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
                    <Box sx={{display: 'flex', flexWrap: 'wrap', gap: 0.5}}>
                        {formatPorts(c.ports)}
                    </Box>
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
                            sx={{
                                cursor: 'pointer',
                                '&:nth-of-type(odd)': {bgcolor: 'rgba(255,255,255,0.015)'},
                                '& td': {borderColor: 'rgba(255,255,255,0.06)'},
                                '&.Mui-selected': {bgcolor: 'primary.lighter'},
                            }}
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

const ActionBtn = ({icon, title, onClick}: { icon: ReactNode, title: string, onClick: () => void }) => (
    <Tooltip title={title} arrow>
        <IconButton
            size="small"
            onClick={onClick}
            sx={{
                p: 0.5,
                fontSize: '1.05rem',
                color: 'text.secondary',
                '&:hover': {
                    color: 'primary.main',
                    bgcolor: 'action.hover',
                },
            }}
        >
            {icon}
        </IconButton>
    </Tooltip>
);

const StatusChip = ({status, health}: { status: string; health: string }) => {
    const displayStatus = health ? health : status;

    const s = displayStatus.toLowerCase();
    let color: "default" | "primary" | "secondary" | "error" | "info" | "success" | "warning";

    switch (s) {
        case "healthy":
        case "running":
            color = "success";
            break;
        case "created":
        case "starting":
            color = "info";
            break;
        case "paused":
            color = "secondary";
            break;
        case "unhealthy":
        case "restarting":
            color = "warning";
            break;
        case "dead":
        case "exited":
        case "removing":
            color = "error";
            break;
        default:
            color = "default";
    }

    return (
        <Chip
            label={displayStatus}
            size="small"
            variant="outlined"
            color={color}
            sx={{
                fontWeight: 700,
                fontSize: '0.7rem',
                height: 20,
                textTransform: 'uppercase',
            }}
        />
    );
};

const formatPorts = (ports: Port[]) => {
    if (!ports?.length) return (
        <Typography variant="caption" sx={{
            color: "text.disabled"
        }}>—</Typography>
    );
    return ports
        // .sort((a, b) => a.public - b.public)
        .map((p, i) => (
            <Box
                key={i}
                component="span"
                sx={{
                    bgcolor: 'action.hover',
                    px: 0.6,
                    py: 0.1,
                    borderRadius: 0.75,
                    fontFamily: 'monospace',
                    fontSize: '0.72rem',
                    whiteSpace: 'nowrap',
                }}
            >
                <ContainerInfoPort port={p}/>
            </Box>
        ));
};

const formatIPAddr = (addrs: string[]) => {
    if (!addrs?.length) return (
        <Typography variant="caption" sx={{
            color: "text.disabled"
        }}>—</Typography>
    );

    return addrs.map((addr, i) => (
        <Box
            key={i}
            component="span"
            sx={{
                bgcolor: 'action.hover',
                px: 0.6,
                py: 0.1,
                borderRadius: 0.75,
                fontFamily: 'monospace',
                fontSize: '0.72rem',
                whiteSpace: 'nowrap',
            }}
        >
            <Tooltip title="Open IP in new tab" arrow>
                <Link
                    href={`http://${addr}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    sx={{
                        color: 'text.secondary',
                        textDecoration: 'none',
                        '&:hover': {color: 'primary.main', textDecoration: 'underline'},
                    }}
                >
                    {addr}
                </Link>
            </Tooltip>
        </Box>
    ));
};
