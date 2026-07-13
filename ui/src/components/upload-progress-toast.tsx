import {Alert, Box, LinearProgress, Snackbar, Typography} from '@mui/material';
import {CloudUpload} from '@mui/icons-material';
import {useUploadProgress} from '../hooks/upload-progress.ts';

// Global, self-managing progress toast shown while a batch of files uploads.
// It mirrors the app's snackbar styling (bottom Alert) but sits slightly higher
// so it does not clash with a regular snackbar, and disappears on completion —
// the success/error toast then confirms the outcome.
export function UploadProgressToast() {
    const active = useUploadProgress(s => s.active);
    const fileCount = useUploadProgress(s => s.fileCount);
    const doneCount = useUploadProgress(s => s.doneCount);
    const totalBytes = useUploadProgress(s => s.totalBytes);
    const loadedBytes = useUploadProgress(s => s.loadedBytes);

    if (!active) return null;

    const pct = totalBytes > 0
        ? Math.min(100, Math.round((loadedBytes / totalBytes) * 100))
        : 0;

    return (
        <Snackbar
            open
            anchorOrigin={{vertical: 'bottom', horizontal: 'center'}}
            sx={{bottom: {xs: 88, sm: 88}}}
        >
            <Alert
                severity="info"
                icon={<CloudUpload fontSize="inherit"/>}
                sx={{width: '100%', minWidth: 300, alignItems: 'center'}}
            >
                <Box sx={{width: '100%'}}>
                    <Typography variant="body2" sx={{fontWeight: 600, mb: 0.75}}>
                        Uploading {fileCount} {fileCount === 1 ? 'file' : 'files'}
                        {doneCount > 0 && ` — ${doneCount}/${fileCount} done`}
                        {' · '}{pct}%
                    </Typography>
                    <LinearProgress
                        variant="determinate"
                        value={pct}
                        sx={{height: 6, borderRadius: 3}}
                    />
                </Box>
            </Alert>
        </Snackbar>
    );
}
