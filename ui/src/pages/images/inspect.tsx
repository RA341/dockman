import {useParams} from "react-router-dom";
import {useCallback, useEffect, useState} from "react";
import {callRPC, useHostClient} from "../../lib/api.ts";
import {DockerService, type ImageInspect} from "../../gen/docker/v1/docker_pb.ts";
import {
    Alert,
    Box,
    Button,
    Chip,
    CircularProgress,
    Divider,
    IconButton,
    Paper,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Tooltip,
    Typography
} from '@mui/material';
import scrollbarStyles from "../../components/scrollbar-style.tsx";
import RefreshIcon from '@mui/icons-material/Refresh';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import ImageSearchIcon from '@mui/icons-material/ImageSearch';
import StorageIcon from '@mui/icons-material/Storage';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import MemoryIcon from '@mui/icons-material/Memory';
import {ArrowBack, ContentCopy} from "@mui/icons-material";


const ImageInspectPage = () => {
    const dockerService = useHostClient(DockerService)
    const {id} = useParams()

    const [inspect, setInspect] = useState<ImageInspect | null>(null)
    const [err, setErr] = useState("")
    const [loading, setLoading] = useState(false)

    const fetchData = useCallback(async () => {
        setLoading(true)
        setErr("")

        const {val, err} = await callRPC(() => dockerService.imageInspect({imageId: id}))
        if (err) {
            setErr(err)
        } else {
            setInspect(val?.inspect ?? null)
        }

        setLoading(false)
    }, [dockerService, id]);

    useEffect(() => {
        fetchData().then()
    }, [fetchData]);

    const handleCopy = (text: string) => {
        navigator.clipboard.writeText(text).then();
    };

    return (
        <Paper
            elevation={0}
            sx={{
                display: 'flex',
                flexDirection: 'column',
                height: '100%',
                width: '100%',
                borderRadius: 0,
                overflow: 'hidden',
                ...scrollbarStyles
            }}
        >

            <Box sx={{
                p: 2,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderBottom: 1,
                borderColor: 'divider',
                bgcolor: 'background.default'
            }}>
                <Box sx={{display: 'flex', alignItems: 'center', gap: 2}}>
                    <IconButton
                        onClick={() => {
                            history.back();
                        }}
                        title="Back to Images"
                    >
                        <ArrowBack/>
                    </IconButton>
                    <ImageSearchIcon color="primary"/>
                    <Typography variant="h6" component="h2">
                        Inspect Image
                    </Typography>
                </Box>
                <IconButton
                    onClick={fetchData}
                    disabled={loading}
                    title="Refresh Data"
                >
                    <RefreshIcon/>
                </IconButton>
            </Box>

            <Box sx={{
                p: 3,
                flexGrow: 1,
                overflow: 'auto',
                position: 'relative'
            }}>


                {loading && (
                    <Box sx={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        height: '100%',
                        gap: 2
                    }}>
                        <CircularProgress size={40} thickness={4}/>
                        <Typography variant="h6" color="text.secondary">
                            Loading...
                        </Typography>
                    </Box>
                )}


                {!loading && err && (
                    <Box sx={{display: 'flex', justifyContent: 'center', pt: 4}}>
                        <Alert
                            severity="error"
                            variant="outlined"
                            sx={{fontSize: '1rem'}}
                            action={
                                <Button color="inherit" size="large" onClick={fetchData}>
                                    Retry
                                </Button>
                            }
                        >
                            Error: {err}
                        </Alert>
                    </Box>
                )}


                {!loading && !err && !inspect && (
                    <Box sx={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        height: '100%',
                        opacity: 0.5
                    }}>
                        <ErrorOutlineIcon sx={{fontSize: 60, mb: 2}}/>
                        <Typography variant="h5">No info found</Typography>
                    </Box>
                )}

                {!loading && !err && inspect && (
                    <Stack spacing={3}>
                        <Paper variant="outlined" sx={{p: 3}}>
                            <Typography variant="h6" gutterBottom sx={{display: 'flex', alignItems: 'center', gap: 1}}>
                                <ImageSearchIcon color="primary"/>
                                Image Details
                            </Typography>
                            <Divider sx={{my: 2}}/>

                            <Stack spacing={2}>
                                <Box>
                                    <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                                        Name
                                    </Typography>
                                    <Box sx={{display: 'flex', alignItems: 'center', gap: 1}}>
                                        <Typography variant="body1" sx={{fontFamily: 'monospace'}}>
                                            {inspect.name || 'N/A'}
                                        </Typography>
                                        {inspect.name && (
                                            <IconButton
                                                size="small"
                                                onClick={() => handleCopy(inspect.name)}
                                                title="Copy name"
                                            >
                                                <ContentCopy fontSize="small"/>
                                            </IconButton>
                                        )}
                                    </Box>
                                </Box>

                                <Box>
                                    <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                                        ID
                                    </Typography>
                                    <Box sx={{display: 'flex', alignItems: 'center', gap: 1}}>
                                        <Typography variant="body1" sx={{fontFamily: 'monospace'}}>
                                            {inspect.id || 'N/A'}
                                        </Typography>
                                        {inspect.id && (
                                            <IconButton
                                                size="small"
                                                onClick={() => handleCopy(inspect.id)}
                                                title="Copy ID"
                                            >
                                                <ContentCopy fontSize="small"/>
                                            </IconButton>
                                        )}
                                    </Box>
                                </Box>

                                <Box sx={{
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                                    gap: 2,
                                    pt: 1
                                }}>
                                    <Box>
                                        <Typography variant="subtitle2" color="text.secondary" gutterBottom
                                                    sx={{display: 'flex', alignItems: 'center', gap: 0.5}}>
                                            <StorageIcon fontSize="small"/>
                                            Size
                                        </Typography>
                                        <Chip label={inspect.size || 'N/A'} color="primary" variant="outlined"/>
                                    </Box>

                                    <Box>
                                        <Typography variant="subtitle2" color="text.secondary" gutterBottom
                                                    sx={{display: 'flex', alignItems: 'center', gap: 0.5}}>
                                            <MemoryIcon fontSize="small"/>
                                            Architecture
                                        </Typography>
                                        <Chip label={inspect.arch || 'N/A'} color="secondary" variant="outlined"/>
                                    </Box>

                                    <Box>
                                        <Typography variant="subtitle2" color="text.secondary" gutterBottom
                                                    sx={{display: 'flex', alignItems: 'center', gap: 0.5}}>
                                            <AccessTimeIcon fontSize="small"/>
                                            Created
                                        </Typography>
                                        <Typography variant="body2">
                                            {inspect.createdIso ? new Date(inspect.createdIso).toLocaleString() : 'N/A'}
                                        </Typography>
                                    </Box>
                                </Box>
                            </Stack>
                        </Paper>

                        <Paper variant="outlined" sx={{p: 3}}>
                            <Typography variant="h6" gutterBottom sx={{display: 'flex', alignItems: 'center', gap: 1}}>
                                <StorageIcon color="primary"/>
                                Layers ({inspect.layers?.length || 0})
                            </Typography>
                            <Divider sx={{my: 2}}/>

                            {inspect.layers && inspect.layers.length > 0 ? (
                                <TableContainer sx={{width: 'fit-content', maxWidth: '100%'}}>
                                    <Table size="small" sx={{width: 'auto'}}>
                                        <TableHead>
                                            <TableRow>
                                                <TableCell sx={{fontWeight: 'bold', whiteSpace: 'nowrap'}}>Layer
                                                    Order
                                                </TableCell>
                                                <TableCell
                                                    sx={{fontWeight: 'bold', whiteSpace: 'nowrap'}}
                                                    align="right">
                                                    Size
                                                </TableCell>
                                                <TableCell sx={{fontWeight: 'bold', whiteSpace: 'nowrap'}}>
                                                    Command
                                                </TableCell>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {inspect.layers.reverse().map((layer, idx) => (
                                                <TableRow
                                                    key={layer.LayerId || idx}
                                                    hover
                                                    sx={{'&:last-child td, &:last-child th': {border: 0}}}
                                                >
                                                    <TableCell sx={{
                                                        fontFamily: 'monospace',
                                                        fontSize: '0.85rem',
                                                        whiteSpace: 'nowrap'
                                                    }}>
                                                        {idx}
                                                    </TableCell>
                                                    <TableCell align="right" sx={{whiteSpace: 'nowrap'}}>
                                                        <Chip
                                                            label={layer.size || '0'}
                                                            size="small"
                                                            variant="outlined"
                                                        />
                                                    </TableCell>
                                                    <TableCell sx={{fontFamily: 'monospace', fontSize: '0.85rem'}}>
                                                        <DockerCommandCell layer={layer}/>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </TableContainer>
                            ) : (
                                <Box sx={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    py: 4,
                                    opacity: 0.5
                                }}>
                                    <Typography variant="body1">No layers found</Typography>
                                </Box>
                            )}
                        </Paper>
                    </Stack>
                )}
            </Box>
        </Paper>
    );
};

