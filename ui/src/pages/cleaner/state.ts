import {CleanerService, type PruneConfig} from "../../gen/cleaner/v1/cleaner_pb.ts";
import {create} from "zustand";
import {callRPC} from "../../lib/api.ts";
import type {Client} from "@connectrpc/connect";

export type CleanerConfig = Omit<PruneConfig, "$typeName" | "$unknown">

export const useCleanerConfig = create<{
    config: CleanerConfig | null;
    err: string | null;
    isLoading: boolean;
    SetField: <K extends keyof CleanerConfig>(field: K, value: CleanerConfig[K]) => void;
    Fetch: (client: Client<typeof CleanerService>) => Promise<void>;
    Save: (client: Client<typeof CleanerService>, showErr: (err: string) => void, onSuccess: () => void) => Promise<void>;
}>((set, get) => ({
    config: null,
    err: null,
    isLoading: false,
    Save: async (client, showErr, onSuccess) => {
        if (!get().config) {
            console.warn("No prev config found");
            return;
        }

        const {val, err} = await callRPC(() => client.editConfig({config: get().config!}))
        if (err) {
            showErr(err)
        } else {
            set({config: val?.config ?? null})
            onSuccess()
        }
    },
    Fetch: async (client) => {
        set({isLoading: true})

        const {val, err} = await callRPC(() => client.getConfig({}))
        if (err) {
            set({err: err});
        } else {
            set({config: val?.config});
        }

        set({isLoading: false})
    }
    ,
    SetField: (field, value) => {
        set(state => ({
            config: state.config ? {
                ...state.config,
                [field]: value
            } : null
        }))
    }
}))
