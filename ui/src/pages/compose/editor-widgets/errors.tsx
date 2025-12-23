import {Box, Typography} from '@mui/material';

const EditorErrorWidget = ({errors}: { errors: string[] }) => {
    return (
        errors.length === 0 ? (
            <Typography variant="subtitle1" sx={{mb: 1, fontWeight: 'bold', whiteSpace: 'nowrap'}}>
                No errors detected
            </Typography>
        ) : <>
            <Typography
                variant="subtitle1"
                sx={{mb: 1, fontWeight: 'bold', whiteSpace: 'nowrap'}}
            >
                Errors
            </Typography>

            {errors.map((value, index) => (
                <Box
                    key={index}
                    sx={{
                        p: 1.5,
                        mb: 3,
                        backgroundColor: 'rgba(211, 47, 47, 0.1)', // Faint red background
                        border: '1px solid rgba(211, 47, 47, 0.4)',
                        borderRadius: 1,
                        fontFamily: 'monospace',
                        fontSize: '0.875rem',
                        color: '#ffcdd2', // Light red text for dark mode
                        whiteSpace: 'pre-wrap', // Allows the text to wrap
                        wordBreak: 'break-all', // Breaks long unbreakable strings (like paths)
                    }}
                >
                    {value}
                </Box>
            ))}
        </>
    );
};

export default EditorErrorWidget