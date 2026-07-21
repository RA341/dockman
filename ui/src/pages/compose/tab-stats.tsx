import {Box, Chip, Typography} from '@mui/material';
import {BarChart as StatsIcon} from '@mui/icons-material';
import {useMemo} from 'react';
import {useDockerStats, useHostStats} from "../../hooks/docker-containers-stats.ts";
import {ContainerStatTable} from './components/container-stat-table.tsx';
import AggregateStats from "./components/container-stat-chart.tsx";
import {statsTheme} from "./components/stats-theme.ts";
import useSearch from "../../hooks/search.ts";
import SearchBar from "../../components/search-bar.tsx";
import {useHostStore} from "./state/files.ts";

interface StackStatsProps {
    selectedPage?: string;
    // 'page' adds the uniform view header (title, count, host, search on one
    // line); 'tab' stays condensed for the editor's stats tab — no search
    variant?: 'tab' | 'page';
}

export function TabStat({selectedPage = "", variant = 'tab'}: StackStatsProps) {
    const {containers, history, aggregates, loading, handleSortChange, sortOrder, sortField} = useDockerStats(selectedPage)
    const {search, setSearch, searchInputRef} = useSearch()
    const host = useHostStore(state => state.host)
    // the host-wide view reads the real host usage; stack views keep the
    // per-container aggregation
    const hostStats = useHostStats(!selectedPage)

    const isPage = variant === 'page';

    // display-only filter: the aggregate band keeps totalling everything
    const filteredContainers = useMemo(() => {
        if (!isPage) return containers;
        const query = search.trim().toLowerCase();
        if (!query) return containers;
        return containers.filter(c => c.name.toLowerCase().includes(query));
    }, [containers, isPage, search]);

    return (
        <Box sx={{
            p: isPage ? {xs: 1, md: 3} : 1,
            height: '100vh',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            boxSizing: 'border-box',
            bgcolor: statsTheme.page,
        }}>
            {isPage && (
                <Box sx={{mb: 2, display: 'flex', alignItems: 'center', gap: 1}}>
                    <StatsIcon color="primary" sx={{fontSize: 20}}/>
                    <Typography variant="h6" sx={{fontWeight: 800, letterSpacing: -0.5}}>
                        Stats
                    </Typography>
                    <Chip
                        label={containers.length}
                        size="small"
                        sx={{fontWeight: 700, color: 'primary.main'}}
                    />
                    <Typography variant="caption" sx={{
                        color: "text.secondary"
                    }}>
                        on <code style={{fontWeight: 'bold'}}>{host}</code>
                    </Typography>
                    <Box sx={{flexGrow: 1}}/>
                    <SearchBar search={search} setSearch={setSearch} inputRef={searchInputRef}/>
                </Box>
            )}
            <Box sx={{flexShrink: 0}}>
                <AggregateStats aggregates={aggregates} hostStats={hostStats}/>
            </Box>
            <Box sx={{flexGrow: 1, minHeight: 0}}>
                <ContainerStatTable
                    loading={loading}
                    containers={filteredContainers}
                    history={history}
                    activeSortField={sortField}
                    order={sortOrder}
                    onFieldClick={handleSortChange}
                />
            </Box>
        </Box>
    );
}
