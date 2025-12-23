import {Box} from "@mui/material";

const ItToolsWidget = () => {
    return (
        <Box sx={{
            position: 'absolute',
            top: 0, left: 0,
            width: '100%', height: '100%',
            overflow: 'hidden'
        }}>
            <Box
                component="iframe"
                title="It tools"
                src="https://it-tools.tech/"
                sx={{
                    // Hide the default scrollbar its ugly
                    width: 'calc(100% + 20px)',
                    height: '100%',
                    border: 'none',
                }}
            />
        </Box>
    );
};

export default ItToolsWidget;