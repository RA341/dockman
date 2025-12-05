import {Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography} from "@mui/material";
import {useState} from "react";
import {ComposeActionHeaders} from "./components/compose-action-buttons.tsx";

function EditorDeployWidget() {
    const [composeErrorDialog, setComposeErrorDialog] = useState<{ dialog: boolean; message: string }>({
        dialog: false,
        message: ''
    });
    const closeErrorDialog = () => setComposeErrorDialog(p => ({...p, dialog: false}));

    return (
        <>
            <ComposeActionHeaders
                selectedServices={[]}
                fetchContainers={async () => {
                }}
            />
            <Dialog open={composeErrorDialog.dialog} onClose={closeErrorDialog}>
                <DialogTitle>Error</DialogTitle>
                <DialogContent>
                    <Typography sx={{whiteSpace: 'pre-wrap'}}>{composeErrorDialog.message}</Typography>
                </DialogContent>
                <DialogActions>
                    <Button onClick={closeErrorDialog} color="primary">Close</Button>
                </DialogActions>
            </Dialog>
        </>
    );
}

export default EditorDeployWidget