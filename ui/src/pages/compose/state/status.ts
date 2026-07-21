import {immer} from "zustand/middleware/immer";
import {getContextKey} from "../../../context/tab-context.tsx";
import {type Status, StatusSchema} from "../../../gen/docker/v1/docker_pb.ts";
import {create as createMessage, equals} from "@bufbuild/protobuf";
import {create} from "zustand";

interface OpenFilesState {
    // contextKey -> Set of directory paths
    openFiles: Record<string, Record<string, Status>>;
    delete: (dir: string, keep?: string) => void;
    trackComposeStatus: (path: string) => void;
    setStatus: (status: { [p: string]: Status }) => void
}

export const useComposeFileState = create<OpenFilesState>()(
    immer((set) => ({
        openFiles: {},

        delete: (dir: string, keep?: string) => {
            const key = getContextKey();
            set((state) => {
                const openStatuses = state.openFiles[key];
                if (!openStatuses) {
                    return
                }

                for (const trackingFile of Object.keys(openStatuses)) {
                    // keep lets a collapsed stack folder retain its own compose
                    // status (so its dot stays visible) while dropping the files
                    // nested inside it.
                    if (trackingFile !== keep && trackingFile.startsWith(dir)) {
                        delete state.openFiles[key][trackingFile];
                    }
                }
            });
        },

        trackComposeStatus: (path: string) => {
            const key = getContextKey();
            set((state) => {
                if (!state.openFiles[key]) {
                    state.openFiles[key] = <Record<string, Status>>{};
                }

                // Only initialise when not already tracked. Re-tracking a path
                // (e.g. when a folder is expanded and its compose child mounts)
                // must not reset an already-known status to empty, otherwise the
                // dot flickers to grey until the next poll.
                if (!state.openFiles[key][path]) {
                    state.openFiles[key][path] = createMessage(StatusSchema);
                }
            });
        },

        setStatus(input: { [p: string]: Status }) {
            set((state) => {
                const key = getContextKey();

                if (!state.openFiles[key]) return;

                for (const [file, value] of Object.entries(input)) {
                    // Only update tracked files whose status ACTUALLY changed:
                    // blindly assigning fresh message objects gives openFiles a
                    // new identity on every poll, which re-renders every dot —
                    // and re-triggers any effect depending on the store.
                    const existing = state.openFiles[key][file];
                    if (existing && !equals(StatusSchema, existing as Status, value)) {
                        state.openFiles[key][file] = value;
                    }
                }
            })
        }
    }))
);
