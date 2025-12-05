import {type ReactNode} from "react";
import {Box, Typography} from "@mui/material";


function CenteredMessage(
    {
        icon,
        title,
        message
    }:
    {
        icon?: ReactNode;
        title: string;
        message?: string;
    }
) {
    return (
        <Box
            sx={{
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
                height: '80vh',
                textAlign: 'center',
                p: 3,
                color: 'text.secondary',
            }}
        >
            {icon && <Box sx={{mb: 2}}>{icon}</Box>}
            <Typography variant="h5" component="h2" gutterBottom sx={{color: 'text.primary'}}>
                {title}
            </Typography>
            {message && <Typography variant="body1">{message}</Typography>}
        </Box>
    );
}

export default CenteredMessage;