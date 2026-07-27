import {type ReactNode, useCallback, useEffect, useRef, useState} from "react";
import {Typography} from "@mui/material";
import {useEditorSave} from "../state/save.ts";

export type SaveState = 'idle' | 'typing' | 'unsaved' | 'saving' | 'success' | 'error'


export type OnSave = (value: string) => Promise<SaveState>
export type SaveCallback = (value: string) => void

interface UseSaveStatusReturn {
    status: SaveState;
    handleContentChange: SaveCallback;
    saveNow: () => Promise<void>;
    setBaseline: (content: string) => void;
}

export const indicatorMap: Record<SaveState, { color: string, component: ReactNode }> = {
    typing: {
        color: "primary.main",
        component: <Typography variant="button" color="primary.main">Typing</Typography>
    },
    unsaved: {
        color: "warning.main",
        component: <Typography variant="button" color="warning.main">Unsaved</Typography>
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

export function useSaveStatus(debounceMs: number, filename: string, onSave: OnSave): UseSaveStatusReturn {
    const [status, setStatus] = useState<SaveState>('idle');
    const debounceTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

    // latest content that has not been persisted yet (null = nothing to save)
    const pendingValue = useRef<string | null>(null);
    // the content currently on disk; a file is only "dirty" when the editor
    // content differs from this. null means the baseline is not known yet.
    const savedValue = useRef<string | null>(null);
    // keep the save callback in a ref so saveNow() is stable and can flush
    // a restored draft even before the user types anything
    const onSaveRef = useRef(onSave);
    useEffect(() => {
        onSaveRef.current = onSave;
    }, [onSave]);

    const autoSave = useEditorSave(state => state.autoSave);
    const setDirty = useEditorSave(state => state.setDirty);
    const setDraft = useEditorSave(state => state.setDraft);
    const clearDraft = useEditorSave(state => state.clearDraft);

    // when switching to a file, restore any in-memory draft so unsaved edits
    // survive tab switches; otherwise start clean. The baseline is unknown
    // until the file finishes loading (see setBaseline).
    useEffect(() => {
        savedValue.current = null;
        const draft = useEditorSave.getState().drafts[filename];
        if (draft !== undefined) {
            pendingValue.current = draft;
            setStatus('unsaved');
        } else {
            pendingValue.current = null;
            setStatus('idle');
        }
    }, [filename]);

    const saveNow = useCallback(async () => {
        if (debounceTimeout.current) {
            clearTimeout(debounceTimeout.current);
            debounceTimeout.current = null;
        }

        const value = pendingValue.current;
        if (value === null) return;

        setStatus('saving');
        const state = await onSaveRef.current(value);
        if (state === 'success') {
            savedValue.current = value;
            pendingValue.current = null;
            setDirty(filename, false);
            clearDraft(filename);
        }
        setStatus(state);
    }, [filename, setDirty, clearDraft]);

    // compare the given content against the on-disk baseline and update the
    // dirty flag / draft / status accordingly. Reverting all edits (e.g. via
    // CTRL+Z) brings the content back to the baseline and clears "unsaved".
    const reconcile = useCallback((value: string) => {
        pendingValue.current = value;

        if (debounceTimeout.current) {
            clearTimeout(debounceTimeout.current);
            debounceTimeout.current = null;
        }

        // if we don't know the baseline yet, treat any content as dirty
        const dirty = savedValue.current === null || value !== savedValue.current;

        if (!dirty) {
            pendingValue.current = null;
            setDirty(filename, false);
            clearDraft(filename);
            setStatus('idle');
            return;
        }

        setDirty(filename, true);
        setDraft(filename, value);

        if (!autoSave) {
            // manual mode: only mark the file as dirty,
            // saving happens via the save button or CTRL+S
            setStatus('unsaved');
            return;
        }

        setStatus('typing');
        debounceTimeout.current = setTimeout(() => {
            saveNow().then();
        }, debounceMs);
    }, [debounceMs, autoSave, filename, saveNow, setDirty, setDraft, clearDraft]);

    const handleContentChange = useCallback<SaveCallback>((value) => {
        reconcile(value);
    }, [reconcile]);

    // called by the editor once the on-disk content is loaded, so dirty state
    // can be evaluated against it (also reconciles a restored draft)
    const setBaseline = useCallback((content: string) => {
        savedValue.current = content;
        if (pendingValue.current !== null) {
            reconcile(pendingValue.current);
        }
    }, [reconcile]);

    useEffect(() => {
        if (status === 'success' || status === 'error') {
            const timer = setTimeout(() => {
                // if a save failed (or new edits arrived) there are still
                // pending changes, fall back to 'unsaved' instead of 'idle'
                setStatus(pendingValue.current !== null ? 'unsaved' : 'idle');
            }, 2000);
            return () => clearTimeout(timer);
        }
    }, [status]);

    return {
        status,
        handleContentChange,
        saveNow,
        setBaseline,
    };
}
