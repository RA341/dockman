import {useMemo} from 'react';
import {Box, Stack, Typography} from '@mui/material';
import {DescriptionOutlined} from '@mui/icons-material';

function CoreComposeEmpty() {
    const selected = useMemo(() => {
        const messages = [
            {
                title: "Finder? I barely know her.",
                subtitle: "Try the sidebar."
            },
            {
                title: "Nah, I don't know nothin' about no file.",
                subtitle: "Check the sidebar, maybe you'll find what you're lookin' for."
            },
            {
                title: "No file, no problem. Just kidding, we need one.",
                subtitle: "Pick one from the sidebar."
            },
            {
                title: "File not found? Maybe it's under the couch.",
                subtitle: "or the sidebar."
            },
        ];

        const index = Math.floor(Math.random() * messages.length);
        return messages[index];
    }, []);

    return (
        <Box
            component="main"
            sx={{
                display: 'flex',
                flexGrow: 1,
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
            }}
        >
            <Stack spacing={2} alignItems="center" sx={{textAlign: 'center'}}>
                <DescriptionOutlined sx={{fontSize: '5rem', color: 'grey.400'}}/>
                <Typography variant="h5" component="h1" color="text.secondary">
                    {selected.title}
                </Typography>
                <Typography variant="body1" color="text.disabled">
                    {selected.subtitle}
                </Typography>
            </Stack>
        </Box>
    );
}


export default CoreComposeEmpty