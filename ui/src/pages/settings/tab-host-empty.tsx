import {Box, Button, Paper, Stack, Typography} from "@mui/material";
import {Add, DnsOutlined, RouterOutlined} from '@mui/icons-material';

function EmptyHostDisplay({onAdd}: { onAdd: () => void }) {
    return (
        <Paper
            variant="outlined"
            sx={{
                py: 10,
                px: 2,
                textAlign: 'center',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 4,
                borderStyle: 'dashed',
                borderWidth: 2,
            }}
        >
            <Box
                sx={{
                    mb: 3,
                    width: 80,
                    height: 80,
                    borderRadius: '50%',
                    bgcolor: 'primary.lighter',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'primary.main',
                }}
            >
                <DnsOutlined sx={{fontSize: 40}}/>
            </Box>

            <Typography variant="h6" sx={{fontWeight: 800, mb: 1}}>
                No Hosts Detected
            </Typography>

            <Typography variant="body2" color="text.secondary" sx={{maxWidth: 400, mb: 4}}>
                No Docker hosts found. Add hosts to get started.
            </Typography>

            <Stack direction="row" spacing={2}>
                <Button
                    variant="contained"
                    startIcon={<Add/>}
                    onClick={onAdd}
                    sx={{borderRadius: 2, px: 4, py: 1, fontWeight: 700}}
                >
                    Add
                </Button>

                {/* Optional secondary button for documentation */}
                <Button
                    variant="outlined"
                    color="inherit"
                    startIcon={<RouterOutlined/>}
                    href="https://dockman.radn.dev/docs/hosts"
                    target="_blank"
                    sx={{borderRadius: 2, px: 3, fontWeight: 700, bgcolor: 'background.paper'}}
                >
                    Read Guide
                </Button>
            </Stack>
        </Paper>
    );
}

export default EmptyHostDisplay