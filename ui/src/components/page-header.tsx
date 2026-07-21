import {Box, Button, Chip, CircularProgress, Tooltip, Typography} from "@mui/material";
import {Refresh} from "@mui/icons-material";
import type {ReactNode} from "react";

// the uniform list-view header: icon, title, count chip, optional extra
// info chip (e.g. total image size), and the host the view looks at.
// `right` pins content (like a search bar) to the same line.
export default function PageHeader({icon, title, count, extra, host, right, compact}: {
    icon: ReactNode,
    title: string,
    count?: number | string,
    extra?: string,
    host?: string,
    right?: ReactNode,
    // tighter bottom margin for views that stack more chrome under the title
    compact?: boolean,
}) {
    return (
        <Box sx={{mb: compact ? 1 : 2, display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0}}>
            <Box sx={{display: 'flex', color: 'primary.main', '& svg': {fontSize: 20}}}>{icon}</Box>
            <Typography variant="h6" sx={{fontWeight: 800, letterSpacing: -0.5}}>
                {title}
            </Typography>
            {count !== undefined && (
                <Chip label={count} size="small" sx={{fontWeight: 700, color: 'primary.main'}}/>
            )}
            {extra && (
                <Chip label={extra} size="small" variant="outlined"
                      sx={{fontWeight: 600, color: 'text.secondary'}}/>
            )}
            {host && (
                <Typography variant="caption" sx={{
                    color: "text.secondary"
                }}>
                    on <code style={{fontWeight: 'bold'}}>{host}</code>
                </Typography>
            )}
            <Box sx={{flexGrow: 1}}/>
            {right}
        </Box>
    );
}

// refresh at the same size and weight as the action buttons, so it sits in
// the same toolbar row instead of floating alone in a corner
export function RefreshButton({onClick, loading, iconOnly}: {
    onClick: () => void,
    loading?: boolean,
    // symbol-only variant matching icon-only action rows
    iconOnly?: boolean,
}) {
    return (
        <Tooltip title="Refresh">
            <span>
                <Button
                    variant="outlined"
                    size="small"
                    onClick={onClick}
                    disabled={loading}
                    startIcon={iconOnly ? undefined : (loading
                        ? <CircularProgress size={15} color="inherit"/>
                        : <Refresh sx={{fontSize: 17}}/>)}
                    sx={{
                        textTransform: 'none',
                        fontWeight: 600,
                        px: iconOnly ? 0.5 : 1.5,
                        minWidth: iconOnly ? 34 : undefined,
                        borderColor: 'divider',
                        color: 'text.secondary',
                        whiteSpace: 'nowrap',
                        '&:hover': {
                            borderColor: 'primary.main',
                            color: 'primary.main',
                            bgcolor: 'action.hover',
                        },
                        '& svg': {fontSize: 17},
                    }}
                >
                    {iconOnly
                        ? (loading ? <CircularProgress size={15} color="inherit"/> : <Refresh sx={{fontSize: 17}}/>)
                        : 'Refresh'}
                </Button>
            </span>
        </Tooltip>
    );
}
