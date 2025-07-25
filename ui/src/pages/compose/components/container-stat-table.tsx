import {
    Box,
    CircularProgress,
    Fade,
    IconButton,
    Paper,
    Skeleton,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    TableSortLabel,
    Tooltip,
    Typography,
    useTheme
} from "@mui/material"
import React, {useState} from "react"
import GetAppIcon from '@mui/icons-material/GetApp'
import PublishIcon from '@mui/icons-material/Publish'
import EditIcon from '@mui/icons-material/Edit'
import {Article, ContentCopy} from "@mui/icons-material"
import CheckIcon from "@mui/icons-material/Check"
import {type ContainerStats, ORDER, SORT_FIELD} from "../../../gen/docker/v1/docker_pb"
import {formatBytes, getUsageColor} from "../../../lib/editor.ts";


interface ContainersTableProps {
    activeSortField: SORT_FIELD
    order: ORDER
    onFieldClick: (field: SORT_FIELD, orderBy: ORDER) => void
    containers: ContainerStats[]
    placeHolders?: number
    loading: boolean
}

export function ContainerStatTable(
    {
        containers,
        onFieldClick,
        activeSortField,
        order,
        loading,
        placeHolders = 5,
    }: ContainersTableProps) {

    const isEmpty = !loading && containers.length === 0

    const handleSortRequest = (field: SORT_FIELD) => {
        if (loading || isEmpty) {
            return
        }
        const isAsc = activeSortField === field && order === ORDER.ASC
        const newOrder = isAsc ? ORDER.DSC : ORDER.ASC
        const finalOrder = activeSortField !== field ? ORDER.DSC : newOrder
        onFieldClick(field, finalOrder)
    }

    const createSortableHeader = (field: SORT_FIELD, label: string, icon?: React.ReactNode) => (
        <TableSortLabel
            active={activeSortField === field}
            direction={order === ORDER.ASC ? 'asc' : 'desc'}
            onClick={() => handleSortRequest(field)}
        >
            <Box component="span" sx={{display: 'flex', alignItems: 'center'}}>
                {icon && (
                    <Box component="span" sx={{mr: 0.5, display: 'flex', alignItems: 'center'}}>
                        {icon}
                    </Box>
                )}
                {label}
            </Box>
        </TableSortLabel>
    )

    const [copiedId, setCopiedId] = useState<string | null>(null)
    const handleCopy = (event: React.MouseEvent<HTMLButtonElement>, id: string) => {
        event.stopPropagation()
        navigator.clipboard.writeText(id).then()
        setCopiedId(id)
        setTimeout(() => {
            setCopiedId(null)
        }, 1500)
    }

    const theme = useTheme()

    return (
        <TableContainer
            component={Paper}
            sx={{
                flexGrow: 1,
                boxShadow: 3,
                borderRadius: 2,
                height: '98%',
                maxHeight: '100%',
                overflow: 'auto',
                display: 'flex',
                flexDirection: 'column',
                // Custom scrollbar styling
                '&::-webkit-scrollbar': {
                    width: '8px',
                    height: '8px',
                },
                '&::-webkit-scrollbar-track': {
                    background: theme.palette.mode === 'dark'
                        ? 'rgba(255, 255, 255, 0.1)'
                        : 'rgba(0, 0, 0, 0.1)',
                    borderRadius: '4px',
                },
                '&::-webkit-scrollbar-thumb': {
                    background: theme.palette.mode === 'dark'
                        ? 'rgba(255, 255, 255, 0.3)'
                        : 'rgba(0, 0, 0, 0.3)',
                    borderRadius: '4px',
                    '&:hover': {
                        background: theme.palette.mode === 'dark'
                            ? 'rgba(255, 255, 255, 0.5)'
                            : 'rgba(0, 0, 0, 0.5)',
                    }
                },
                '&::-webkit-scrollbar-corner': {
                    background: 'transparent',
                },
                // Firefox scrollbar styling
                scrollbarWidth: 'thin',
                scrollbarColor: theme.palette.mode === 'dark'
                    ? 'rgba(255, 255, 255, 0.3) rgba(255, 255, 255, 0.1)'
                    : 'rgba(0, 0, 0, 0.3) rgba(0, 0, 0, 0.1)',
            }}
        >
            <Table
                stickyHeader
                sx={{
                    minWidth: 900, // Increased minimum width
                    width: '100%'
                    // Removed tableLayout: 'fixed' to allow flexible column sizing
                }}
                aria-label="container stats table"
            >
                <TableHead>
                    <TableRow sx={{
                        '& th': {
                            fontWeight: 'bold',
                            backgroundColor: 'background.paper',
                            position: 'sticky',
                            top: 0,
                            zIndex: 100
                        }
                    }}>
                        <TableCell sx={{minWidth: 140, width: 'auto'}}>
                            {createSortableHeader(SORT_FIELD.NAME, 'Container Name')}
                        </TableCell>
                        <TableCell sx={{minWidth: 80, width: 'auto', textAlign: 'center'}}>
                            {createSortableHeader(SORT_FIELD.CPU, 'CPU %')}
                        </TableCell>
                        <TableCell sx={{minWidth: 120, width: 'auto'}}>
                            {createSortableHeader(SORT_FIELD.MEM, 'Memory Usage')}
                        </TableCell>
                        <TableCell sx={{minWidth: 180, width: 'auto'}}>
                            <Box sx={{display: 'flex', alignItems: 'center', flexWrap: 'nowrap'}}>
                                <Typography variant="body2" sx={{fontWeight: 'bold', mr: 1, whiteSpace: 'nowrap'}}>
                                    Network:
                                </Typography>
                                <Box sx={{display: 'flex', alignItems: 'center', flexWrap: 'nowrap'}}>
                                    {createSortableHeader(SORT_FIELD.NETWORK_RX, "Rx",
                                        <GetAppIcon fontSize="small"/>)
                                    }
                                    <Typography component="span" sx={{mx: 0.5}}>/</Typography>
                                    {createSortableHeader(SORT_FIELD.NETWORK_TX, "Tx",
                                        <PublishIcon fontSize="small"/>)
                                    }
                                </Box>
                            </Box>
                        </TableCell>
                        <TableCell sx={{minWidth: 180, width: 'auto'}}>
                            <Box sx={{display: 'flex', alignItems: 'center', flexWrap: 'nowrap'}}>
                                <Typography variant="body2" sx={{fontWeight: 'bold', mr: 1, whiteSpace: 'nowrap'}}>
                                    Block I/O:
                                </Typography>
                                <Box sx={{display: 'flex', alignItems: 'center', flexWrap: 'nowrap'}}>
                                    {createSortableHeader(SORT_FIELD.DISK_W, "Write", <EditIcon fontSize="small"/>)}
                                    <Typography component="span" sx={{mx: 0.5}}>/</Typography>
                                    {createSortableHeader(SORT_FIELD.DISK_R, "Read", <Article fontSize="small"/>)}
                                </Box>
                            </Box>
                        </TableCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {loading ? (
                        [...Array(placeHolders)].map((_, index) => (
                            <TableRow key={`skeleton-${index}`}>
                                <TableCell><Skeleton animation="wave" variant="rounded"/></TableCell>
                                <TableCell>
                                    <Skeleton animation="wave" variant="rounded"
                                              width={80}
                                              height={24}/>
                                </TableCell>
                                <TableCell><Skeleton animation="wave" variant="rounded"/></TableCell>
                                <TableCell><Skeleton animation="wave" variant="rounded"/></TableCell>
                                <TableCell><Skeleton animation="wave" variant="rounded"/></TableCell>
                            </TableRow>
                        ))
                    ) : isEmpty ? (
                        <TableRow>
                            <TableCell colSpan={5} sx={{border: 0, height: 200}}>
                                <Box
                                    sx={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        height: '100%',
                                    }}
                                >
                                    <Typography variant="h5" color="text.secondary">
                                        No container stats found
                                    </Typography>
                                </Box>
                            </TableCell>
                        </TableRow>
                    ) : (
                        containers.map((container) => (
                            <Fade in={true} timeout={400} key={container.id}>
                                <TableRow sx={{'&:last-child td, &:last-child th': {border: 0}}}>
                                    <TableCell component="th" scope="row" sx={{minWidth: 140}}>
                                        <Box sx={{display: 'flex', alignItems: 'center', gap: 0.5}}>
                                            <Typography variant="body2" sx={{
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                whiteSpace: 'nowrap',
                                                maxWidth: '120px'
                                            }}>
                                                {container.name}
                                            </Typography>
                                            <Tooltip
                                                title={copiedId === container.id ? "Copied!" : "Copy container ID"}
                                                placement="top">
                                                <IconButton
                                                    onClick={(e) => handleCopy(e, container.id)}
                                                    size="small"
                                                    sx={{position: 'relative', flexShrink: 0}}
                                                >
                                                    <CheckIcon
                                                        fontSize="inherit"
                                                        sx={{
                                                            position: 'absolute',
                                                            opacity: copiedId === container.id ? 1 : 0,
                                                            transition: 'opacity 0.2s',
                                                            color: 'success.main'
                                                        }}
                                                    />
                                                    <ContentCopy
                                                        fontSize="inherit"
                                                        sx={{
                                                            opacity: copiedId === container.id ? 0 : 1,
                                                            transition: 'opacity 0.2s',
                                                        }}
                                                    />
                                                </IconButton>
                                            </Tooltip>
                                        </Box>
                                    </TableCell>
                                    <TableCell sx={{ minWidth: 80, maxWidth: 100, textAlign: 'center' }}>
                                        <CPUStat
                                            value={container.cpuUsage}
                                            size={48}
                                            thickness={1}
                                        />
                                    </TableCell>
                                    <TableCell sx={{ minWidth: 120, maxWidth: 160 }}>
                                        <UsageBar
                                            usage={(Number(container.memoryUsage))}
                                            limit={(Number(container.memoryLimit))}
                                        />
                                    </TableCell>
                                    <TableCell sx={{ minWidth: 180, maxWidth: 240 }}>
                                        <RWData
                                            download={Number(container.networkRx)}
                                            upload={Number(container.networkTx)}
                                        />
                                    </TableCell>
                                    <TableCell sx={{ minWidth: 180, maxWidth: 240 }}>
                                        <RWData
                                            download={Number(container.blockWrite)}
                                            upload={Number(container.blockRead)}
                                        />
                                    </TableCell>
                                </TableRow>
                            </Fade>
                        ))
                    )}
                </TableBody>
            </Table>
        </TableContainer>
    )
}

