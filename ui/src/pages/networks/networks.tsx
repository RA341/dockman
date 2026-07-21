import {useMemo, useState} from 'react';
import {Box, Divider, Fade, Paper} from '@mui/material';
import {Delete, DryCleaning, Lan as NetworkIcon} from '@mui/icons-material';
import PageHeader, {RefreshButton} from "../../components/page-header.tsx";
import {useHostStore} from "../compose/state/files.ts";
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
    const host = useHostStore(state => state.host);

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
            <PageHeader
                icon={<NetworkIcon/>}
                title="Networks"
                count={networks.length}
                host={host}
            />

            <Paper
                variant="outlined"
                sx={{
                    px: 1.5,
                    py: 1,
                    mb: 1.5,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1.5,
                    borderRadius: 2,
                    flexShrink: 0,
                    boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
                }}
            >
                <Box sx={{flex: 1, maxWidth: 270}}>
                    <SearchBar search={search} setSearch={setSearch} inputRef={searchInputRef}/>
                </Box>

                <Divider orientation="vertical" flexItem sx={{mx: 0.5}}/>

                <Box sx={{display: 'flex', alignItems: 'center', gap: 1.5, flex: 1}}>
                    <ActionButtons actions={actions}/>
                    <RefreshButton onClick={loadNetworks} loading={loading}/>
                </Box>
            </Paper>

            {/* Table Container */}
            <Box sx={{
                flexGrow: 1,
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 2,
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
