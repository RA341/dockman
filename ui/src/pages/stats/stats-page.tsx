import {Box, Paper, Stack, Typography} from "@mui/material";
import {BarChart as StatsIcon} from "@mui/icons-material";
import {TabStat} from "../compose/tab-stats.tsx";
import {useHostStore} from "../compose/state/files.ts";

const StatsPage = () => {
    const host = useHostStore(state => state.host);

    return (
        <Box sx={{
            display: 'flex',
            flexDirection: 'column',
            height: '100vh',
            overflow: 'hidden'
        }}>
            <Paper
                elevation={0}
                square
                sx={{
                    borderBottom: '1px solid',
                    borderColor: 'divider',
                    bgcolor: 'background.paper',
                    py: 2,
                    px: 3,
                    flexShrink: 0
                }}
            >
                <Stack direction="row" alignItems="center">
                    <Box>
                        <Stack direction="row" spacing={2} alignItems="center">
                            <Box sx={{
                                p: 1,
                                borderRadius: 1.5,
                                display: 'flex',
                                color: 'primary.main',
                                border: '1px solid',
                                borderColor: 'divider',
                            }}>
                                <StatsIcon fontSize="small"/>
                            </Box>
                            <Box>
                                <Typography variant="h5" sx={{fontWeight: 800, letterSpacing: -0.5, lineHeight: 1.2}}>
                                    System Resources
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                    Resource usage for node: <b>{host}</b>
                                </Typography>
                            </Box>
                        </Stack>
                    </Box>
                </Stack>
            </Paper>

            {/* --- Stats Content --- */}
            <Box sx={{
                flexGrow: 1,
                minHeight: 0,
                display: 'flex',
                flexDirection: 'column'
            }}>
                <TabStat/>
            </Box>
            <style>
                {`
                    @keyframes pulse {
                        0% { opacity: 1; }
                        50% { opacity: 0.3; }
                        100% { opacity: 1; }
                    }
                `}
            </style>
        </Box>
    );
};

export default StatsPage;
