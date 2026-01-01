import {useNavigate, useParams} from "react-router-dom";
import {useCallback, useEffect, useState} from "react";
import {callRPC, useHostClient} from "../../lib/api.ts";
import {DockerService, type ImageInspect} from "../../gen/docker/v1/docker_pb.ts";
import {
    Alert,
    Box,
    Breadcrumbs,
    Chip,
    CircularProgress,
    Divider,
    IconButton,
    Link as MuiLink,
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
import ImageOutlinedIcon from '@mui/icons-material/ImageOutlined';
import {ArrowBack, HistoryOutlined} from "@mui/icons-material";

const ImageInspectPage = () => {
    const dockerService = useHostClient(DockerService);
    const {id} = useParams();
    const navigate = useNavigate();

    const [inspect, setInspect] = useState<ImageInspect | null>(null);
    const [err, setErr] = useState("");
    const [loading, setLoading] = useState(false);

    const fetchData = useCallback(async () => {
        setLoading(true);
        setErr("");
        const {val, err} = await callRPC(() => dockerService.imageInspect({imageId: id}));
        if (err) setErr(err);
        else setInspect(val?.inspect ?? null);
        setLoading(false);
    }, [dockerService, id]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    return (
        <Box sx={{
            display: 'flex',
            flexDirection: 'column',
            height: '100vh',
            overflow: 'hidden'
        }}>
            <Paper
                elevation={0}
                square
                sx={{
                    borderBottom: '1px solid',
                    borderColor: 'divider',
                    bgcolor: 'background.paper',
                    py: 2, px: 3, flexShrink: 0
                }}
            >
                <Stack direction="row" alignItems="center">
                    <Box>
                        <Breadcrumbs aria-label="breadcrumb" sx={{mb: 0.5}}>
                            <MuiLink underline="hover" color="inherit" sx={{cursor: 'pointer', fontSize: '0.75rem'}}
                                     onClick={() => navigate(-1)}>
                                Images
                            </MuiLink>
                            <Typography color="text.primary"
                                        sx={{fontSize: '0.75rem', fontWeight: 700}}>Inspect</Typography>
                        </Breadcrumbs>

                        <Stack direction="row" spacing={2} alignItems="center">
                            <IconButton onClick={() => navigate(-1)} size="small"
                                        sx={{border: '1px solid', borderColor: 'divider'}}>
                                <ArrowBack fontSize="small"/>
                            </IconButton>
                            <Box sx={{
                                p: 1,
                                bgcolor: 'primary.lighter',
                                borderRadius: 1.5,
                                color: 'primary.main',
                                display: 'flex'
                            }}>
                                <ImageOutlinedIcon fontSize="small"/>
                            </Box>
                            <Box>
                                <Typography variant="h6" sx={{fontWeight: 800, lineHeight: 1.2}}>
                                    {inspect?.name?.split(':')[0] || 'Image Manifest'}
                                </Typography>
                                <Typography variant="caption" color="text.secondary" sx={{fontFamily: 'monospace'}}>
                                    {id?.substring(0, 12)}
                                </Typography>
                            </Box>
                        </Stack>
                    </Box>

                    <Tooltip title="Refresh Manifest">
                        <IconButton onClick={fetchData} disabled={loading}
                                    sx={{border: '1px solid', borderColor: 'divider'}}>
                            <RefreshIcon fontSize="small"/>
                        </IconButton>
                    </Tooltip>
                </Stack>
            </Paper>

            <Box sx={{p: 3, flexGrow: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 3}}>
                {loading ? (
                    <Box sx={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        py: 10,
                        gap: 2
                    }}>
                        <CircularProgress size={32} thickness={5}/>
                        <Typography variant="body2" color="text.secondary" sx={{fontWeight: 600}}>Analyzing image
                            layers...</Typography>
                    </Box>
                ) : err ? (
                    <Alert severity="error" variant="outlined" sx={{borderRadius: 2}}>{err}</Alert>
                ) : inspect && (
                    <>
                        {/* Summary Info Cards */}
                        {/* Unified Image Summary Card */}
                        <Paper
                            variant="outlined"
                            sx={{
                                p: 2.5,
                                borderRadius: 3,
                                bgcolor: 'background.paper',
                                boxShadow: '0 2px 8px rgba(0,0,0,0.02)'
                            }}
                        >
                            <Stack spacing={2.5}>
                                {/* Top Section: Identification */}
                                <Box>
                                    <Typography variant="overline" sx={{
                                        color: 'text.secondary',
                                        fontWeight: 800,
                                        mb: 1.5,
                                        display: 'block'
                                    }}>
                                        Image Identity
                                    </Typography>
                                    <Stack spacing={2}>
                                        <DetailRow label="Full Repository" value={inspect.name} mono/>
                                        <DetailRow label="Image ID" value={inspect.id} mono/>
                                    </Stack>
                                </Box>

                                <Divider sx={{borderStyle: 'dashed'}}/>

                                {/* Bottom Section: Technical Specs */}
                                <Box>
                                    <Typography variant="overline" sx={{
                                        color: 'text.secondary',
                                        fontWeight: 800,
                                        mb: 1.5,
                                        display: 'block'
                                    }}>
                                        Specifications
                                    </Typography>
                                    <Stack direction="row" spacing={6} alignItems="center">
                                        <Box>
                                            <Typography variant="caption" color="text.disabled" sx={{
                                                fontWeight: 700,
                                                display: 'block',
                                                mb: 0.5
                                            }}>SIZE</Typography>
                                            <Typography variant="body2" sx={{
                                                fontWeight: 800,
                                                fontFamily: 'monospace',
                                                color: 'primary.main'
                                            }}>
                                                {inspect.size}
                                            </Typography>
                                        </Box>

                                        <Box>
                                            <Typography variant="caption" color="text.disabled" sx={{
                                                fontWeight: 700,
                                                display: 'block',
                                                mb: 0.5
                                            }}>ARCHITECTURE</Typography>
                                            <Chip
                                                label={inspect.arch}
                                                size="small"
                                                variant="outlined"
                                                sx={{height: 20, fontSize: '0.65rem', fontWeight: 700, borderRadius: 1}}
                                            />
                                        </Box>

                                        <Box>
                                            <Typography variant="caption" color="text.disabled"
                                                        sx={{fontWeight: 700, display: 'block', mb: 0.5}}>CREATED
                                                ON</Typography>
                                            <Typography variant="body2" sx={{fontWeight: 600}}>
                                                {inspect.createdIso ? new Date(inspect.createdIso).toLocaleDateString(undefined, {dateStyle: 'medium'}) : 'N/A'}
                                            </Typography>
                                        </Box>
                                    </Stack>
                                </Box>
                            </Stack>
                        </Paper>

                        {/* Layers Table */}
                        <Paper variant="outlined"
                               sx={{
                                   // width: 800,
                                   borderRadius: 3,
                                   overflow: 'hidden',
                                   display: 'flex',
                                   flexDirection: 'column'
                               }}>
                            <Box sx={{
                                p: 2,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                bgcolor: 'background.paper'
                            }}>
                                <Stack direction="row" spacing={1} alignItems="center">
                                    <HistoryOutlined sx={{fontSize: 18, color: 'text.disabled'}}/>
                                    <Typography variant="subtitle2" sx={{fontWeight: 800}}>History Layers</Typography>
                                    <Chip
                                        label={`${inspect.layers?.length || 0} layers`}
                                        size="small"
                                        color="info"
                                        sx={{height: 20, fontSize: '0.65rem', fontWeight: 700}}
                                    />
                                </Stack>
                            </Box>

                            <TableContainer sx={{...scrollbarStyles}}>
                                <Table size="small" stickyHeader
                                       sx={{tableLayout: 'fixed'}}> {/* Added fixed layout for strict width control */}
                                    <TableHead>
                                        <TableRow>
                                            {/* Fixed small widths for metadata */}
                                            <TableCell sx={{...headerStyles, width: 50}}>#</TableCell>
                                            <TableCell sx={{...headerStyles, width: 120}}>Layer Size</TableCell>
                                            <TableCell sx={{...headerStyles, width: 150}}>Cumulative</TableCell>
                                            {/* Max width on the header */}
                                            <TableCell sx={{...headerStyles, maxWidth: '500px'}}>Cmd</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {inspect.layers?.map((layer, idx) => (
                                            <TableRow key={idx} hover>
                                                <TableCell sx={{
                                                    color: 'text.disabled',
                                                    fontFamily: 'monospace',
                                                    fontSize: '0.7rem'
                                                }}>
                                                    {idx}
                                                </TableCell>
                                                <TableCell>
                                                    <LayerSizeChip size={layer.size}/>
                                                </TableCell>
                                                <TableCell sx={{
                                                    color: 'text.secondary',
                                                    fontFamily: 'monospace',
                                                    fontSize: '0.75rem'
                                                }}>
                                                    {layer.totalSizeAtLayer || '--'}
                                                </TableCell>
                                                {/* The Cell component now handles its own internal constraints */}
                                                <DockerCommandCell command={layer.cmd || ''}/>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </TableContainer>
                        </Paper>
                    </>
                )}
            </Box>
        </Box>
    );
};

const headerStyles = {
    fontWeight: 700,
    fontSize: '0.65rem',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    py: 1.5
};

const DetailRow = ({label, value, mono}: { label: string, value: string, mono?: boolean }) => (
    <Box>
        <Typography variant="caption" sx={{
            color: 'text.disabled',
            fontWeight: 700,
            fontSize: '0.6rem',
            textTransform: 'uppercase'
        }}>{label}</Typography>
        <Stack direction="row" spacing={1} alignItems="center">
            <Typography variant="body2" sx={{
                fontWeight: 600,
                fontFamily: mono ? 'monospace' : 'inherit',
                fontSize: mono ? '0.75rem' : '0.85rem',
                wordBreak: 'break-all'
            }}>
                {value || 'N/A'}
            </Typography>
        </Stack>
    </Box>
);

const LayerSizeChip = ({size}: { size: string }) => {
    const isZero = !size || size.startsWith("0");
    return (
        <Chip
            label={size || '0 B'}
            size="small"
            variant="outlined"
            color={isZero ? "default" : "success"}
            sx={{
                height: 18,
                fontSize: '0.65rem',
                fontWeight: 700,
                opacity: isZero ? 0.5 : 1,
                bgcolor: isZero ? 'transparent' : 'success.lighter'
            }}
        />
    );
};

const DockerCommandCell = ({ command }: { command: string }) => {
    const cleanCmd = command.replace(/\/bin\/sh -c #\(nop\)\s+/g, '');
    const parts = cleanCmd.split(/\s+/);
    const instruction = parts[0]?.toUpperCase();
    const args = parts.slice(1).join(' ');

    return (
        <TableCell
            sx={{
                maxWidth: '500px', // Set your desired max width here
                overflow: 'hidden',
                py: 1
            }}
        >
            <Stack spacing={0}>
                <Typography
                    variant="caption"
                    sx={{
                        color: 'primary.main',
                        fontWeight: 800,
                        fontFamily: 'monospace',
                        fontSize: '0.7rem',
                        lineHeight: 1
                    }}
                >
                    {instruction}
                </Typography>

                <Tooltip title={args} placement="top" arrow>
                    <Typography
                        variant="caption"
                        sx={{
                            fontFamily: 'monospace',
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
                </Tooltip>
            </Stack>
        </TableCell>
    );
};

export default ImageInspectPage;
