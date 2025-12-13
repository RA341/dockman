import {type ReactNode, useCallback, useEffect, useState} from 'react'
import {useLocation, useNavigate} from 'react-router-dom'
import {callRPC, useClient} from "../lib/api.ts";
import {FilesContext, type FilesContextType} from "../hooks/files.ts";
import {useHost} from "../hooks/host.ts";
import {useSnackbar} from "../hooks/snackbar.ts";
import {FileService, type FsEntry} from '../gen/files/v1/files_pb.ts';
import {useTabs} from "../hooks/tabs.ts";
import {useOpenFiles} from "../pages/compose/state/state.tsx";
import {useAlias} from "./alias-context.tsx";

export function FilesProvider({children}: { children: ReactNode }) {
    const client = useClient(FileService)
    const {showError, showSuccess} = useSnackbar()
    const navigate = useNavigate()
    const {selectedHost} = useHost()
    const location = useLocation()

    const {closeTab} = useTabs()
    const {activeAlias} = useAlias()

    const [files, setFiles] = useState<FsEntry[]>([])
    const [isLoading, setIsLoading] = useState(true)

    const fetchFiles = useCallback(async (
            path: string = "",
            entryInsertIndex: number[] = [],
        ) => {
            if (!path) {
                // first load empty filelist
                setIsLoading(true)
            }

            const {val, err} = await callRPC(() => client.list({
                path: path,
                alias: activeAlias
            }))
            if (err) {
                showError(err)
                setFiles([])
            } else if (val) {
                // entryInsertIndex of 1 is at root
                if (entryInsertIndex.length < 1) {
                    // console.log("inserting at root")
                    setFiles(val.entries)
                } else {
                    // console.log(`inserting at ${entryInsertIndex}`)
                    // sub index
                    setFiles(prevState => {
                        const newList = [...prevState]
                        insertAtNestedIndex(newList, entryInsertIndex, val.entries)
                        return newList
                    })
                }
            }

            setIsLoading(false)
        },
        [client, selectedHost, activeAlias, showError]);

    const closeFolder = useOpenFiles(state => state.delete)

    const addFile = useCallback(async (
        filename: string,
        isDir: boolean,
        entryInsertIndex?: number[]
    ) => {
        const {err} = await callRPC(() => client.create({filename, isDir, alias: activeAlias}))
        if (err) {
            showError(err)
            return
        } else {
            if (!isDir) {
                navigate(`/stacks/${filename}`)
            }
            showSuccess(`Created ${filename}`)
        }
        await fetchFiles(getDir(filename), entryInsertIndex)
    }, [client, fetchFiles, navigate])

    const deleteFile = async (
        filename: string,
        entryInsertIndex?: number[]
    ) => {
        const {err} = await callRPC(() => client.delete({filename, alias: activeAlias}))
        if (err) {
            showError(err)
        } else {
            showSuccess(`Deleted ${filename}`)
            closeFolder(filename)
            closeTab(filename)
        }

        // Slice off the last index to get the PARENT folder's index not needed on insert
        const parentFolderIndex = entryInsertIndex ? entryInsertIndex.slice(0, -1) : [];

        await fetchFiles(getDir(filename), parentFolderIndex)
    }

    const renameFile = async (
        oldFilename: string,
        newFileName: string,
    ) => {
        const {err} = await callRPC(() => client.rename({
            newFilePath: newFileName,
            oldFilePath: oldFilename,
            alias: activeAlias
        }))
        if (err) {
            showError(err)
        } else {
            showSuccess(`${oldFilename} renamed to ${newFileName}`)
            closeTab(oldFilename)
            const currentPath = location.pathname
            if (currentPath === `/stacks/${oldFilename}`) {
                navigate(`/stacks/${newFileName}`)
            }
        }

        await fetchFiles("", [])
    }

    useEffect(() => {
        fetchFiles().then()
    }, [fetchFiles])

    const value: FilesContextType = {
        files,
        isLoading,
        addFile,
        deleteFile,
        renameFile,
        listFiles: fetchFiles,
        refetch: async () => fetchFiles(),
    }

    return (
        <FilesContext.Provider value={value}>
            {children}
        </FilesContext.Provider>
    )
}


function insertAtNestedIndex(list: FsEntry[], indices: number[], value: FsEntry[]): void {
    if (indices.length === 0) return;

    let current: FsEntry[] | null = list;

    // Navigate to the parent using all indices except the last one
    for (let i = 0; i < indices.length - 1; i++) {
        const index = indices[i];
        if (!current || !current[index] || !current[index].subFiles) {
            console.error('Invalid path at index', i);
            return;
        }
        current = current[index].subFiles;
    }

    // Set the value at the final index
    const lastIndex = indices[indices.length - 1];
    if (!current || !current[lastIndex]) {
        console.error('Invalid final index', lastIndex);
        return;
    }

    current[lastIndex].isFetched = true;
    current[lastIndex].subFiles = value;
}

export function getDir(filePath: string): string {
    const lastSlash = filePath.lastIndexOf('/');
    if (lastSlash === -1) return '';
    if (lastSlash === 0) return '';
    return filePath.substring(0, lastSlash);
}
