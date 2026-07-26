import {create} from 'zustand'
import {persist} from 'zustand/middleware'

interface EditorSaveState {
    // when true, files are saved automatically as you type (legacy behaviour)
    // when false, files must be saved explicitly (save button or CTRL+S)
    autoSave: boolean
    toggleAutoSave: () => void

    // filename -> has changes that are not yet persisted
    dirtyFiles: Record<string, boolean>
    setDirty: (filename: string, dirty: boolean) => void

    // filename -> callback that flushes pending changes to the backend
    savers: Record<string, () => Promise<void>>
    registerSaver: (filename: string, save: () => Promise<void>) => void
    unregisterSaver: (filename: string) => void
}

export const useEditorSave = create<EditorSaveState>()(
    persist(
        (set) => ({
            autoSave: true,
            toggleAutoSave: () => set(state => ({autoSave: !state.autoSave})),

            dirtyFiles: {},
            setDirty: (filename, dirty) => set(state => ({
                dirtyFiles: {...state.dirtyFiles, [filename]: dirty}
            })),

            savers: {},
            registerSaver: (filename, save) => set(state => ({
                savers: {...state.savers, [filename]: save}
            })),
            unregisterSaver: (filename) => set(state => {
                const savers = {...state.savers}
                delete savers[filename]
                const dirtyFiles = {...state.dirtyFiles}
                delete dirtyFiles[filename]
                return {savers, dirtyFiles}
            }),
        }),
        {
            name: 'dockman-editor-save',
            partialize: (state) => ({autoSave: state.autoSave}),
        }
    )
)
