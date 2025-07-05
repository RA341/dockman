import {Box, Fade,} from '@mui/material';
import {ContainerStatTable} from '../components/container-stat-table.tsx';
import {useDockerStats} from "../hooks/container-stats.ts";

export const DashboardPage = () => {
    const {containers, loading, handleSortChange, sortOrder, sortField} = useDockerStats()

    return (
        <Fade in={true}>
            <Box sx={{p: 1.5, flexGrow: 1, overflow: 'auto'}}>
                {containers.length !== 0 ?
                    <></> : // todo charts
                    // <ContainerStatChart containers={containers}/> :
                    <></>
                }
                <ContainerStatTable
                    loading={loading}
                    order={sortOrder}
                    activeSortField={sortField}
                    onFieldClick={handleSortChange}
                    containers={containers}
                />
            </Box>
        </Fade>
    );
};