// Helper to clean up the messy Docker history command string
const formatDockerCmd = (cmd: string) => {
    if (!cmd) return {instruction: 'N/A', args: ''};

    // Remove the common prefix added by Docker for metadata-only layers
    const cleanCmd = cmd.replace(/\/bin\/sh -c #\(nop\)\s+/g, '');

    // Split the instruction (e.g., RUN, CMD) from the rest
    const parts = cleanCmd.split(/\s+/);
    const instruction = parts[0]?.toUpperCase();
    const args = parts.slice(1).join(' ');

    return {instruction, args};
};

export function DockerCommandCell({layer}: { layer: { cmd: string } }) {
    const {instruction, args} = formatDockerCmd(layer.cmd);

    return (
        <TableCell sx={{py: 1, verticalAlign: 'top'}}>
            <Tooltip title={layer.cmd} placement="top" arrow>
                <Box sx={{display: 'flex', flexDirection: 'column', gap: 0.5}}>
                    <Typography
                        variant="caption"
                        sx={{
                            fontWeight: 'bold',
                            color: 'primary.main',
                            fontFamily: 'monospace',
                            fontSize: '0.7rem',
                            letterSpacing: 1
                        }}
                    >
                        {instruction}
                    </Typography>

                    <Typography
                        variant="body2"
                        sx={{
                            fontFamily: 'monospace',
                            fontSize: '0.85rem',
                            maxWidth: '100vw',
                            color: 'text.secondary',
                            lineHeight: 1.4,
                            // Wrap long lines but keep them readable
                            wordBreak: 'break-all',
                            display: '-webkit-box',
                            // WebkitLineClamp: 3, // Show up to 3 lines before dots
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                        }}
                    >
                        {args}
                    </Typography>
                </Box>
            </Tooltip>
        </TableCell>
    );
}

export default ImageInspectPage;
