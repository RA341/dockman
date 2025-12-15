import {createContext, type ReactNode, useCallback, useContext, useEffect, useState} from 'react'
import {useLocation, useNavigate} from 'react-router-dom'
import {API_URL, callRPC, hosRef, useFileClient} from "../lib/api.ts";
import {useSnackbar} from "../hooks/snackbar.ts";
import {type FsEntry} from '../gen/files/v1/files_pb.ts';
import {useFileComponents, useOpenFiles} from "../pages/compose/state/state.tsx";
import {useTabs} from "./tab-context.tsx";
import {useHost} from "../pages/home/home.tsx";
import {useEditorUrl} from "../lib/editor.ts";

export interface FilesContextType {
    files: FsEntry[]
    isLoading: boolean

    addFile: (filename: string, isDir: boolean) => Promise<void>
    deleteFile: (filename: string) => Promise<void>
    renameFile: (oldFilename: string, newFile: string) => Promise<void>
    listFiles: (path: string, depthIndex: number[]) => Promise<void>

    uploadFile: (filename: string, contents: string) => Promise<string>
    downloadFile: (filename: string) => Promise<{ file: string; err: string }>
}

export const FilesContext = createContext<FilesContextType | undefined>(undefined)

export function useFiles() {
    const context = useContext(FilesContext)
    if (context === undefined) {
        throw new Error('useFiles must be used within a FilesProvider')
    }
    return context
}

export function getDir(filePath: string): string {
    const lastSlash = filePath.lastIndexOf('/');
    if (lastSlash === -1) return '';
    if (lastSlash === 0) return '';
    return filePath.substring(0, lastSlash);
}

function FilesProvider({children}: { children: ReactNode }) {
    const client = useFileClient()
    const {showError, showSuccess} = useSnackbar()
    const navigate = useNavigate()
    const location = useLocation()

    const {closeTab} = useTabs()

    const [files, setFiles] = useState<FsEntry[]>([])
    const [isLoading, setIsLoading] = useState(true)

    const host = useHost()
    const {alias} = useFileComponents()

    const fetchFiles = useCallback(async (
            path: string = "",
            depthIndex: number[] = []
        ) => {
            if (!path) {
                // empty filelist show full spinner
                setIsLoading(true)
            }

            if (path === "") {
                path = `${alias}`
            }

            const {val, err} = await callRPC(() => client.list({
                path: path,
            }))
            if (err) {
                showError(err)
                setFiles([])
            } else if (val) {
                setFiles(prevState => {
                    if (depthIndex.length < 1) {
                        return val.entries
                    } else {
                        const newList = [...prevState]
                        insertAtNestedIndex(newList, depthIndex, val.entries)
                        return newList
                    }
                })
            }

            setIsLoading(false)
        },
        [alias, host, client]);

    const closeFolder = useOpenFiles(state => state.delete)
    const fileUrl = useEditorUrl()

    const addFile = useCallback(async (
        filename: string,
        isDir: boolean,
    ) => {
        const {err} = await callRPC(() => client.create({filename, isDir}))
        if (err) {
            showError(err)
            return
        } else {
            if (!isDir) {
                navigate(fileUrl(filename))
            }
            showSuccess(`Created ${filename}`)
        }

        await fetchFiles("",)
    }, [client, fetchFiles, host, navigate])

    const deleteFile = async (
        filename: string,
    ) => {
        const {err} = await callRPC(() => client.delete({filename}))
        if (err) {
            showError(err)
        } else {
            showSuccess(`Deleted ${filename}`)
            closeFolder(filename)
            closeTab(filename)
        }

        await fetchFiles("")
    }

    const renameFile = async (
        oldFilename: string,
        newFileName: string,
    ) => {
        const {err} = await callRPC(() => client.rename({
            newFilePath: newFileName,
            oldFilePath: oldFilename,
        }))
        if (err) {
            showError(err)
        } else {
            showSuccess(`${oldFilename} renamed to ${newFileName}`)
            closeTab(oldFilename)
            const currentPath = location.pathname
            if (currentPath === oldFilename) {
                navigate(newFileName)
            }
        }

        await fetchFiles("")
    }


    async function uploadFile(filename: string, contents: string): Promise<string> {
        try {
            const formData = new FormData();
            const file = new File([contents], filename);

            formData.append('contents', file, btoa(filename));

            const response = await fetch(`${API_URL}/api/file/save`, {
                method: 'POST',
                body: formData,
                headers: {DOCKER_HOST: hosRef.dockerHost}
            });

            if (!response.ok) {
                const errorText = await response.text();
                return `Server error: ${response.status} ${response.statusText} - ${errorText}`
            }

            console.log(`Uploaded ${file}, response status: ${response.status}`);
            return "";
        } catch (error: unknown) {
            // fucking exceptions so useless
            if (error instanceof Error) {
                console.error("Fetch error:", error.message);
                return `Server error: ${error.message}`;
            } else {
                console.error(`An unknown error occurred ${error}`)
                return `An unknown error occurred check browser logs`
            }
        }
    }

    async function downloadFile(filename: string): Promise<{ file: string; err: string }> {
        const subPath = `api/file/load/${encodeURIComponent(filename)}`
        try {
            const response = await fetch(`${API_URL}/${subPath}`, {
                cache: 'no-cache',
                headers: {DOCKER_HOST: hosRef.dockerHost}
            });
            if (!response.ok) {
                return {file: "", err: `Failed to download file: ${response.status} ${response.statusText}`};
            }
            const fileData = await response.text()
            return {file: fileData, err: ""};
        } catch (error: unknown) {
            console.error(`Error: ${(error as Error).toString()}`);
            return {file: "", err: (error as Error).toString()};
        }
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
        uploadFile,
        downloadFile,
    }

    return (
        <FilesContext.Provider value={value}>
            {children}
        </FilesContext.Provider>
    )
}

export default FilesProvider

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