const RWData = ({upload, download}: { upload: number; download: number }) => {
    const rx = Number(upload);
    const tx = Number(download);

    // todo Calculate the ratio, handling the case where tx is 0 to avoid division errors
    // let ratioText = '0:1';
    // if (tx > 0) {
    //     const ratio = (rx / tx).toFixed(1);
    //     ratioText = `${ratio}:1`;
    // } else if (rx > 0) {
    //     // If there's download but no upload, the ratio is infinite
    //     ratioText = '∞';
    // }

    return (
        <Box sx={{display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'start', gap: 1}}>
            {/*<Typography*/}
            {/*    variant="body2"*/}
            {/*    sx={{color: 'primary.main', fontWeight: 'medium'}}*/}
            {/*>*/}
            {/*    {ratioText}*/}
            {/*</Typography>*/}

            {/* Download/Upload Column */}
            <Box sx={{display: 'flex', alignItems: 'center'}}>
                <Typography variant="body2" color="text.secondary">
                    {`${formatBytes(rx)} / ${formatBytes(tx)}`}
                </Typography>
            </Box>
        </Box>
    )
}

interface CPUStatProps {
    value: number,
    size: number,
    thickness: number,
}

function CPUStat(props: CPUStatProps) {
    const {value, size = 56, thickness = 4} = props
    const clampedValue = Math.min(value, 100)
    const theme = useTheme()
    const progressColor = getUsageColor(value)

    return (
        <Box sx={{position: 'relative', display: 'inline-flex'}}>
            <CircularProgress
                variant="determinate"
                sx={{
                    color: theme.palette.grey[800],
                }}
                size={size}
                thickness={thickness}
                value={100}
            />
            <CircularProgress
                variant="determinate"
                value={clampedValue}
                size={size}
                thickness={thickness}
                sx={{
                    color: progressColor,
                    position: 'absolute',
                    left: 0,
                }}
            />

            <Box
                sx={{
                    top: 0,
                    left: 0,
                    bottom: 0,
                    right: 0,
                    position: 'absolute',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                }}
            >
                <Typography
                    variant="caption"
                    component="div"
                    sx={{fontWeight: 'bold', color: progressColor}}
                >
                    {`${value.toFixed(2)}`}
                </Typography>
            </Box>
        </Box>
    )
}

