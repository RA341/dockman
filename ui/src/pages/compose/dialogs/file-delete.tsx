import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogTitle from '@mui/material/DialogTitle'
import {Box} from "@mui/material"
import {create} from "zustand";
import {useFiles} from "../../../context/file-context.tsx";

export const useFileDelete = create<{
    fileToDelete: string;
    close: () => void;
    open: (filename: string) => void;
}>(set => ({
    fileToDelete: "",
    close: () => {
        set({fileToDelete: ""})
    },
    open: (filename: string) => {
        set({fileToDelete: filename})
    }
}))

const FileDelete = () => {
    const fileToDelete = useFileDelete(state => state.fileToDelete)
    const onClose = useFileDelete(state => state.close)

    const {deleteFile} = useFiles()

    const onCancel = () => {
        onClose()
    }

    const onDelete = () => {
        if (fileToDelete) {
            deleteFile(fileToDelete).then()
        }
        onCancel()
    }

    return (
        <Dialog
            open={!!fileToDelete}
            onClose={onCancel}
            slotProps={{
                transition: {
                    onExited: onClose
                },
                paper: {
                    sx: {
                        backgroundColor: "#000000",
                        color: "#d6d6d6",
                        borderRadius: 3,
                        border: "2px solid #444",
                        p: 2
                    }
                }
            }}
        >
            <DialogTitle sx={{
                border: "3px solid #444",
                borderRadius: 1,
                p: 3,
            }}>
                Delete
                <Box component="span" sx={{
                    color: "#ff6b6b",
                    pl: 1,
                }}>
                    {fileToDelete}
                </Box>
            </DialogTitle>

            <DialogActions sx={{pt: 3}}>
                <Button
                    onClick={onCancel}
                    variant="outlined"
                    sx={{
                        borderColor: "#666",
                        color: "#fff",
                        borderRadius: 2,
                        "&:hover": {
                            borderColor: "#888",
                            backgroundColor: "#2a2a2a"
                        }
                    }}
                >
                    Cancel
                </Button>

                <Button
                    onClick={onDelete}
                    variant="outlined"
                    color="error"
                    sx={{
                        borderColor: "#ff4d4d",
                        borderRadius: 2,
                        "&:hover": {
                            borderColor: "#ff6666",
                            backgroundColor: "rgba(255,77,77,0.1)"
                        }
                    }}
                >
                    Delete
                </Button>
            </DialogActions>
        </Dialog>
    )
}

export default FileDelete