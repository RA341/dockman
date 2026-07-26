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

    // filename -> latest unsaved content, kept in memory so switching tabs
    // does not discard edits that have not been written to disk yet
    drafts: Record<string, string>
    setDraft: (filename: string, content: string) => void
    clearDraft: (filename: string) => void

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

            drafts: {},
            setDraft: (filename, content) => set(state => ({
                drafts: {...state.drafts, [filename]: content}
            })),
            clearDraft: (filename) => set(state => {
                const drafts = {...state.drafts}
                delete drafts[filename]
                return {drafts}
            }),

            savers: {},
            registerSaver: (filename, save) => set(state => ({
                savers: {...state.savers, [filename]: save}
            })),
            // only drop the save callback when the editor unmounts.
            // dirty state and drafts are kept so the "unsaved" marker and the
            // in-memory content survive switching between tabs.
            unregisterSaver: (filename) => set(state => {
                const savers = {...state.savers}
                delete savers[filename]
                return {savers}
            }),
        }),
        {
            name: 'dockman-editor-save',
            partialize: (state) => ({autoSave: state.autoSave}),
        }
    )
)
