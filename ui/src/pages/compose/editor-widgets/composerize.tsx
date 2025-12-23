import {useEffect, useState} from 'react';
import {Alert, Box, Divider, IconButton, Link, Paper, Stack, TextField, Tooltip, Typography} from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CheckIcon from '@mui/icons-material/Check';
import composerize from 'composerize';
import {ClearAllRounded, GitHub} from "@mui/icons-material";

const ComposerizeWidget = () => {
    const [input, setInput] = useState('');
    const [output, setOutput] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        if (!input.trim()) {
            setOutput('');
            setError(null);
            return;
        }

        try {
            const result = composerize(input);
            setOutput(result);
            setError(null);
        } catch (err) {
            console.log(err)
            setError('Invalid Docker command. Please check your syntax.');
            setOutput('');
        }
    }, [input]);

    const handleCopy = async () => {
        if (output) {
            await navigator.clipboard.writeText(output);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000); // Reset icon after 2s
        }
    };

    const handleClear = () => {
        setInput('');
        setOutput('');
    };

    return (
        <Box sx={{maxWidth: 900, mx: 'auto', p: 4}}>
            {/* Header Section */}
            <Box sx={{mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end'}}>
                <Box>
                    <Typography variant="h4" fontWeight="800" sx={{letterSpacing: '-0.5px'}}>
                        Composerize
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                        Turn <code style={{color: '#d32f2f'}}>docker run</code> commands into YAML configuration
                    </Typography>
                </Box>

                {/* Clean Acknowledgement */}
                <Link
                    href="https://github.com/composerize/composerize"
                    target="_blank"
                    underline="hover"
                    sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 0.5,
                        fontSize: '0.75rem',
                        color: 'text.disabled',
                        '&:hover': {color: 'text.primary'}
                    }}
                >
                    <GitHub sx={{fontSize: 16}}/>
                    Powered by Composerize
                </Link>
            </Box>

            <Stack spacing={3}>
                {/* Input Section */}
                <Box sx={{position: 'relative'}}>
                    <TextField
                        label="Docker Run Command"
                        placeholder="docker run -d -p 80:80 --name web nginx"
                        multiline
                        rows={5}
                        fullWidth
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        error={!!error}
                        InputProps={{
                            sx: {fontFamily: 'monospace', fontSize: '0.9rem'}
                        }}
                    />
                    {input && (
                        <Tooltip title="Clear Input">
                            <IconButton
                                onClick={handleClear}
                                sx={{position: 'absolute', top: 8, right: 8, color: 'text.disabled'}}
                                size="small"
                            >
                                <ClearAllRounded fontSize="small"/>
                            </IconButton>
                        </Tooltip>
                    )}
                </Box>

                {error && <Alert severity="error" variant="outlined">{error}</Alert>}

                {/* Output Section */}
                <Box>
                    <Box sx={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1}}>
                        <Typography variant="subtitle2" fontWeight="bold"
                                    sx={{color: 'text.secondary', display: 'flex', alignItems: 'center', gap: 1}}>
                            Docker Compose YAML
                        </Typography>

                        {output && (
                            <Tooltip title={copied ? "Copied!" : "Copy to clipboard"}>
                                <IconButton
                                    onClick={handleCopy}
                                    size="small"
                                    color={copied ? "success" : "primary"}
                                    sx={{border: '1px solid', borderColor: 'divider'}}
                                >
                                    {copied ? <CheckIcon fontSize="small"/> : <ContentCopyIcon fontSize="small"/>}
                                </IconButton>
                            </Tooltip>
                        )}
                    </Box>

                    <Paper
                        elevation={0}
                        sx={{
                            p: 3,
                            backgroundColor: '#0d1117', // GitHub Dark theme background
                            color: '#e6edf3',
                            fontFamily: '"Fira Code", "Roboto Mono", monospace',
                            fontSize: '0.85rem',
                            minHeight: '200px',
                            whiteSpace: 'pre-wrap',
                            border: '1px solid #30363d',
                            borderRadius: 3,
                            position: 'relative',
                            transition: 'all 0.2s ease',
                            '&:hover': {borderColor: '#8b949e'}
                        }}
                    >
                        {output || <Typography sx={{color: '#7d8590', fontStyle: 'italic', fontSize: 'inherit'}}># Your
                            docker-compose.yml will appear here...</Typography>}
                    </Paper>
                </Box>

                <Divider sx={{mt: 2}}/>

                <Typography variant="caption" textAlign="center" color="text.disabled">
                    Standard conversion for Docker Compose v3 syntax.
                </Typography>
            </Stack>
        </Box>
    );
};

export default ComposerizeWidget;