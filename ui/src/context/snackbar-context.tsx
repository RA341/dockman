import React, {type ReactNode, useCallback, useMemo, useState} from 'react';
import {Alert, type AlertColor, Snackbar} from '@mui/material';
import {SnackbarContext, type SnackbarContextType, type SnackbarOptions} from '../hooks/snackbar.ts';

interface SnackbarState {
    open: boolean;
    message: string;
    severity: AlertColor;
    duration: number;
    action: ReactNode;
}

interface SnackbarProviderProps {
    children: ReactNode;
}

export const SnackbarProvider: React.FC<SnackbarProviderProps> = ({children}) => {
    const [snackbar, setSnackbar] = useState<SnackbarState>({
        open: false,
        message: '',
        severity: 'info',
        duration: 3000,
        action: null,
    });

    const showSnackbar = useCallback((message: string, options: SnackbarOptions = {}) => {
        setSnackbar({
            open: true,
            message,
            severity: options.severity || 'info',
            duration: options.duration || 3000,
            action: options.action || null,
        });
    }, []);

    const hideSnackbar = useCallback((_event?: React.SyntheticEvent | Event, reason?: string) => {
        if (reason === 'clickaway') {
            return;
        }
        setSnackbar(prev => ({...prev, open: false}));
    }, []);

    // Convenience methods
    const showSuccess = useCallback((message: string, options: Omit<SnackbarOptions, 'severity'> = {}) => {
        showSnackbar(message, {...options, severity: 'success'});
    }, [showSnackbar]);

    const showError = useCallback((message: string, options: Omit<SnackbarOptions, 'severity'> = {}) => {
        showSnackbar(message, {...options, severity: 'error'});
    }, [showSnackbar]);

    const showWarning = useCallback((message: string, options: Omit<SnackbarOptions, 'severity'> = {}) => {
        showSnackbar(message, {...options, severity: 'warning'});
    }, [showSnackbar]);

    const showInfo = useCallback((message: string, options: Omit<SnackbarOptions, 'severity'> = {}) => {
        showSnackbar(message, {...options, severity: 'info'});
    }, [showSnackbar]);

    const value: SnackbarContextType = useMemo(() => ({
        showSnackbar,
        showSuccess,
        showError,
        showWarning,
        showInfo,
        hideSnackbar,
    }), [hideSnackbar, showError, showInfo, showSnackbar, showSuccess, showWarning]);

    return (
        <SnackbarContext.Provider value={value}>
            {children}
            <Snackbar
                open={snackbar.open}
                autoHideDuration={snackbar.duration}
                onClose={hideSnackbar}
                anchorOrigin={{vertical: 'bottom', horizontal: 'center'}}
            >
                <Alert
                    onClose={hideSnackbar}
                    severity={snackbar.severity}
                    // variant="filled"
                    sx={{width: '100%'}}
                    action={snackbar.action}
                >
                    {snackbar.message}
                </Alert>
            </Snackbar>
        </SnackbarContext.Provider>
    );
};
