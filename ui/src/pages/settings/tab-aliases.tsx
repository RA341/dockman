import React, {useState} from 'react';
import {
    Box,
    Button,
    IconButton,
    Paper,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    TextField,
    Typography,
    LinearProgress,
    Tooltip
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import FolderIcon from '@mui/icons-material/Folder';
import {useAlias} from "../../context/alias-context.tsx";


const TabAliases = () => {
    const {files, isLoading, addAlias, deleteAlias} = useAlias();

    // Local state for the input form
    const [aliasInput, setAliasInput] = useState("");
    const [pathInput, setPathInput] = useState("");

    const handleAdd = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!aliasInput || !pathInput) return;

        await addAlias(aliasInput, pathInput);

        // Clear inputs on success
        setAliasInput("");
        setPathInput("");
    };

    const handleDelete = async (alias: string) => {
        if (confirm(`Are you sure you want to delete alias "${alias}"?`)) {
            await deleteAlias(alias);
        }
    };

    return (
        <Stack spacing={3} sx={{height: '100%', width: '100%', p: 2}}>

            {/* --- Add New Alias Section --- */}
            <Paper elevation={2} sx={{p: 2}}>
                <Typography variant="h6" gutterBottom sx={{display: 'flex', alignItems: 'center', gap: 1}}>
                    <AddIcon fontSize="small"/> Add New Alias
                </Typography>

                <form onSubmit={handleAdd}>
                    <Stack direction={{xs: 'column', sm: 'row'}} spacing={2} alignItems="stretch">
                        <TextField
                            label="Alias Name"
                            placeholder="e.g. documents"
                            value={aliasInput}
                            onChange={(e) => setAliasInput(e.target.value)}
                            disabled={isLoading}
                            sx={{minWidth: '200px'}}
                            required
                        />
                        <TextField
                            label="Full Path"
                            placeholder="e.g. /home/user/documents"
                            value={pathInput}
                            onChange={(e) => setPathInput(e.target.value)}
                            disabled={isLoading}
                            fullWidth
                            required
                        />
                        <Button
                            variant="contained"
                            type="submit"
                            startIcon={<AddIcon/>}
                            disabled={isLoading || !aliasInput || !pathInput}
                            sx={{whiteSpace: 'nowrap'}}
                        >
                            Add Alias
                        </Button>
                    </Stack>
                </form>
            </Paper>

            {/* --- Alias List Table --- */}
            <Paper elevation={2} sx={{overflow: 'hidden', display: 'flex', flexDirection: 'column'}}>
                {isLoading && <LinearProgress/>}

                <TableContainer sx={{maxHeight: '60vh'}}>
                    <Table stickyHeader aria-label="alias table">
                        <TableHead>
                            <TableRow>
                                <TableCell sx={{fontWeight: 'bold', width: '20%'}}>Alias</TableCell>
                                <TableCell sx={{fontWeight: 'bold'}}>Full Path</TableCell>
                                <TableCell sx={{fontWeight: 'bold', width: '100px'}} align="right">Actions</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {files.length === 0 && !isLoading ? (
                                <TableRow>
                                    <TableCell colSpan={3} align="center" sx={{py: 4, color: 'text.secondary'}}>
                                        <Box display="flex" flexDirection="column" alignItems="center" gap={1}>
                                            <FolderIcon fontSize="large" color="disabled"/>
                                            <Typography>No aliases found.</Typography>
                                        </Box>
                                    </TableCell>
                                </TableRow>
                            ) : (
                                files.map((row) => (
                                    <TableRow
                                        key={row.alias}
                                        hover
                                        sx={{'&:last-child td, &:last-child th': {border: 0}}}
                                    >
                                        <TableCell component="th" scope="row">
                                            <Typography variant="body2" sx={{fontWeight: 500, color: 'primary.main'}}>
                                                {row.alias}
                                            </Typography>
                                        </TableCell>
                                        <TableCell>
                                            <Typography variant="body2" sx={{fontFamily: 'monospace'}}>
                                                {row.fullpath}
                                            </Typography>
                                        </TableCell>
                                        <TableCell align="right">
                                            <Tooltip title="Delete Alias">
                                                <IconButton
                                                    edge="end"
                                                    aria-label="delete"
                                                    color="error"
                                                    onClick={() => handleDelete(row.alias)}
                                                    disabled={isLoading}
                                                >
                                                    <DeleteIcon/>
                                                </IconButton>
                                            </Tooltip>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </TableContainer>
            </Paper>
        </Stack>
    );
};

export default TabAliases;
