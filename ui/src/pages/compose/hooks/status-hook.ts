import {useCallback, useEffect, useRef, useState} from "react";

export type SaveState = 'idle' | 'typing' | 'saving' | 'success' | 'error'

interface UseSaveStatusReturn {
    status: SaveState;
    setStatus: (status: SaveState) => void;
    handleContentChange: (value: string, onSave: (value: string) => void) => void;
}

export function useSaveStatus(debounceMs: number = 500, filename: string): UseSaveStatusReturn {
    const [status, setStatus] = useState<SaveState>('idle');
    const debounceTimeout = useRef<null | number>(null);

    useEffect(() => {
        setStatus('idle');
    }, [filename]);

    const handleContentChange = useCallback((value: string, onSave: (value: string) => void) => {
        if (debounceTimeout.current) {
            clearTimeout(debounceTimeout.current);
        }

        setStatus('typing');

        debounceTimeout.current = setTimeout(() => {
            setStatus('saving');
            onSave(value);
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
        setStatus,
        handleContentChange
    };
}