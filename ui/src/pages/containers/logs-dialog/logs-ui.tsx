import {useCallback, useEffect, useRef, useState} from "react";
import {Box, Dialog, DialogActions, DialogContent, DialogTitle, IconButton} from '@mui/material';
import CloseIcon from "@mui/icons-material/Close";
import {getWSUrl, useClient} from "../../../lib/api.ts";
import {DockerService} from "../../../gen/docker/v1/docker_pb.ts";
import {FitAddon} from "@xterm/addon-fit";
import AppTerminal from "../../compose/components/logs-terminal.tsx";
import {createTab} from "../../compose/state/state.tsx";

interface LogsDialogProps {
    show: boolean;
    hide: () => void;
    name: string;
    containerID: string;
}

export const LogsDialog = ({show, hide, name, containerID}: LogsDialogProps) => {
    const dockerService = useClient(DockerService);

    const [panelTitle, setPanelTitle] = useState('');
    const fitAddonRef = useRef<FitAddon>(new FitAddon());

    useEffect(() => {
        if (containerID) {
            setPanelTitle(`Logs - ${name}`);
        }
        return () => {
            setPanelTitle('')
        };
    }, [containerID, dockerService, name]);

    const handleClose = () => {
        hide();
    };

    const getLogTab = useCallback(() => {
        return createTab(
            getWSUrl(`api/docker/logs/${containerID}`),
            `Logs: ${containerID}`,
            false)
    }, [containerID])

    return (
        <Dialog
            open={show}
            onClose={handleClose}
            fullWidth
            maxWidth="xl"
            scroll="paper"
            slotProps={{
                paper: {
                    sx: {
                        borderRadius: '12px',
                        backgroundColor: '#2e2e2e',
                        color: '#ffffff'
                    }
                }
            }}
        >
            <DialogTitle sx={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                backgroundColor: '#2e2e2e',
                color: '#ffffff',
                borderBottom: '1px solid #333'
            }}>
                {panelTitle}
                <IconButton
                    onClick={handleClose}
                    sx={{
                        color: '#ffffff',
                        '&:hover': {
                            backgroundColor: '#333'
                        }
                    }}
                >
                    <CloseIcon/>
                </IconButton>
            </DialogTitle>
            <DialogContent dividers sx={{
                p: 0,
                backgroundColor: '#000',
                // borderColor: '#858484',
            }}>
                <AppTerminal
                    {...getLogTab()}
                    fit={fitAddonRef}
                    isActive={true}
                />
            </DialogContent>
            <DialogActions sx={{
                backgroundColor: '#2e2e2e',
                borderTop: '1px solid #333'
            }}>
                <Box sx={{height: '25px'}}/>
            </DialogActions>
        </Dialog>
    )
}

export default LogsDialog;
