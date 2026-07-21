import {Box, Typography} from "@mui/material";

const NetworksEmpty = () => {
    return (
        <Box sx={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            width: '100%',
            height: '100%',
            textAlign: 'center',
            gap: 2
        }}>
            <Typography variant="h6" sx={{
                color: "text.secondary"
            }}>
                No networks found
            </Typography>
            <Typography variant="body2" sx={{
                color: "text.secondary"
            }}>
                Better start networking or run some containers let them do it for you
            </Typography>
        </Box>
    );
};

export default NetworksEmpty;