import {Box, Button, CircularProgress, Typography} from "@mui/material";
import {useState} from "react";
import {getBaseUrl} from "../../lib/api.ts";
import {useSnackbar} from "../../hooks/snackbar.ts";

export default function TabDockman() {
    const {showError, showSuccess} = useSnackbar();
    const [updating, setUpdating] = useState(false);

    const handleUpdate = async () => {
        const ok = window.confirm(
            "Pull the latest Dockman image and recreate the container?\n\n" +
            "Dockman will briefly go offline while it restarts."
        );
        if (!ok) return;

        setUpdating(true);
        try {
            const res = await fetch(`${getBaseUrl("host", "local")}/docker/update/dockman`, {
                method: "POST",
            });
            if (!res.ok) {
                showError(`Update failed: ${res.status} ${await res.text()}`);
                return;
            }
            showSuccess("Update started — Dockman will restart shortly.");
        } catch (e) {
            showError(`Update failed: ${(e as Error).message}`);
        } finally {
            setUpdating(false);
        }
    };

    return (
        <Box sx={{display: "flex", justifyContent: "center", p: 4}}>
            <Box sx={{
                width: "100%",
                maxWidth: 640,
                border: "1px solid",
                borderColor: "divider",
                borderRadius: 2,
                p: 3,
            }}>
                <Typography variant="h6" gutterBottom>Update Dockman</Typography>
                <Typography variant="body2" color="text.secondary" sx={{mb: 2}}>
                    Pulls the latest Dockman image and recreates the container through a
                    short-lived helper. Dockman restarts and is briefly unavailable; your
                    compose configuration is reused as-is.
                </Typography>
                <Button
                    variant="contained"
                    onClick={handleUpdate}
                    disabled={updating}
                    startIcon={updating ? <CircularProgress size={16} color="inherit"/> : undefined}
                >
                    {updating ? "Starting update…" : "Update Dockman"}
                </Button>
            </Box>
        </Box>
    );
}
