import useButtonAction from "../hooks/button-action.ts";
import React, {useState} from "react";
import {Button, CircularProgress, Popover, Stack, Tooltip, Typography} from "@mui/material";

interface Action {
    action: string;
    buttonText: string;
    icon: React.ReactElement,
    disabled: boolean;
    handler: () => Promise<void>;
    tooltip: string;
    confirm?: string;
}

interface ActionButtonProps {
    actions: Action[];
    variant?: 'outlined' | 'contained'
    // symbol-only buttons: the label moves into the tooltip
    iconOnly?: boolean
}

// one compact action row shared by every list view (containers, images,
// volumes, networks): small buttons, sentence case, quiet borders that pick
// up the accent on hover — same recipe as the deploy tab's action row
function ActionButtons({actions, variant = 'outlined', iconOnly = false}: ActionButtonProps) {
    const {buttonAction, activeAction} = useButtonAction()
    const [confirmation, setConfirmation] = useState<{anchor: HTMLElement, action: Action} | null>(null)

    const trigger = (event: React.MouseEvent<HTMLElement>, action: Action) => {
        if (action.confirm) {
            setConfirmation({anchor: event.currentTarget, action})
            return
        }
        void buttonAction(action.handler, action.action)
    }

    const confirm = () => {
        if (!confirmation) return
        const action = confirmation.action
        setConfirmation(null)
        void buttonAction(action.handler, action.action)
    }

    return (
        <Stack direction="row" spacing={iconOnly ? 0.5 : 1} sx={{
            alignItems: "center"
        }}>
            {actions.map((action) => (
                <Tooltip key={action.action}
                         title={iconOnly
                             ? (action.tooltip ? `${action.buttonText} — ${action.tooltip}` : action.buttonText)
                             : action.tooltip}>
                    <span>
                        <Button
                            variant={variant}
                            size="small"
                            onClick={(event) => trigger(event, action)}
                            disabled={action.disabled || !!activeAction}
                            startIcon={iconOnly ? undefined : (activeAction === action.action ?
                                <CircularProgress size={15} color="inherit"/> :
                                action.icon
                            )}
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
                                ? (activeAction === action.action
                                    ? <CircularProgress size={15} color="inherit"/>
                                    : action.icon)
                                : action.buttonText}
                        </Button>
                    </span>
                </Tooltip>
            ))}
            <Popover
                open={confirmation !== null}
                anchorEl={confirmation?.anchor}
                onClose={() => setConfirmation(null)}
                anchorOrigin={{vertical: 'top', horizontal: 'center'}}
                transformOrigin={{vertical: 'bottom', horizontal: 'center'}}
            >
                <Stack spacing={0.75} sx={{p: 1.25, maxWidth: 280}}>
                    <Typography sx={{fontSize: '0.8rem'}}>
                        {confirmation?.action.confirm}
                    </Typography>
                    <Stack direction="row" spacing={0.75} sx={{justifyContent: 'flex-end'}}>
                        <Button size="small" onClick={() => setConfirmation(null)} sx={{textTransform: 'none'}}>
                            Cancel
                        </Button>
                        <Button size="small" variant="contained" color="error" onClick={confirm}
                                sx={{textTransform: 'none', fontWeight: 700}}>
                            Remove
                        </Button>
                    </Stack>
                </Stack>
            </Popover>
        </Stack>
    );
}

export default ActionButtons;
