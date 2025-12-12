import {createContext, useContext} from "react";
import type {FsEntry} from "../gen/files/v1/files_pb.ts";

export interface FilesContextType {
    files: FsEntry[]
    isLoading: boolean
    addFile: (filename: string, isDir: boolean, entryInsertIndex?: number[]) => Promise<void>
    deleteFile: (filename: string, entryInsertIndex?: number[]) => Promise<void>
    renameFile: (olfFilename: string, newFile: string, entryInsertIndex?: number[]) => Promise<void>
    listFiles: (path?: string, entryInsertIndex?: number[]) => Promise<void>
    refetch: () => Promise<void>
}

export const FilesContext = createContext<FilesContextType | undefined>(undefined)

export function useFiles() {
    const context = useContext(FilesContext)
    if (context === undefined) {
        throw new Error('useFiles must be used within a FilesProvider')
    }
    return context
}