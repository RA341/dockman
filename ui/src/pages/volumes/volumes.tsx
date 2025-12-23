import {useMemo, useState} from 'react';
import {Box, Button, Card, CircularProgress, Fade, Tooltip, Typography} from '@mui/material';
import {CleaningServices, Delete, DryCleaning, Refresh} from '@mui/icons-material';
import {VolumeTable} from './volumes-table.tsx';
import scrollbarStyles from "../../components/scrollbar-style.tsx";
import VolumesLoading from "./volumes-loading.tsx";
import VolumesEmpty from "./volumes-empty.tsx";
import useSearch from "../../hooks/search.ts";
import ActionButtons from "../../components/action-buttons.tsx";
import SearchBar from "../../components/search-bar.tsx";
import {useDockerVolumes} from "./docker-volumes.ts";

const VolumesPage = () => {
    const {loadVolumes, volumes, loading, deleteAnonynomous, deleteSelected, deleteUnunsed} = useDockerVolumes();
    const [selectedVolumes, setSelectedVolumes] = useState<string[]>([]);

    const {search, setSearch, searchInputRef} = useSearch();

    const filteredVolumes = useMemo(() => {
        if (search) {
            return volumes.filter(vol =>
                vol.name.toLowerCase().includes(search) ||
                vol.containerID.toLowerCase().includes(search) ||
                vol.labels.toLowerCase().includes(search) ||
                vol.mountPoint.toLowerCase().includes(search)
            )
        }
        return volumes;
    }, [search, volumes]);

    const actions = [
        {
            action: 'deleteSelected',
            buttonText: `Delete ${selectedVolumes.length === 0 ? "" : `${selectedVolumes.length}`} volumes`,
            icon: <Delete/>,
            disabled: selectedVolumes.length === 0 || loading,
            handler: async () => {
                await deleteSelected(selectedVolumes)
                setSelectedVolumes([])
            },
            tooltip: 'Delete selected volumes',
        },
        {
            action: 'deleteUnused',
            buttonText: `Prune Unused`,
            icon: <DryCleaning/>,
            disabled: loading,
            handler: deleteUnunsed,
            tooltip: 'Delete unused images',
        },
        {
            action: 'deleteAnon',
            buttonText: `Prune Anonymous`,
            icon: <CleaningServices/>,
            disabled: loading,
            handler: deleteAnonynomous,
            tooltip: 'Delete anonymous images',
        },
    ]

    const isEmpty = volumes.length === 0;
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
                        Docker Volumes
                    </Typography>
                </Box>

                <Box sx={{display: 'flex', flexDirection: 'column', gap: 0.5}}>
                    <Typography variant="h6">
                        {volumes.length} volumes
                    </Typography>
                </Box>

                <SearchBar search={search} setSearch={setSearch} inputRef={searchInputRef}/>

                <Tooltip title={loading ? 'Refreshing...' : 'Refresh volumes'}>
                    <Button
                        variant="contained"
                        size="small"
                        onClick={loadVolumes}
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
                    <VolumesLoading/>
                ) : (
                    <Fade in={!loading} timeout={300}>
                        <Box sx={{
                            width: '100%',
                            height: '100%',
                            overflowY: 'auto',
                            display: 'flex',
                            flexDirection: 'column'
                        }}>
                            {isEmpty ?
                                <VolumesEmpty/> :
                                <VolumeTable
                                    volumes={filteredVolumes}
                                    selectedVolumes={selectedVolumes}
                                    onSelectionChange={setSelectedVolumes}
                                />
                            }
                        </Box>
                    </Fade>
                )}
            </Box>
        </Box>
    );
};

export default VolumesPage;
