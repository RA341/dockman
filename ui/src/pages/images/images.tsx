import {useMemo, useState} from 'react';
import {Box, Button, Card, CircularProgress, Fade, Link, Paper, Tooltip, Typography} from '@mui/material';
import {CleaningServices, Delete, Refresh, Sanitizer, Storage} from '@mui/icons-material';
import {ImageTable} from './images-table.tsx';
import {formatBytes} from "../../lib/editor.ts";
import scrollbarStyles from "../../components/scrollbar-style.tsx";
import useSearch from "../../hooks/search.ts";
import ActionButtons from "../../components/action-buttons.tsx";
import SearchBar from "../../components/search-bar.tsx";
import {useDockerImages} from "./docker-images.ts";

const ImagesPage = () => {
    const {
        images,
        loading,
        refreshImages,
        pruneUnused,
        totalImageSize,
        unusedContainerCount,
        untagged,
        deleteImages
    } = useDockerImages();

    const {search, setSearch, searchInputRef} = useSearch();
    const [selectedImages, setSelectedImages] = useState<string[]>([])

    const filteredImages = useMemo(() => {
        if (search) {
            return images.filter(image =>
                image.repoTags[0]
                    .toLowerCase()
                    .includes(search))
        }
        return images;
    }, [images, search]);

    const actions = [
        {
            action: 'deleteSelected',
            buttonText: `Delete ${selectedImages.length === 0 ? "" : `${selectedImages.length}`} images`,
            icon: <Delete/>,
            disabled: loading || selectedImages.length === 0,
            handler: async () => {
                await deleteImages(selectedImages)
                setSelectedImages([])
            },
            tooltip: 'Delete selected images',
        },
        {
            action: 'deleteUntagged',
            buttonText: `Prune Untagged (${untagged})`,
            icon: <Sanitizer/>,
            disabled: loading,
            handler: async () => {
                await pruneUnused()
            },
            tooltip: 'Delete Untagged images',
        },
        {
            action: 'deleteUnused',
            buttonText: `Prune Unused (${unusedContainerCount})`,
            tooltip: 'Delete all unused images',
            icon: <CleaningServices/>,
            disabled: loading,
            handler: async () => {
                await pruneUnused(true)
            },
        }
    ]

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
                        Docker Images
                    </Typography>
                </Box>

                <Box sx={{display: 'flex', flexDirection: 'column', gap: 0.5}}>
                    <Typography variant="h6">
                        {images.length} images • {formatBytes(totalImageSize) ?? '0B'}
                    </Typography>
                </Box>

                <SearchBar search={search} setSearch={setSearch} inputRef={searchInputRef}/>

                <Tooltip title={loading ? 'Refreshing...' : 'Refresh images'}>
                    <Button
                        variant="contained"
                        size="small"
                        onClick={refreshImages}
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
                    <ImagesLoading/>
                ) : (
                    <Fade in={!loading} timeout={300}>
                        <Box sx={{
                            width: '100%',
                            height: '100%',
                            overflowY: 'auto',
                            display: 'flex',
                            flexDirection: 'column'
                        }}>
                            {images.length === 0 ? (
                                <ImagesEmpty searchTerm={''}/>
                            ) : (
                                <ImageTable
                                    images={filteredImages}
                                    selectedImages={selectedImages}
                                    onSelectionChange={setSelectedImages}
                                />
                            )}
                        </Box>
                    </Fade>
                )}
            </Box>
        </Box>
    )
};

const ImagesLoading = () => {
    return (
        <Box sx={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            width: '100%',
            flex: 1
        }}>
            <CircularProgress sx={{mr: 2}}/>
            <Typography variant="body1" color="text.secondary">
                Loading images...
            </Typography>
        </Box>
    );
};


const ImagesEmpty = ({searchTerm}: { searchTerm: string }) => {
    return (
        <Paper sx={{
            p: 6,
            textAlign: 'center',
            height: '100%',
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center'
        }}>
            <Storage sx={{
                fontSize: 48,
                color: 'text.secondary',
                mb: 2,
                mx: 'auto'
            }}/>

            <Typography variant="h6" sx={{mb: 1}}>
                {searchTerm ? 'No images found' : 'No images available'}
            </Typography>

            <Typography variant="body2" color="text.secondary">
                {searchTerm ? (
                    'Try adjusting your search criteria.'
                ) : (
                    <>
                        Run some apps, treat yourself, {' '}
                        <Link
                            href="https://selfh.st/apps/"
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            https://selfh.st/apps/
                        </Link>
                    </>
                )}
            </Typography>
        </Paper>
    );
};

export default ImagesPage;