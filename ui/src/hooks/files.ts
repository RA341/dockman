import {useCallback, useEffect, useState} from 'react';
import {callRPC, useClient} from '../lib/api';
import {FileService} from '../gen/files/v1/files_pb';
import {useSnackbar} from './snackbar.ts';
import {useNavigate} from 'react-router-dom';
import {useHost} from "./host.ts";

export interface FileGroup {
    name: string;
    children: string[];
}

export function useFiles() {
    const navigate = useNavigate();
    const client = useClient(FileService);
    const {showError, showSuccess} = useSnackbar();
    const {selectedHost} = useHost()


    const [files, setFiles] = useState<FileGroup[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const fetchFiles = useCallback(async () => {
        setIsLoading(true);
        const {val, err} = await callRPC(() => client.list({}));
        if (err) {
            showError(err);
            setFiles([]);
        } else if (val) {
            const res = val.groups.map<FileGroup>(group => ({
                name: group.root,
                children: group.subFiles
            }));
            setFiles(res);
        }
        setIsLoading(false);
    }, [client, selectedHost]);

    useEffect(() => {
        fetchFiles().then();
    }, [fetchFiles]);

    const addFile = useCallback(async (filename: string, parent: string) => {
        if (parent) {
            filename = `${parent}/${filename}`
        }
        console.log("Creating new file...", filename);

        const {err} = await callRPC(() => client.create({filename: filename}));
        if (err) {
            showError(`Error saving file: ${err}`);
        } else {
            showSuccess(`${filename} created.`);
            await fetchFiles(); // Refetch after successful creation
            navigate(`/files/${filename}`);
        }
        // do not add showError, showSuccess will cause infinite refreshes if request fails
    }, [client]);

    const deleteFile = useCallback(async (filename: string, currentPath: string) => {
        const {err} = await callRPC(() => client.delete({filename}));
        if (err) {
            showError(`Error deleting file: ${err}`);
        } else {
            showSuccess(`${filename} deleted.`);
            // If the user is currently viewing the deleted file, navigate away
            if (currentPath.startsWith(`/files/${filename}`)) {
                navigate('/');
            }
            await fetchFiles(); // Refetch after successful deletion
        }
        // do not add showError, showSuccess will cause infinite refreshes if request fails
    }, [client, fetchFiles]);

    return {files, isLoading, addFile, deleteFile, refetch: fetchFiles};
}
