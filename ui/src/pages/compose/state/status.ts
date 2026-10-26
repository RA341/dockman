import {immer} from "zustand/middleware/immer";
import {getContextKey} from "../../../context/tab-context.tsx";
import {type Status, StatusSchema} from "../../../gen/docker/v1/docker_pb.ts";
import {create as createMessage} from "@bufbuild/protobuf";
import {create} from "zustand";

interface OpenFilesState {
    // contextKey -> Set of directory paths
    openFiles: Record<string, Record<string, Status>>;
    delete: (dir: string) => void;
    trackComposeStatus: (path: string) => void;
    setStatus: (status: { [p: string]: Status }) => void
}

export const useComposeFileState = create<OpenFilesState>()(
    immer((set) => ({
        openFiles: {},

        delete: (dir: string) => {
            const key = getContextKey();
            set((state) => {
                const openStatuses = state.openFiles[key];
                if (!openStatuses) {
                    return
                }

                for (const trackingFile of Object.keys(openStatuses)) {
                    if (trackingFile.startsWith(dir)) {
                        console.log(`Removing ${trackingFile} because ${dir} was closed`)
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

                state.openFiles[key][path] = createMessage(StatusSchema);
            });
        },

        setStatus(input: { [p: string]: Status }) {
            set((state) => {
                const key = getContextKey();

                if (!state.openFiles[key]) return;

                for (const [file, value] of Object.entries(input)) {
                    // Only update if file is still tracked
                    if (state.openFiles[key][file]) {
                        state.openFiles[key][file] = value;
                    }
                }
            })
        }
    }))
);
