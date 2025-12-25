import {createContext, type ReactNode, useCallback, useContext, useEffect, useState} from 'react'
import {useLocation, useNavigate} from 'react-router-dom'
import {API_URL, callRPC, hosRef, useFileClient} from "../lib/api.ts";
import {useSnackbar} from "../hooks/snackbar.ts";
import {type FsEntry} from '../gen/files/v1/files_pb.ts';
import {useTabs} from "./tab-context.tsx";
import {useEditorUrl} from "../lib/editor.ts";
import {useHostStore, useOpenFiles} from "../pages/compose/state/files.ts";
import {useFileComponents} from "../pages/compose/state/terminal.tsx";

export interface FilesContextType {
    files: FsEntry[]
    isLoading: boolean

    addFile: (filename: string, isDir: boolean) => Promise<void>
    copyFile: (srcFilename: string, destFilename: string, isDir: boolean) => Promise<void>
    deleteFile: (filename: string) => Promise<void>
    renameFile: (oldFilename: string, newFile: string) => Promise<void>
    listFiles: (path: string, depthIndex: number[]) => Promise<void>

    uploadFile: (filename: string, contents: File | string, upload?: boolean) => Promise<string>
    uploadFilesFromPC: (targetDir: string, files: File[]) => Promise<void>

    downloadFile: (filename: string, shouldDownload?: boolean) => Promise<{ file: string; err: string }>
}

export const FilesContext = createContext<FilesContextType | undefined>(undefined)
export const ErrFileNotSupported = "File is not supported"

export function useFiles() {
    const context = useContext(FilesContext)
    if (context === undefined) {
        throw new Error('useFiles must be used within a FilesProvider')
    }
    return context
}

function FilesProvider({children}: { children: ReactNode }) {
    const client = useFileClient()
    const {showError, showSuccess} = useSnackbar()
    const navigate = useNavigate()
    const location = useLocation()

    const {closeTab} = useTabs()

    const [files, setFiles] = useState<FsEntry[]>([])
    const [isLoading, setIsLoading] = useState(true)

    const host = useHostStore(state => state.host)
    // don't use alias store since its dependent on the React lifecycle
    // const alias = useAliasStore(state => state.alias)
    const {alias} = useFileComponents()

    const fetchFiles = useCallback(async (
        path: string = "",
        depthIndex: number[] = []
    ) => {
        if (depthIndex.length < 2) {
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
    }, [alias, host, client]);

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

        await fetchFiles()
    }, [client, fetchFiles, host, navigate])

    const copyFile = useCallback(async (srcFilename: string, destFilename: string, isDir: boolean) => {
        const {err} = await callRPC(() => client.copy({
            dest: {
                filename: srcFilename,
                isDir: isDir,
            },
            source: {
                filename: destFilename,
                isDir: isDir,
            },
        }))

        if (err) {
            showError(err)
        } else {
            if (!isDir) {
                navigate(fileUrl(destFilename))
            }
            showSuccess(`Copied ${destFilename}`)
        }

        await fetchFiles()
    }, [])


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

        await fetchFiles()
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

        await fetchFiles()
    }


    async function uploadFile(fullPath: string, content: File | string, isNew: boolean = false): Promise<string> {
        const url = `${API_URL}/api/file/save${isNew ? '?create=true' : ''}`;

        try {
            const formData = new FormData();

            const fileBlob = typeof content === 'string'
                // If it's a string (from editor), wrap it.
                ? new File([content], getEntryDisplayName(fullPath))
                // If it's already a File (from DnD), use it.
                : content;

            formData.append('contents', fileBlob, btoa(fullPath));

            const response = await fetch(url, {
                method: 'POST',
                body: formData,
                headers: {
                    'DOCKER_HOST': hosRef.dockerHost
                }
            });

            if (!response.ok) {
                const errorText = await response.text();
                return `Error: ${response.status} - ${errorText}`;
            }

            return "";
        } catch (error) {
            console.error("Upload failed:", error);
            return "Network error";
        }
    }

    const uploadFilesFromPC = async (targetDir: string, files: File[]) => {
        const results = await Promise.all(files.map(file => {
            const cleanDir = targetDir.endsWith('/') ? targetDir.slice(0, -1) : targetDir;
            const fullPath = `${cleanDir}/${file.name}`;
            return uploadFile(fullPath, file, true);
        }));

        const errors = results.filter(res => res !== "");
        if (errors.length > 0) {
            showError(`${errors.length} files failed to upload.`)
        } else {
            showSuccess(`Uploaded ${results.length} files`);
        }

        await fetchFiles("");
    };


    async function downloadFile(
        filename: string,
        shouldDownload: boolean = false
    ): Promise<{ file: string; err: string }> {
        const subPath = `api/file/load/${encodeURIComponent(filename)}?download=${shouldDownload}`;

        try {
            const response = await fetch(`${API_URL}/${subPath}`, {
                cache: 'no-cache',
                headers: {DOCKER_HOST: hosRef.dockerHost}
            });

            const bodyText = await response.text();
            if (!response.ok) {
                if (response.status === 409) {
                    return {file: "", err: `${ErrFileNotSupported}: ${response.status} ${bodyText}`};
                }
                return {file: "", err: `Failed to download file: ${response.status} ${bodyText}`};
            }


            if (shouldDownload) {
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');

                a.href = url;
                a.download = filename;
                document.body.appendChild(a);
                a.click();

                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);

                return {file: "", err: ""};
            }

            return {file: bodyText, err: ""};
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
        copyFile,
        deleteFile,
        renameFile,
        listFiles: fetchFiles,
        uploadFile,
        downloadFile,
        uploadFilesFromPC
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

export const getEntryDisplayName = (path: string) => {
    const split = path.split("/");
    const pop = split.pop();
    if (!pop) {
        console.error("unable to get last element in path", "split: ", split, "last element: ", pop)
        return "ERR_EMPTY_PATH"
    }
    return pop
}

export default FilesProvider
