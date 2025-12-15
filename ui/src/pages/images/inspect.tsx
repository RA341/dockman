import {useNavigate, useParams} from "react-router-dom";
import {useCallback, useEffect, useState} from "react";
import {callRPC, useClient} from "../../lib/api.ts";
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
    Typography
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import ImageSearchIcon from '@mui/icons-material/ImageSearch';
import StorageIcon from '@mui/icons-material/Storage';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import MemoryIcon from '@mui/icons-material/Memory';
import {ArrowBack, ContentCopy} from "@mui/icons-material";


const ImageInspectPage = () => {
    const dockerService = useClient(DockerService)
    const {id} = useParams()
    const nav = useNavigate()

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
                overflow: 'hidden'
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
                            nav("/images")
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
                                                    ID</TableCell>
                                                <TableCell
                                                    sx={{fontWeight: 'bold', whiteSpace: 'nowrap'}}>Command</TableCell>
                                                <TableCell sx={{fontWeight: 'bold', whiteSpace: 'nowrap'}}
                                                           align="right">Size</TableCell>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {inspect.layers.map((layer, idx) => (
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
                                                        <Box sx={{display: 'flex', alignItems: 'center', gap: 1}}>
                                                            {layer.LayerId ? layer.LayerId.substring(0, 12) : 'N/A'}
                                                            {layer.LayerId && (
                                                                <IconButton
                                                                    size="small"
                                                                    onClick={() => handleCopy(layer.LayerId)}
                                                                    title="Copy Layer ID"
                                                                >
                                                                    <ContentCopy fontSize="small"/>
                                                                </IconButton>
                                                            )}
                                                        </Box>
                                                    </TableCell>
                                                    <TableCell sx={{fontFamily: 'monospace', fontSize: '0.85rem'}}>
                                                        <Typography
                                                            variant="body2"
                                                            sx={{whiteSpace: 'nowrap'}}
                                                            title={layer.cmd}
                                                        >
                                                            {layer.cmd || 'N/A'}
                                                        </Typography>
                                                    </TableCell>
                                                    <TableCell align="right" sx={{whiteSpace: 'nowrap'}}>
                                                        <Chip
                                                            label={layer.size || '0'}
                                                            size="small"
                                                            variant="outlined"
                                                        />
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

export default ImageInspectPage;
