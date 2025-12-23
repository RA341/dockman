import {Box} from '@mui/material';
import {useDockerStats} from "../../hooks/docker-containers-stats.ts";
import {ContainerStatTable} from './components/container-stat-table.tsx';
import AggregateStats from "./components/container-stat-chart.tsx";

interface StackStatsProps {
    selectedPage?: string;
}

export function TabStat({selectedPage = ""}: StackStatsProps) {
    const {containers, loading, handleSortChange, sortOrder, sortField} = useDockerStats(selectedPage)

    return (
        <Box sx={{
            p: 1,
            height: '100vh',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            boxSizing: 'border-box'
        }}>
            <Box sx={{flexShrink: 0}}>
                <AggregateStats
                    containers={containers}
                    loading={loading}
                />
            </Box>

            <Box sx={{flexGrow: 1, minHeight: 0}}>
                <ContainerStatTable
                    loading={loading}
                    containers={containers}
                    activeSortField={sortField}
                    order={sortOrder}
                    onFieldClick={handleSortChange}
                />
            </Box>
        </Box>
    );
}