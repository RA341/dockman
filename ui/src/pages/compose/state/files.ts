import {create} from 'zustand'
import {getContextKey} from "../../../context/tab-context.tsx";
import {immer} from "zustand/middleware/immer";
import {persist} from "zustand/middleware";

// usePinnedMode toggles the "pinned scroll" layout: when enabled, pinned
// entries stay fixed at the top of the file tree and only the rest scrolls.
// Persisted so the choice survives reloads.
export const usePinnedMode = create<{ enabled: boolean; toggle: () => void }>()(
    persist(
        (set) => ({
            enabled: false,
            toggle: () => set((state) => ({enabled: !state.enabled})),
        }),
        {name: "dockman-pinned-mode"}
    )
);

export type ToolbarPlacement = "top" | "side";

// useToolbarPlacement chooses where the file explorer action buttons live:
// "top" (in the file list header, the classic layout) or "side" (stacked on
// the left activity rail to reclaim vertical space). Persisted.
export const useToolbarPlacement = create<{
    placement: ToolbarPlacement;
    toggle: () => void;
}>()(
    persist(
        (set) => ({
            placement: "top",
            toggle: () => set((state) => ({placement: state.placement === "top" ? "side" : "top"})),
        }),
        {name: "dockman-toolbar-placement"}
    )
);

// useCompactMode shrinks row/tab heights across the compose view to fit more
// on screen. Persisted.
export const useCompactMode = create<{ enabled: boolean; toggle: () => void }>()(
    persist(
        (set) => ({
            enabled: false,
            toggle: () => set((state) => ({enabled: !state.enabled})),
        }),
        {name: "dockman-compact-mode"}
    )
);

// useFileDrag is a transient (non-persisted) flag that is true while a file-tree
// entry is being dragged. It drives the temporary "drop to root" banner, which
// is only rendered during a drag so it takes no layout space the rest of the time.
export const useFileDrag = create<{ dragging: boolean; setDragging: (v: boolean) => void }>(
    (set) => ({
        dragging: false,
        setDragging: (dragging: boolean) => set({dragging}),
    })
);

export const useAliasStore = create<{
    alias: string
    setAlias: (alias: string) => void
}>(set => ({
        alias: "",
        setAlias: (alias: string) => {
            set(state => {
                if (alias && alias !== state.alias) {
                    return {
                        alias
                    }
                }
                return state
            })
        }
    })
)

export const useHostStore = create<{
    host: string
    setHost: (host: string) => void
}>(
    set => ({
        host: "",
        setHost: (host: string) => {
            set(state => {
                if (host && host !== state.host) {
                    return {
                        host
                    }
                }
                return state
            })
        }
    })
)

export const useSideBarAction = create<{ isSidebarOpen: boolean; toggle: () => void }>(set => ({
    isSidebarOpen: false,
    toggle: () => set(state => ({
        isSidebarOpen: !state.isSidebarOpen
    })),
}));

interface OpenFilesState {
    // contextKey -> Set of directory paths
    openFiles: Record<string, Set<string>>;
    toggle: (dir: string) => void;
    delete: (dir: string) => void;
    recursiveOpen: (path: string) => void;
}

export const useOpenFiles = create<OpenFilesState>()(
    immer((set) => ({
        openFiles: {},

        toggle: (dir: string) => {
            const key = getContextKey();
            set((state) => {
                // Initialize context set if it doesn't exist
                if (!state.openFiles[key]) {
                    state.openFiles[key] = new Set();
                }

                const contextSet = state.openFiles[key];
                if (contextSet.has(dir)) {
                    contextSet.delete(dir);
                } else {
                    contextSet.add(dir);
                }
            });
        },

        delete: (dir: string) => {
            const key = getContextKey();
            set((state) => {
                state.openFiles[key]?.delete(dir);
            });
        },

        recursiveOpen: (path: string) => {
            const key = getContextKey();
            set((state) => {
                if (!state.openFiles[key]) {
                    state.openFiles[key] = new Set();
                }

                const parts = path.split("/");
                let acc = "";

                parts.forEach((part) => {
                    // Check if part is a file (has extension)
                    const isFile = part.includes(".");

                    if (!isFile) {
                        // Build the path segment
                        acc = acc === "" ? part : `${acc}/${part}`;
                        state.openFiles[key].add(acc);
                    }
                });
            });
        },
    }))
);


export const useLastOpened = create<{
    lastEditorUrl: string;
    setUrl: (url: string) => void;
    clear: () => void;
}>()((set) => ({
    lastEditorUrl: "",
    setUrl: (url: string) => {
        set({lastEditorUrl: url});
    },
    clear: () => set({lastEditorUrl: ""}),
}))
