import {create} from 'zustand'
import {getContextKey} from "../../../context/tab-context.tsx";
import {immer} from "zustand/middleware/immer";

export const useAliasStore = create<{
    alias: string
    setAlias: (alias: string) => void
}>(set => ({
        alias: "",
        setAlias: (alias: string) => {
            set(state => {
                if (alias && alias !== state.alias) {
                    console.log("Changing alias", alias)
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
                    console.log("Changing host", host)
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
