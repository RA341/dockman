import {useMemo, useState} from 'react';
import {Box, Divider, Fade, Paper} from '@mui/material';
import {CleaningServices, Delete, DryCleaning, Storage as VolumeIcon} from '@mui/icons-material';
import PageHeader, {RefreshButton} from "../../components/page-header.tsx";
import {useHostStore} from "../compose/state/files.ts";
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
    const host = useHostStore(state => state.host);

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
            <PageHeader
                icon={<VolumeIcon/>}
                title="Volumes"
                count={volumes.length}
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
                    <RefreshButton onClick={loadVolumes} loading={loading}/>
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
