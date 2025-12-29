import React, {useState} from 'react';
import {
    Box,
    Button,
    CircularProgress,
    Container,
    CssBaseline,
    InputAdornment,
    Paper,
    Stack,
    TextField,
    Typography
} from '@mui/material';
import {LockOutlined, LoginOutlined, PersonOutline} from '@mui/icons-material';
import {useNavigate} from "react-router-dom";
import {callRPC, useAuthClient} from "../../lib/api.ts";
import {AuthService} from '../../gen/auth/v1/auth_pb.ts';
import {useAuth} from '../../hooks/auth.ts';
import {useSnackbar} from "../../hooks/snackbar.ts";

export function AuthPage() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);

    const authClient = useAuthClient(AuthService);
    const {showError} = useSnackbar();
    const navigate = useNavigate();
    const {refreshAuthStatus} = useAuth();

    const handleLoginSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setLoading(true);

        const {err} = await callRPC(() => authClient.login({
            username: username,
            password: password
        }));

        if (err) {
            showError(err);
            setLoading(false);
        } else {
            refreshAuthStatus();
            navigate('/');
        }
    };

    return (
        <Box sx={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
        }}>
            <CssBaseline/>
            <Container maxWidth="xs">
                <Paper
                    variant="outlined"
                    sx={{
                        p: 4,
                        borderRadius: 3,
                        bgcolor: 'background.paper',
                        boxShadow: '0 8px 24px rgba(0,0,0,0.05)'
                    }}
                >
                    {/* Branded Header */}
                    <Stack spacing={2} alignItems="center" sx={{mb: 4}}>
                        <Box
                            sx={{
                                mb: 3,
                                display: 'flex',
                                justifyContent: 'center',
                                transition: 'transform 0.2s',
                            }}
                        >
                            <Box component="img" sx={{height: 50, width: 50}} alt="Logo" src="/dockman.svg"/>
                        </Box>
                        <Box sx={{textAlign: 'center'}}>
                            <Typography variant="h5" sx={{fontWeight: 800, letterSpacing: '-0.5px'}}>
                                Dockman
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                                Login
                            </Typography>
                        </Box>
                    </Stack>

                    <Box component="form" onSubmit={handleLoginSubmit} noValidate>
                        <Stack spacing={2}>
                            <TextField
                                fullWidth
                                label="Username"
                                autoFocus
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                InputProps={{
                                    startAdornment: (
                                        <InputAdornment position="start">
                                            <PersonOutline fontSize="small" color="action"/>
                                        </InputAdornment>
                                    ),
                                }}
                            />
                            <TextField
                                fullWidth
                                label="Password"
                                type="password"
                                autoComplete="current-password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                InputProps={{
                                    startAdornment: (
                                        <InputAdornment position="start">
                                            <LockOutlined fontSize="small" color="action"/>
                                        </InputAdornment>
                                    ),
                                }}
                            />

                            <Button
                                type="submit"
                                fullWidth
                                variant="contained"
                                size="large"
                                disabled={loading || !username || !password}
                                startIcon={loading ? <CircularProgress size={20} color="inherit"/> : <LoginOutlined/>}
                                sx={{
                                    mt: 1,
                                    py: 1.5,
                                    borderRadius: 2,
                                    fontWeight: 700,
                                    textTransform: 'none',
                                    boxShadow: 'none',
                                    '&:hover': {boxShadow: 'none'}
                                }}
                            >
                                {loading ? 'Signing in...' : 'Sign In'}
                            </Button>
                        </Stack>
                    </Box>
                </Paper>
            </Container>
        </Box>
    );
}

export default AuthPage;
