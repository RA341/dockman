import {Box, CircularProgress, Typography} from "@mui/material";

export const ContainersLoading = () => {
    return (
        <Box sx={{
        display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            width: '100%',
            flex: 1 // Use flex: 1 instead of height: '100%'
    }}>
        <CircularProgress sx={{mr: 2}}/>
        <Typography variant="body1" color="text.secondary">
            Loading containers...
        </Typography>
    </Box>
    );
};
