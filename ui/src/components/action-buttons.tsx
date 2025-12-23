import useButtonAction from "../hooks/button-action.ts";
import React from "react";
import {Button, CircularProgress, Stack, Tooltip} from "@mui/material";

interface Action {
    action: string;
    buttonText: string;
    icon: React.ReactElement,
    disabled: boolean;
    handler: () => Promise<void>;
    tooltip: string;
}

interface ActionButtonProps {
    actions: Action[];
    variant?: 'outlined' | 'contained'
}

function ActionButtons({actions, variant = 'outlined'}: ActionButtonProps) {
    const {buttonAction, activeAction} = useButtonAction()

    return (
        <Stack direction="row" spacing={2}>
            {actions.map((action) => (
                <Tooltip title={action.tooltip}>
                    <Button
                        variant={variant}
                        onClick={() => buttonAction(action.handler, action.action)}
                        disabled={action.disabled || !!activeAction}
                        // sx={{minWidth: 140}}
                        startIcon={activeAction === action.action ?
                            <CircularProgress size={20} color="inherit"/> :
                            action.icon
                        }
                    >
                        {action.buttonText}
                    </Button>
                </Tooltip>
            ))}
        </Stack>
    );
}

export default ActionButtons;