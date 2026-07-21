import {Box, Typography} from "@mui/material";

const VolumesEmpty = () => {
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
                No volumes found
            </Typography>
            <Typography variant="body2" sx={{
                color: "text.secondary"
            }}>
                Create some Docker volumes to see them here
            </Typography>
        </Box>
    );
};

export default VolumesEmpty;