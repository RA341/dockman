import {useCallback, useEffect, useState} from 'react';
import {
    Box,
    Breadcrumbs,
    Button,
    CircularProgress,
    Dialog,
    DialogContent,
    DialogTitle,
    Divider,
    IconButton,
    Link,
    List,
    ListItemButton,
    ListItemIcon,
    ListItemText,
    Stack,
    TextField,
    Typography
} from "@mui/material";
import {
    ArrowUpward as UpIcon,
    CheckCircleOutline as SelectIcon,
    ChevronRight,
    Close as CloseIcon,
    Folder as FolderIcon,
    Home as HomeIcon,
    InsertDriveFileOutlined as FileIcon
} from '@mui/icons-material';
import {amber} from '@mui/material/colors';
import {HostManagerService} from "../../../gen/host/v1/host_pb.ts";
import {callRPC, useClient} from "../../../lib/api.ts";
import scrollbarStyles from "../../../components/scrollbar-style.tsx";

interface BrowseItem {
    fullpath: string;
    isDir: boolean;
}

interface FolderPickerProps {
    open: boolean;
    onClose: () => void;
    onSelect: (path: string) => void;
    hostname: string;
    initialPath?: string;
}

function FolderPickerDialog({open, onClose, onSelect, hostname, initialPath = "/"}: FolderPickerProps) {
    const hostClient = useClient(HostManagerService);

    const [curDir, setCurDir] = useState(initialPath);
    const [entries, setEntries] = useState<BrowseItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState("");

    const fetchFiles = useCallback(async (dir: string) => {
        setLoading(true);
        setErr("");
        // Ensure path starts with / and clean up double slashes
        const cleanPath = dir.startsWith('/') ? dir : '/' + dir;

        const {val, err} = await callRPC(() => hostClient.browseFiles({host: hostname, dir: cleanPath}));

        if (err) {
            setErr(err);
        } else {
            setEntries(val?.files ?? []);
            setCurDir(cleanPath);
        }
        setLoading(false);
    }, [hostname, hostClient]);

    useEffect(() => {
        if (open) fetchFiles(initialPath || "/").then();
    }, [open, hostname, initialPath, fetchFiles]);

    const handleNavigate = (item: BrowseItem) => {
        if (item.isDir) {
            fetchFiles(item.fullpath).then();
        }
    };

    const handleGoUp = () => {
        if (curDir === "/") return;
        const parts = curDir.split("/").filter(Boolean);
        parts.pop();
        fetchFiles("/" + parts.join("/")).then();
    };

    const jumpToPath = (index: number) => {
        const parts = curDir.split("/").filter(Boolean);
        const newPath = "/" + parts.slice(0, index + 1).join("/");
        fetchFiles(newPath).then();
    };

    // Extract display name from fullpath
    const getDisplayName = (path: string) => {
        if (path === "/") return "/";
        const parts = path.split("/");
        return parts[parts.length - 1] || parts[parts.length - 2];
    };

    return (
        <Dialog
            open={open}
            onClose={onClose}
            fullWidth
            maxWidth="sm"
            slotProps={{
                paper: {
                    sx: {
                        borderRadius: 3,
                        height: '650px',
                        display: 'flex',
                        flexDirection: 'column',
                        backgroundImage: 'none'
                    }
                }
            }}
        >
            <DialogTitle sx={{p: 2, borderBottom: '1px solid', borderColor: 'divider'}}>
                <Stack direction="row" alignItems="center" justifyContent="space-between">
                    <Stack direction="row" spacing={1.5} alignItems="center">
                        <Box sx={{
                            p: 1,
                            bgcolor: 'primary.lighter',
                            color: 'primary.main',
                            borderRadius: 1.5,
                            display: 'flex'
                        }}>
                            <FolderIcon fontSize="small"/>
                        </Box>
                        <Box>
                            <Typography variant="subtitle1" sx={{fontWeight: 800, lineHeight: 1.2}}>
                                Remote Browser
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                                Node: <b>{hostname}</b>
                            </Typography>
                        </Box>
                    </Stack>
                    <IconButton onClick={onClose} size="small">
                        <CloseIcon fontSize="small"/>
                    </IconButton>
                </Stack>
            </DialogTitle>

            {/* Navigation Bar */}
            <Box sx={{
                px: 2,
                py: 1,
                borderBottom: '1px solid',
                borderColor: 'divider',
                display: 'flex',
                alignItems: 'center',
                gap: 1
            }}>
                <IconButton size="small" onClick={handleGoUp} disabled={curDir === "/"}>
                    <UpIcon fontSize="small"/>
                </IconButton>
                <Breadcrumbs
                    separator={<ChevronRight sx={{fontSize: 14, color: 'text.disabled'}}/>}
                    sx={{flexGrow: 1, '& .MuiBreadcrumbs-li': {fontFamily: 'monospace', fontSize: '0.8rem'}}}
                >
                    <Link
                        component="button"
                        onClick={() => fetchFiles("/")}
                        underline="hover"
                        sx={{
                            display: 'flex',
                            alignItems: 'center',
                            color: curDir === "/" ? 'text.primary' : 'primary.main',
                            fontWeight: curDir === "/" ? 700 : 400
                        }}
                    >
                        <HomeIcon sx={{fontSize: 16}}/>
                    </Link>
                    {curDir.split("/").filter(Boolean).map((part, idx) => (
                        <Link
                            key={idx}
                            component="button"
                            underline="hover"
                            onClick={() => jumpToPath(idx)}
                            sx={{color: 'primary.main', fontWeight: 700}}
                        >
                            {part}
                        </Link>
                    ))}
                </Breadcrumbs>
            </Box>

            <DialogContent sx={{p: 0, flexGrow: 1, overflow: 'auto', ...scrollbarStyles}}>
                {loading ? (
                    <Stack alignItems="center" justifyContent="center" sx={{height: '100%'}}>
                        <CircularProgress size={32} thickness={5}/>
                    </Stack>
                ) : err ? (
                    <Box sx={{p: 4, textAlign: 'center'}}>
                        <Typography color="error" variant="body2" sx={{mb: 2, fontWeight: 600}}>{err}</Typography>
                        <Button variant="outlined" size="small" onClick={() => fetchFiles(curDir)}>Retry
                            Connection</Button>
                    </Box>
                ) : (
                    <List disablePadding>
                        {entries.length === 0 ? (
                            <Box sx={{py: 10, textAlign: 'center'}}>
                                <Typography variant="body2" color="text.disabled" sx={{fontStyle: 'italic'}}>
                                    This directory is empty
                                </Typography>
                            </Box>
                        ) : entries.map((item, idx) => (
                            <ListItemButton
                                key={idx}
                                onClick={() => handleNavigate(item)}
                                disabled={!item.isDir}
                                sx={{
                                    borderBottom: '1px solid',
                                    borderColor: 'divider',
                                    py: 1.5,
                                    '&.Mui-disabled': {opacity: 0.6}
                                }}
                            >
                                <ListItemIcon sx={{minWidth: 36}}>
                                    {item.isDir ? (
                                        <FolderIcon sx={{color: amber[600], fontSize: 22}}/>
                                    ) : (
                                        <FileIcon sx={{color: 'text.disabled', fontSize: 20}}/>
                                    )}
                                </ListItemIcon>
                                <ListItemText
                                    primary={getDisplayName(item.fullpath)}
                                    slotProps={{
                                        primary: {
                                            variant: 'body2',
                                            sx: {fontFamily: 'monospace', fontWeight: item.isDir ? 600 : 400}
                                        }
                                    }}
                                />
                                {item.isDir && <ChevronRight sx={{color: 'text.disabled', fontSize: 16}}/>}
                            </ListItemButton>
                        ))}
                    </List>
                )}
            </DialogContent>

            <Divider/>

            <Box sx={{p: 2}}>
                <Stack spacing={1.5}>
                    <Typography variant="overline" sx={{fontWeight: 800, color: 'text.secondary', lineHeight: 1}}>Selected
                        Path</Typography>
                    <Stack direction="row" spacing={1} alignItems="center">
                        <TextField
                            fullWidth
                            size="small"
                            value={curDir}
                            sx={{
                                bgcolor: 'background.paper',
                                '& input': {fontFamily: 'monospace', fontSize: '0.8rem', fontWeight: 600}
                            }}
                        />
                        <Button
                            variant="contained"
                            startIcon={<SelectIcon/>}
                            onClick={() => onSelect(curDir)}
                            disabled={loading || !!err}
                            sx={{borderRadius: 2, fontWeight: 700, px: 3, whiteSpace: 'nowrap', boxShadow: 'none'}}
                        >
                            Select Folder
                        </Button>
                    </Stack>
                </Stack>
            </Box>
        </Dialog>
    )
        ;
}

export default FolderPickerDialog;