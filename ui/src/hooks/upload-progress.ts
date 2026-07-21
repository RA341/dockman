import {create} from 'zustand';

// Tracks a single in-flight batch of file uploads so a progress toast can be
// rendered globally. Uploads fan out in parallel, so the caller aggregates the
// per-file byte counts and pushes the totals here.
interface UploadProgressState {
    active: boolean;
    fileCount: number;
    doneCount: number;
    totalBytes: number;
    loadedBytes: number;
    // start a new batch; resets progress counters
    start: (fileCount: number, totalBytes: number) => void;
    // report aggregate bytes sent and how many files have finished
    update: (loadedBytes: number, doneCount: number) => void;
    // batch finished (success or failure); the completion is surfaced via the
    // regular snackbar, so the progress toast simply hides.
    finish: () => void;
}

export const useUploadProgress = create<UploadProgressState>((set) => ({
    active: false,
    fileCount: 0,
    doneCount: 0,
    totalBytes: 0,
    loadedBytes: 0,
    start: (fileCount, totalBytes) =>
        set({active: true, fileCount, totalBytes, loadedBytes: 0, doneCount: 0}),
    update: (loadedBytes, doneCount) => set({loadedBytes, doneCount}),
    finish: () => set({active: false}),
}));
