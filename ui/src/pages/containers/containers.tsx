import {
    Box,
    Chip,
    CircularProgress,
    Divider,
    Fade,
    IconButton,
    Paper,
    Stack,
    Tooltip,
    Typography,
} from '@mui/material';
import {Delete, DnsOutlined, PlayArrow, Refresh, RestartAlt, Stop,} from '@mui/icons-material';
import {ContainerTable} from '../compose/components/container-info-table';
import {useMemo, useState} from "react";
import {useDockerContainers} from "../../hooks/docker-containers.ts";
import {callRPC, useDockerClient} from "../../lib/api.ts";
import {useSnackbar} from "../../hooks/snackbar.ts";
import SearchBar from "../../components/search-bar.tsx";
import useSearch from "../../hooks/search.ts";
import ActionButtons from "../../components/action-buttons.tsx";
import scrollbarStyles from "../../components/scrollbar-style.tsx";
import {ContainersLoading} from "./containers-loading.tsx";
import {useNavigate} from "react-router-dom";
import {useHostStore} from "../compose/state/files.ts";

function ContainersPage() {
    const dockerService = useDockerClient();
    const {containers, loading, refreshContainers, fetchContainers} = useDockerContainers();
    const {showSuccess, showError} = useSnackbar();
    const {search, setSearch, searchInputRef} = useSearch();
    const [selectedContainers, setSelectedContainers] = useState<string[]>([]);

    const navigate = useNavigate();
    const host = useHostStore(state => state.host);

    const onInspect = (id: string) => navigate(`/${host}/containers/inspect/${id}`);
    const onExec = (id: string) => navigate(`/${host}/containers/inspect/${id}?tabId=exec`);
    const onLogs = (id: string) => navigate(`/${host}/containers/inspect/${id}?tabId=logs`);

    const actions = [
        {
            action: 'start',
            buttonText: "Start",
            icon: <PlayArrow/>,
            disabled: selectedContainers.length === 0,
            handler: () => handleContainerAction('start', 'containerStart', "started"),
            tooltip: "",
        },
        {
            action: 'stop',
            buttonText: "Stop",
            icon: <Stop/>,
            disabled: selectedContainers.length === 0,
            handler: () => handleContainerAction('stop', 'containerStop', "stopped"),
            tooltip: "",

        },
        {
            action: 'restart',
            buttonText: "Restart",
            icon: <RestartAlt/>,
            disabled: selectedContainers.length === 0,
            handler: () => handleContainerAction('restart', 'containerRestart', "restarted"),
            tooltip: "",
        },
        // {
        //     action: 'update',
        //     buttonText: "Update",
        //     icon: <Update/>,
        //     disabled: selectedContainers.length === 0,
        //     handler: () => handleContainerAction('update', 'containerUpdate', "updated"),
        //     tooltip: "",
        // },
        {
            action: 'remove',
            buttonText: "Remove",
            icon: <Delete/>,
            disabled: selectedContainers.length === 0,
            handler: () => handleContainerAction('remove', 'containerRemove', "removed"),
            tooltip: "",
        },
    ];

    async function handleContainerAction(name: string, rpcName: keyof typeof dockerService, message: string) {
        // @ts-ignore
        const {err} = await callRPC(() => dockerService[rpcName]({containerIds: selectedContainers}));
        if (err) showError(`Failed to ${name} Containers: ${err}`);
        else showSuccess(`Successfully ${message} containers`);

        setSelectedContainers([]);
        await fetchContainers();
    }

    const filteredContainers = useMemo(() => {
        const lowerSearch = search.toLowerCase();
        return containers?.list.filter(cont =>
            [cont.serviceName, cont.imageName, cont.stackName, cont.name].some(f => f.toLowerCase().includes(lowerSearch))
        ) ?? [];
    }, [containers, search]);

    return (
        <Box sx={{
            display: 'flex',
            flexDirection: 'column',
            height: '100vh',
            p: {xs: 1, md: 3},
            overflow: 'hidden',
            ...scrollbarStyles
        }}>
            {/* Header Section */}
            <Box sx={{mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end'}}>
                <Box>
                    <Stack direction="row" spacing={1} alignItems="center">
                        <DnsOutlined color="primary"/>
                        <Typography variant="h5" sx={{fontWeight: 800, letterSpacing: -0.5}}>
                            Containers
                        </Typography>
                        <Chip
                            label={containers?.list.length}
                            size="medium"
                            sx={{fontWeight: 700, color: 'primary.main'}}
                        />
                    </Stack>
                    <Typography variant="body2" color="text.secondary">
                        Manage and monitor containers on <code style={{fontWeight: 'bold'}}>{host}</code>
                    </Typography>
                </Box>

                <Stack direction="row" spacing={1}>
                    <Tooltip title="Refresh List">
                        <IconButton
                            onClick={refreshContainers}
                            disabled={loading}
                            sx={{border: '1px solid', borderColor: 'divider', bgcolor: 'background.paper'}}
                        >
                            {loading ? <CircularProgress size={20}/> : <Refresh fontSize="small"/>}
                        </IconButton>
                    </Tooltip>
                </Stack>
            </Box>

            {/* Toolbar Card */}
            <Paper
                variant="outlined"
                sx={{
                    p: 1.5,
                    mb: 2,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 2,
                    borderRadius: 2,
                    boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
                }}
            >
                <Box sx={{flex: 1, maxWidth: 270}}>
                    <SearchBar search={search} setSearch={setSearch} inputRef={searchInputRef}/>
                </Box>

                <Divider orientation="vertical" flexItem sx={{mx: 1}}/>

                <Box sx={{display: 'flex', alignItems: 'center', gap: 1, flex: 1}}>
                    <Box sx={{display: 'flex', alignItems: 'center', gap: 2, width: '100%'}}>
                        <ActionButtons actions={actions}/>
                        {selectedContainers.length > 0 && <Typography
                            variant="caption"
                            sx={{
                                fontWeight: 700,
                                color: 'primary.main',
                                whiteSpace: 'nowrap'
                            }}
                        >
                            {selectedContainers.length} SELECTED
                        </Typography>}
                    </Box>
                </Box>
            </Paper>

            {/* Main Table Area */}
            <Paper
                variant="outlined"
                sx={{
                    flexGrow: 1,
                    borderRadius: 2,
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                    bgcolor: 'background.paper'
                }}
            >
                {loading ? (
                    <ContainersLoading/>
                ) : (
                    <Fade in={!loading}>
                        <Box sx={{
                            height: '100%',
                            width: '100%',
                            overflow: 'hidden',
                            display: 'flex',
                            flexDirection: 'column'
                        }}>
                            <ContainerTable
                                containers={filteredContainers}
                                loading={loading}
                                onLogs={onLogs}
                                setSelectedServices={setSelectedContainers}
                                selectedServices={selectedContainers}
                                useContainerId={true}
                                onExec={onExec}
                                onInspect={onInspect}
                            />
                        </Box>
                    </Fade>
                )}
            </Paper>
        </Box>
    );
}

export default ContainersPage;
