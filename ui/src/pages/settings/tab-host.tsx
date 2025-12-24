import React, {useEffect, useState} from 'react'
import {
    Box,
    Button,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Divider,
    FormControlLabel,
    IconButton,
    Paper,
    Switch,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    TextField,
    Typography
} from "@mui/material"
import {callRPC, useClient} from "../../lib/api.ts"
import {Add, Delete, Edit, ErrorOutlined, InfoOutlined} from '@mui/icons-material'
import {DockerManagerService, type Machine} from '../../gen/docker_manager/v1/docker_manager_pb.ts'
import {useSnackbar} from "../../hooks/snackbar.ts";
import {useHostManager} from "../../context/host-context.tsx";

export function TabDockerHosts() {
    const sshClient = useClient(DockerManagerService)
    const {showError} = useSnackbar()
    const {fetchHosts} = useHostManager()

    const [machines, setMachines] = useState<Machine[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [isDialogOpen, setIsDialogOpen] = useState(false)
    const [editingMachine, setEditingMachine] = useState<Machine | null>(null)
    const [toggleLoading, setToggleLoading] = useState<Set<string>>(new Set())

    const fetchMachines = async () => {
        setLoading(true)
        const {val, err} = await callRPC(() => sshClient.listHosts({}))
        if (err) {
            setError(err)
            console.error(err)
        } else {
            setMachines(val?.machines || [])
        }
        setLoading(false)
    }

    useEffect(() => {
        fetchMachines().then()
        return () => {
            fetchHosts().then()
        }
    }, [])

    const handleOpenDialog = (machine?: Machine) => {
        setEditingMachine(machine || null)
        setIsDialogOpen(true)
    }

    const handleCloseDialog = () => {
        setIsDialogOpen(false)
        setEditingMachine(null)
    }

    const handleSave = async (machine: Omit<Machine, '$unknown' | '$typeName'>) => {
        const rpcCall = editingMachine !== null
            ? () => sshClient.editClient({...machine})
            : () => sshClient.newClient({...machine});

        const {err} = await callRPC(() => rpcCall())
        if (err) {
            showError(err)
            console.error("Failed to save machine", err)
        }

        // Refresh the list after saving
        fetchMachines().then()
        handleCloseDialog()
    }

    const handleDelete = async (id: bigint) => {
        if (window.confirm('Are you sure you want to delete this machine?')) {
            const {err} = await callRPC(() => sshClient.deleteClient({id}))
            if (err) {
                showError(err)
                console.error("Failed to delete machine", err)
            }
            await fetchMachines() // Refresh the list
        }
    }

    const handleToggleEnable = async (machine: Machine) => {
        const machineId = machine.name
        setToggleLoading(prev => new Set(prev).add(machineId))

        const {err} = await callRPC(() => sshClient.toggleClient({
            name: machineId,
            enable: !machine.enable
        }))

        if (err) {
            showError(err)
            console.error("Failed to toggle machine", err)
        } else {
            setMachines(prev =>
                prev.map(m =>
                    m.name === machineId
                        ? {...m, enable: !m.enable}
                        : m
                )
            )
        }
        setToggleLoading(prev => {
            const newSet = new Set(prev)
            newSet.delete(machineId)
            return newSet
        })
    }

    if (loading) {
        return <Box sx={{display: 'flex', justifyContent: 'center', p: 4}}><CircularProgress/></Box>
    }

    if (error) {
        return <Typography color="error">{error}</Typography>
    }

    return (
        <>
            <Box sx={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2}}>
                <Button
                    variant="contained"
                    startIcon={<Add/>}
                    onClick={() => handleOpenDialog()}
                >
                    Add Machine
                </Button>
            </Box>
            <TableContainer component={Paper}>
                <Table>
                    <TableHead>
                        <TableRow>
                            <TableCell sx={{paddingRight: 0}}>Status</TableCell>
                            <TableCell>Name</TableCell>
                            <TableCell>User</TableCell>
                            <TableCell sx={{paddingRight: 0}}>Host</TableCell>
                            <TableCell>Port</TableCell>
                            <TableCell align="center">Actions</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {machines.map((machine) => (
                            <TableRow key={machine.id}>
                                <TableCell sx={{paddingRight: 0}}>
                                    <MachineToggle
                                        key={machine.name}
                                        machine={machine}
                                        onToggle={handleToggleEnable}
                                        loading={toggleLoading.has(machine.name)}
                                    />
                                </TableCell>
                                <TableCell>{machine.name}</TableCell>
                                <TableCell>{machine.user}</TableCell>
                                <TableCell sx={{paddingRight: 0}}>{machine.host}</TableCell>
                                <TableCell>{machine.port}</TableCell>
                                <TableCell align="center">
                                    <IconButton onClick={() => handleOpenDialog(machine)}><Edit/></IconButton>
                                    <IconButton onClick={() => handleDelete(machine.id)}><Delete/></IconButton>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </TableContainer>
            <MachineFormDialog
                open={isDialogOpen}
                onClose={handleCloseDialog}
                onSave={handleSave}
                machine={editingMachine}
            />
        </>
    )
}

const MachineToggle = (
    {machine, onToggle, loading}:
    { machine: Machine; onToggle: (machine: Machine) => void; loading: boolean }
) => {
    return (
        <FormControlLabel
            control={
                // This Box will maintain a constant size, preventing layout shifts.
                <Box
                    sx={{
                        position: 'relative',
                        // Set a fixed size matching the approximate dimensions of the Switch component.
                        // A standard Material-UI Switch is roughly 62px by 42px.
                        width: '50px',
                        height: '30px',
                        // Center the content within the box.
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                    }}
                >
                    {/* The Switch is only rendered when not loading. */}
                    {!loading ? (
                        <Switch
                            checked={machine.enable}
                            onChange={() => onToggle(machine)}
                            disabled={loading}
                        />
                    ) : (
                        // The CircularProgress is shown during the loading state.
                        <CircularProgress
                            size={24}
                            // The absolute positioning centers the spinner within the Box.
                            sx={{
                                position: 'absolute',
                                top: '50%',
                                left: '50%',
                                marginTop: '-12px',
                                marginLeft: '-12px',
                            }}
                        />
                    )}
                </Box>
            }
            label=""
        />
    );
};

interface MachineFormDialogProps {
    open: boolean
    onClose: () => void
    onSave: (machine: Omit<Machine, '$unknown' | '$typeName'>) => Promise<void>
    onSaveAdditional?: (data: { hostname: string; alias: string; filepath: string }) => Promise<void>
    machine: Machine | null
}

const publicKeyHelperText = [
    "When PublicKey is enabled",
    "Password is only used for the initial connection",
    "Dockman will automatically install its public key on the remote host",
    "Enables secure password-less authentication for future connections",
    "Your password will not be stored"
]

const passwordHelperText = [
    "When PublicKey is disabled",
    "Standard password authentication is used",
    "Your password will be stored and used in subsequent connections to the remote host"
]

const emptyMachine = {
    id: BigInt(0),
    name: '',
    host: '',
    port: 22,
    user: '',
    password: '',
    enable: false,
    usePublicKeyAuth: false,
}

export function MachineFormDialog({open, onClose, onSave, onSaveAdditional, machine}: MachineFormDialogProps) {
    const [step, setStep] = useState<'machine' | 'additional'>('machine')
    const [formData, setFormData] = useState(machine || emptyMachine)
    const [additionalData, setAdditionalData] = useState({
        hostname: '',
        alias: '',
        filepath: ''
    })
    const [error, setError] = useState<string>('')
    const [isLoading, setIsLoading] = useState(false)

    useEffect(() => {
        setFormData(machine || emptyMachine)
        setStep('machine')
        setAdditionalData({
            hostname: '',
            alias: '',
            filepath: ''
        })
        setError('')
    }, [machine, open])

    const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const {name, value, type, checked} = event.target
        setFormData(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value,
        }))

        if (error) {
            setError('')
        }
    }

    const handleAdditionalChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const {name, value} = event.target
        setAdditionalData(prev => ({
            ...prev,
            [name]: value,
        }))

        if (error) {
            setError('')
        }
    }

    const handlePortChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        setFormData(prev => ({
            ...prev,
            port: parseInt(event.target.value, 10) || 0,
        }))

        if (error) {
            setError('')
        }
    }

    const isFormValid = () => {
        return formData.name.trim() !== '' &&
            formData.host.trim() !== '' &&
            formData.user.trim() !== '' &&
            (formData.usePublicKeyAuth || formData.password.trim() !== '')
    }

    const isAdditionalFormValid = () => {
        return additionalData.hostname.trim() !== '' &&
            additionalData.alias.trim() !== '' &&
            additionalData.filepath.trim() !== ''
    }

    const handleSaveMachine = async () => {
        setIsLoading(true)
        try {
            await onSave(formData)
            // If machine is being edited (has an id), close the dialog
            // If it's new, move to the additional step
            if (machine && machine.id) {
                onClose()
            } else {
                setAdditionalData(prev => ({
                    ...prev,
                    hostname: formData.name
                }))
                setStep('additional')
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to save machine')
        } finally {
            setIsLoading(false)
        }
    }

    const handleSaveAdditional = async () => {
        setIsLoading(true)
        try {
            if (onSaveAdditional) {
                await onSaveAdditional(additionalData)
            }
            onClose()
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to save additional data')
        } finally {
            setIsLoading(false)
        }
    }

    const handleBack = () => {
        setStep('machine')
        setError('')
    }

    return (
        <Dialog
            open={open}
            onClose={onClose}
            fullWidth
            maxWidth="sm"
        >
            <DialogTitle>
                <Typography variant="h6" component="div">
                    {step === 'machine'
                        ? (machine ? 'Edit Machine' : 'Add New Machine')
                        : 'Additional Configuration'
                    }
                </Typography>
            </DialogTitle>
            <DialogContent>
                {step === 'machine' ? (
                    <Box sx={{pt: 1}}>
                        <FormControlLabel
                            sx={{justifyContent: 'space-between', ml: 0}}
                            labelPlacement="start"
                            label="Enable Machine"
                            control={<Switch name="enable" checked={formData.enable} onChange={handleChange}/>}
                        />
                        <Divider sx={{my: 2}}/>
                        <TextField name="name" label="Name" value={formData.name} onChange={handleChange} fullWidth
                                   margin="dense"/>
                        <TextField name="host" label="Host" value={formData.host} onChange={handleChange} fullWidth
                                   margin="dense"/>
                        <TextField name="port" label="Port" type="number" value={formData.port}
                                   onChange={handlePortChange}
                                   fullWidth margin="dense"/>
                        <TextField name="user" label="User" value={formData.user} onChange={handleChange} fullWidth
                                   margin="dense"/>

                        <Box sx={{mt: 2, mb: 2}}>
                            <Box sx={{display: 'flex', alignItems: 'flex-end', gap: 2}}>
                                <Box sx={{flexGrow: 1}}>
                                    <TextField
                                        name="password"
                                        label="Password"
                                        type="password"
                                        value={formData.password}
                                        onChange={handleChange}
                                        fullWidth
                                        margin="none"
                                    />
                                </Box>
                                <FormControlLabel
                                    sx={{
                                        mb: '8px',
                                        alignItems: 'center',
                                        height: '40px'
                                    }}
                                    control={<Switch name="usePublicKeyAuth" checked={formData.usePublicKeyAuth}
                                                     onChange={handleChange}/>}
                                    label="Public Key"
                                    labelPlacement="start"
                                />
                            </Box>
                            <Box sx={{
                                display: 'flex',
                                alignItems: 'flex-start',
                                mt: 1,
                                p: 1.5,
                                borderRadius: 1,
                                backgroundColor: 'action.hover',
                                minHeight: 72,
                                height: 'auto'
                            }}>
                                <InfoOutlined color="action" sx={{mr: 1, mt: '3px', flexShrink: 0}}/>
                                <Box sx={{flexGrow: 1}}>
                                    {(formData.usePublicKeyAuth ? publicKeyHelperText : passwordHelperText).map((text, index) => (
                                        <Typography key={index} variant="caption" color="text.secondary" sx={{
                                            display: 'block',
                                            lineHeight: 1.4,
                                            mb: index === (formData.usePublicKeyAuth ? publicKeyHelperText : passwordHelperText).length - 1 ? 0 : 0.5,
                                            '&::before': {
                                                content: '"• "',
                                                mr: 0.5
                                            }
                                        }}>
                                            {text}
                                        </Typography>
                                    ))}
                                </Box>
                            </Box>

                            {error && (
                                <Box sx={{
                                    display: 'flex',
                                    alignItems: 'flex-start',
                                    mt: 1,
                                    p: 1.5,
                                    borderRadius: 1,
                                    backgroundColor: 'error.light',
                                    color: 'error.contrastText'
                                }}>
                                    <ErrorOutlined sx={{mr: 1, mt: '3px', flexShrink: 0, color: 'error.main'}}/>
                                    <Typography variant="caption" color="error.main" sx={{lineHeight: 1.4}}>
                                        {error}
                                    </Typography>
                                </Box>
                            )}
                        </Box>
                    </Box>
                ) : (
                    <Box sx={{pt: 1}}>
                        <TextField
                            name="hostname"
                            label="Hostname"
                            value={additionalData.hostname}
                            onChange={handleAdditionalChange}
                            fullWidth
                            margin="dense"
                            disabled
                            InputProps={{
                                readOnly: true,
                            }}
                        />
                        <TextField
                            name="alias"
                            label="Alias"
                            value={additionalData.alias}
                            onChange={handleAdditionalChange}
                            fullWidth
                            margin="dense"
                        />
                        <TextField
                            name="filepath"
                            label="Filepath"
                            value={additionalData.filepath}
                            onChange={handleAdditionalChange}
                            fullWidth
                            margin="dense"
                        />

                        {error && (
                            <Box sx={{
                                display: 'flex',
                                alignItems: 'flex-start',
                                mt: 2,
                                p: 1.5,
                                borderRadius: 1,
                                backgroundColor: 'error.light',
                                color: 'error.contrastText'
                            }}>
                                <ErrorOutlined sx={{mr: 1, mt: '3px', flexShrink: 0, color: 'error.main'}}/>
                                <Typography variant="caption" color="error.main" sx={{lineHeight: 1.4}}>
                                    {error}
                                </Typography>
                            </Box>
                        )}
                    </Box>
                )}
            </DialogContent>
            <DialogActions sx={{p: '16px 24px'}}>
                {step === 'machine' ? (
                    <>
                        <Button
                            onClick={handleSaveMachine}
                            variant="contained"
                            disabled={!isFormValid() || isLoading}
                            startIcon={isLoading ? <CircularProgress size={16} color="inherit"/> : null}
                        >
                            {isLoading ? 'Saving...' : (machine ? 'Save' : 'Next')}
                        </Button>
                        <Button onClick={onClose}>Cancel</Button>
                    </>
                ) : (
                    <>
                        <Button
                            onClick={handleSaveAdditional}
                            variant="contained"
                            disabled={!isAdditionalFormValid() || isLoading}
                            startIcon={isLoading ? <CircularProgress size={16} color="inherit"/> : null}
                        >
                            {isLoading ? 'Saving...' : 'Save'}
                        </Button>
                        <Button onClick={handleBack} disabled={isLoading}>Back</Button>
                        <Button onClick={onClose}>Cancel</Button>
                    </>
                )}
            </DialogActions>
        </Dialog>
    )
}
