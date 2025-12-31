import {type ReactNode, useCallback, useEffect, useRef, useState} from "react";
import {Typography} from "@mui/material";

export type SaveState = 'idle' | 'typing' | 'saving' | 'success' | 'error'


export type OnSave = (value: string) => Promise<SaveState>
export type SaveCallback = (value: string, onSave: OnSave) => void

interface UseSaveStatusReturn {
    status: SaveState;
    handleContentChange: SaveCallback;
}

export const indicatorMap: Record<SaveState, { color: string, component: ReactNode }> = {
    typing: {
        color: "primary.main",
        component: <Typography variant="button" color="primary.main">Typing</Typography>
    },
    saving: {
        color: "info.main",
        component: <Typography variant="button" color="info.main">Saving</Typography>
    },
    success: {
        color: "success.main",
        component: <Typography variant="button" color="success.main">Saved</Typography>
    },
    error: {
        color: "error.main",
        component: <Typography variant="button" color="error.main">Save Failed</Typography>
    },
    idle: {
        color: "primary.secondary",
        component: <></>
    }
};

export function useSaveStatus(debounceMs: number = 500, filename: string): UseSaveStatusReturn {
    const [status, setStatus] = useState<SaveState>('idle');
    const debounceTimeout = useRef<null | number>(null);

    useEffect(() => {
        setStatus('idle');
    }, [filename]);

    const handleContentChange = useCallback<SaveCallback>((value, onSave) => {
        setStatus('typing');

        if (debounceTimeout.current) {
            clearTimeout(debounceTimeout.current);
        }

        debounceTimeout.current = setTimeout(async () => {
            setStatus('saving');
            const state = await onSave(value)
            setStatus(state);
        }, debounceMs);
    }, [debounceMs]);

    useEffect(() => {
        if (status === 'success' || status === 'error') {
            const timer = setTimeout(() => {
                setStatus('idle');
            }, 2000);
            return () => clearTimeout(timer);
        }
    }, [status]);

    return {
        status,
        handleContentChange
    };
}