interface UsageBarProps {
    usage: number   // Formatted usage string, e.g., "2.92 GB"
    limit: number   // Formatted limit string, e.g., "15.5 GB"
    barHeight?: number  // Optional: makes the bar height configurable
}

export function UsageBar(
    {
        usage,
        limit,
        barHeight = 16
    }: UsageBarProps) {

    const theme = useTheme()
    const trackColor = theme.palette.grey[700]

    const memUsagePercent = limit > 0 ?
        (usage / limit) * 100 : 0

    const color = getUsageColor(memUsagePercent)
    const roundedValue = memUsagePercent.toFixed(0)

    const formattedUsage = formatBytes(usage)
    const formattedLimit = formatBytes(limit)

    return (
        <Tooltip title={`Memory Usage: ${memUsagePercent.toFixed(1)}%`} placement="top">
            <Box sx={{display: 'flex', flexDirection: 'column', minWidth: 150}}>
                <Box sx={{
                    position: 'relative',
                    width: '100%',
                    height: barHeight,
                    bgcolor: trackColor,
                    borderRadius: 1,
                    display: 'flex',
                    alignItems: 'center',
                }}>

                    <Box sx={{
                        width: `${memUsagePercent}%`,
                        height: '100%',
                        bgcolor: color,
                        borderRadius: 1,
                        transition: 'width 0.3s ease-in-out',
                    }}/>

                    <Typography
                        variant="caption"
                        sx={{
                            position: 'absolute',
                            width: '100%',
                            textAlign: 'center',
                            color: 'white',
                            fontWeight: 'bold',
                            textShadow: '1px 1px 2px rgba(0,0,0,0.5)', // Keeps text readable
                        }}
                    >
                        {`${roundedValue}%`}
                    </Typography>
                </Box>

                <Box sx={{display: 'flex', justifyContent: 'flex-end', pt: 0.5}}>
                    <Typography variant="caption" color="text.secondary">
                        {`${formattedUsage} / ${formattedLimit}`}
                    </Typography>
                </Box>
            </Box>
        </Tooltip>
    )
}
