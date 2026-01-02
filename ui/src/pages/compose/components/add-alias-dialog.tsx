import {
    Box,
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Divider,
    Stack,
    Typography
} from "@mui/material";
import {DnsOutlined} from '@mui/icons-material';
import {create} from "zustand";
import scrollbarStyles from "../../../components/scrollbar-style.tsx";
import HostAliasManager from "../../settings/components/alias-manager.tsx";
import {useAlias} from "../../../context/alias-context.tsx";

export const useAliasAddDialogState = create<{
    open: boolean;
    setOpen: (open: boolean) => void;
}>(set => ({
    open: false,
    setOpen: (open: boolean) => set({open}),
}))

const AliasDialog = ({host}: {host: string}) => {
    const isOpen = useAliasAddDialogState(state => state.open)
    const toggle = useAliasAddDialogState(state => state.setOpen)
    const {listAlias} = useAlias();

    const onClose = async () => {
        await listAlias()
        toggle(false)
    }

    return (
        <Dialog
            open={isOpen}
            onClose={onClose}
            fullWidth
            maxWidth="sm"
            slotProps={{
                paper: {sx: {borderRadius: 3, backgroundImage: 'none'}}
            }}
        >
            <DialogTitle sx={{p: 3, pb: 0}}>
                <Stack direction="row" alignItems="center" spacing={1.5} sx={{mb: 2}}>
                    <Box sx={{
                        p: 1,
                        borderRadius: 1.5,
                        bgcolor: 'primary.lighter',
                        color: 'primary.main',
                        display: 'flex'
                    }}>
                        <DnsOutlined fontSize="small"/>
                    </Box>
                    <Box>
                        <Typography variant="h6" sx={{fontWeight: 800}}>
                            Manage Aliases
                        </Typography>
                    </Box>
                </Stack>
            </DialogTitle>

            <DialogContent sx={{p: 3, minHeight: 450, ...scrollbarStyles}}>
                <HostAliasManager hostname={host} hostId={0}/>
            </DialogContent>

            <Divider/>

            <DialogActions sx={{p: 2.5}}>
                <Button variant="outlined" color="inherit" onClick={onClose}
                        sx={{borderRadius: 2, fontWeight: 700}}>Close</Button>
                <Box sx={{flex: 1}}/>
            </DialogActions>
        </Dialog>
    )
}

export default AliasDialog