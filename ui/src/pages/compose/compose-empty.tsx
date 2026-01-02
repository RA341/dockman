import {useMemo} from 'react';
import {Box, Button, Container, MenuItem, Paper, Stack, TextField, Typography} from '@mui/material';
import {
    Add,
    DescriptionOutlined,
    FolderOffOutlined as ErrorIcon,
    SettingsOutlined as SettingsIcon
} from '@mui/icons-material';
import {useAlias} from "../../context/alias-context.tsx";
import {useFileComponents} from "./state/terminal.tsx";
import AliasDialog, {useAliasAddDialogState} from "./components/add-alias-dialog.tsx";
import {useNavigate} from "react-router-dom";
import FolderIcon from "@mui/icons-material/Folder";

export const InvalidAlias = () => {
    const {aliases} = useAlias();
    const {host, alias} = useFileComponents();

    const navigate = useNavigate();
    const openD = useAliasAddDialogState(state => state.setOpen)
    const isEmpty = aliases.length === 0;

    return (
        <>
            <Box sx={{
                height: '100vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                p: 3
            }}>
                <Container maxWidth="sm">
                    <Paper
                        variant="outlined"
                        sx={{
                            p: 6,
                            textAlign: 'center',
                            borderRadius: 4,
                            borderStyle: 'dashed',
                            borderWidth: 2,
                            bgcolor: 'background.paper',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                        }}
                    >
                        <Box sx={{
                            p: 2, borderRadius: '50%', bgcolor: 'error.lighter',
                            color: 'error.main', mb: 3, display: 'flex'
                        }}>
                            <ErrorIcon sx={{fontSize: 40}}/>
                        </Box>

                        <Typography variant="h5" sx={{fontWeight: 800, mb: 1}}>
                            {isEmpty ? "No Aliases found" : "Invalid Directory Alias"}
                        </Typography>

                        <Typography variant="body1" color="text.secondary" sx={{mb: 3}}>
                            {isEmpty ? (
                                "There are no aliases registered on this host. Dockman requires an alias to manage files."
                            ) : (
                                <>
                                    The alias <Typography component="span" variant="caption" sx={{
                                    fontFamily: 'monospace',
                                    fontWeight: 700,
                                    px: 0.5
                                }}>{alias}</Typography> is not registered on this host.
                                </>
                            )}
                        </Typography>

                        <Stack direction="row" spacing={2}>
                            <Button
                                variant="contained"
                                startIcon={isEmpty ? <Add/> : <SettingsIcon/>}
                                onClick={() => openD(true)}
                                sx={{borderRadius: 2, fontWeight: 700, boxShadow: 'none'}}
                            >
                                Add alias
                            </Button>

                            {/* Only show the "Switch" dropdown if there are actually aliases available to switch to */}
                            {!isEmpty && (
                                <TextField
                                    select
                                    label="Switch Alias"
                                    value={""}
                                    onChange={(e) => navigate(`/${host}/files/${e.target.value}`)}
                                    size="small"
                                    sx={{
                                        minWidth: 200,
                                        '& .MuiOutlinedInput-root': {
                                            borderRadius: 2,
                                            fontWeight: 700,
                                            bgcolor: 'background.paper'
                                        }
                                    }}
                                    slotProps={{
                                        select: {displayEmpty: true}
                                    }}
                                >
                                    {aliases.map((f) => (
                                        <MenuItem key={f.alias} value={f.alias}>
                                            <Stack direction="row" spacing={1} alignItems="center">
                                                <FolderIcon sx={{fontSize: 18, color: 'text.disabled'}}/>
                                                <Typography variant="body2" sx={{fontWeight: 600}}>
                                                    {f.alias}
                                                </Typography>
                                            </Stack>
                                        </MenuItem>
                                    ))}
                                </TextField>
                            )}
                        </Stack>
                    </Paper>
                </Container>
            </Box>

            <AliasDialog host={host}/>
        </>
    )
}

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