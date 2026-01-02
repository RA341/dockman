import {useMemo, useState} from 'react';
import {Box, Button, Card, CircularProgress, Fade, Tooltip, Typography} from '@mui/material';
import {Delete, DryCleaning, Refresh} from '@mui/icons-material';
import scrollbarStyles from "../../components/scrollbar-style.tsx";
import NetworksLoading from "./networks-loading.tsx";
import NetworksEmpty from "./networks-empty.tsx";
import {NetworkTable} from "./networks-table.tsx";
import useSearch from "../../hooks/search.ts";
import ActionButtons from "../../components/action-buttons.tsx";
import SearchBar from "../../components/search-bar.tsx";
import {useDockerNetwork} from "./docker-hook-networks.ts";

const NetworksPage = () => {
    const {loading, networks, loadNetworks, networkPrune, deleteSelected} = useDockerNetwork();

    const {search, setSearch, searchInputRef} = useSearch();

    const [selectedNetworks, setSelectedNetworks] = useState<string[]>([]);

    const filteredNetworks = useMemo(() => {
        if (search) {
            return networks.filter(vol =>
                vol.id.toLowerCase().includes(search) ||
                vol.name.toLowerCase().includes(search) ||
                vol.driver.toLowerCase().includes(search) ||
                vol.scope.toLowerCase().includes(search)
            )
        }
        return networks;
    }, [search, networks]);

    const actions = [
        {
            action: 'deleteNetworks',
            tooltip: 'Delete selected networks',
            buttonText: `Delete ${selectedNetworks.length === 0 ? "" : `${selectedNetworks.length}`} networks`,
            icon: <Delete/>,
            disabled: selectedNetworks.length === 0 || loading,
            handler: async () => {
                deleteSelected(selectedNetworks).finally(() => {
                    setSelectedNetworks([])
                })
            },
        },
        {
            action: 'deleteUnused',
            tooltip: 'Equivalent of `docker network prune`',
            buttonText: `Network Prune`,
            icon: <DryCleaning/>,
            disabled: loading,
            handler: networkPrune,
        },
    ]

    const isEmpty = networks.length === 0;
    return (
        <Box sx={{
            display: 'flex',
            flexDirection: 'column',
            height: '100vh',
            p: 3,
            overflow: 'hidden',
            ...scrollbarStyles
        }}>
            <Card
                sx={{
                    mb: 3,
                    p: 2,
                    display: 'flex',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: 3,
                    backgroundColor: 'background.paper',
                    boxShadow: 2,
                    borderRadius: 2,
                    flexShrink: 0,
                }}
            >
                {/* Title and Stats */}
                <Box sx={{display: 'flex', flexDirection: 'column', gap: 0.5}}>
                    <Typography variant="h6" sx={{fontWeight: 'bold'}}>
                        Docker Networks
                    </Typography>
                </Box>

                <Box sx={{display: 'flex', flexDirection: 'column', gap: 0.5}}>
                    <Typography variant="h6">
                        {networks.length} Networks
                    </Typography>
                </Box>

                <SearchBar search={search} setSearch={setSearch} inputRef={searchInputRef}/>

                <Tooltip title={loading ? 'Refreshing...' : 'Refresh Networks'}>
                    <Button
                        variant="contained"
                        size="small"
                        onClick={loadNetworks}
                        disabled={loading}
                        sx={{minWidth: 'auto', px: 1.5}}
                    >
                        {loading ? <CircularProgress size={16} color="inherit"/> : <Refresh/>}
                    </Button>
                </Tooltip>

                {/* Spacer */}
                <Box sx={{flexGrow: 0.95}}/>

                <ActionButtons actions={actions}/>
            </Card>

            {/* Table Container */}
            <Box sx={{
                flexGrow: 1,
                border: '3px ridge',
                borderColor: 'rgba(255, 255, 255, 0.23)',
                borderRadius: 3,
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                minHeight: 0
            }}>
                {loading ? (
                    <NetworksLoading/>
                ) : (
                    <Fade in={!loading} timeout={300}>
                        <Box sx={{
                            width: '100%',
                            height: '100%',
                            overflowY: 'auto',
                            display: 'flex',
                            flexDirection: 'column'
                        }}>
                            {isEmpty ? (
                                <NetworksEmpty/>
                            ) : (
                                <NetworkTable
                                    networks={filteredNetworks}
                                    selectedNetworks={selectedNetworks}
                                    onSelectionChange={setSelectedNetworks}
                                />
                            )}
                        </Box>
                    </Fade>
                )}
            </Box>
        </Box>
    );
};

export default NetworksPage;
