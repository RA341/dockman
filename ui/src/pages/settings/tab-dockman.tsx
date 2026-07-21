import {Box, Button, CircularProgress, Stack, Typography} from "@mui/material";
import {RestartAlt, SystemUpdateAlt} from "@mui/icons-material";
import {useState} from "react";
import {getBaseUrl} from "../../lib/api.ts";
import {useSnackbar} from "../../hooks/snackbar.ts";

export default function TabDockman() {
    const {showError, showSuccess} = useSnackbar();
    const [updating, setUpdating] = useState(false);
    const [restarting, setRestarting] = useState(false);
    const busy = updating || restarting;

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

    const handleRestart = async () => {
        const ok = window.confirm(
            "Restart the Dockman container now?\n\n" +
            "Dockman will briefly go offline. No image will be pulled."
        );
        if (!ok) return;

        setRestarting(true);
        try {
            const res = await fetch(`${getBaseUrl("host", "local")}/docker/restart/dockman`, {
                method: "POST",
            });
            if (!res.ok) {
                showError(`Restart failed: ${res.status} ${await res.text()}`);
                return;
            }
            showSuccess("Restart scheduled — Dockman will be back shortly.");
        } catch (e) {
            showError(`Restart failed: ${(e as Error).message}`);
        } finally {
            setRestarting(false);
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
                <Typography variant="h6" gutterBottom>Dockman maintenance</Typography>
                <Typography
                    variant="body2"
                    sx={{
                        color: "text.secondary",
                        mb: 2
                    }}>
                    Restart the current container, or pull the latest Dockman image and
                    recreate it through a short-lived helper. In both cases Dockman is
                    briefly unavailable and your compose configuration is reused as-is.
                </Typography>
                <Stack direction={{xs: "column", sm: "row"}} spacing={1.25}>
                    <Button
                        variant="outlined"
                        onClick={handleRestart}
                        disabled={busy}
                        startIcon={restarting
                            ? <CircularProgress size={16} color="inherit"/>
                            : <RestartAlt/>}
                    >
                        {restarting ? "Scheduling restart…" : "Restart Dockman"}
                    </Button>
                    <Button
                        variant="contained"
                        onClick={handleUpdate}
                        disabled={busy}
                        startIcon={updating
                            ? <CircularProgress size={16} color="inherit"/>
                            : <SystemUpdateAlt/>}
                    >
                        {updating ? "Starting update…" : "Update Dockman"}
                    </Button>
                </Stack>
            </Box>
        </Box>
    );
}
