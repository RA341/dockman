import {useCallback, useEffect, useMemo, useState} from "react";
import {Box, CircularProgress, List, ListItemButton, ListItemText, Typography} from "@mui/material";
import {Check} from "@mui/icons-material";
import {type Commit, GitService} from "../../../gen/git/v1/git_pb.ts";
import {callRPC, useClient} from "../../../lib/api.ts";
import {useSnackbar} from "../../../hooks/snackbar.ts";

interface CommitListProps {
    selectedFile: string;
    selectedCommit: string;
    chooseCommit: (commit: string) => void;
}

export function GitCommitListOld({selectedFile, selectedCommit, chooseCommit}: CommitListProps) {
    const gitClient = useClient(GitService);
    const {showError} = useSnackbar();
    const [commits, setCommits] = useState<Commit[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchCommitCallback = useCallback(async () => {
        if (!selectedFile) {
            setCommits([]);
            setLoading(false);
            return;
        }
        setLoading(true);
        const {val, err} = await callRPC(() => gitClient.listCommits({name: selectedFile}));
        if (err) {
            showError(String(err));
            setCommits([]);
        } else {
            setCommits(val?.commits ?? []);
        }
        setLoading(false);
    }, [gitClient, selectedFile, showError]);

    useEffect(() => {
        fetchCommitCallback().then();
    }, [fetchCommitCallback]);

    const sortedCommits = useMemo(() => {
        return [...commits].sort((a, b) => new Date(b.when).getTime() - new Date(a.when).getTime());
    }, [commits]);

    const handleChooseCommit = (commitHash: string) => {
        if (commitHash === selectedCommit) {
            chooseCommit("");
        } else {
            chooseCommit(commitHash);
        }
    };

    if (loading) {
        return (
            <Box sx={{display: 'flex', justifyContent: 'center', alignItems: 'center', p: 2}}>
                <CircularProgress size={24}/>
            </Box>
        );
    }

    if (commits.length === 0) {
        return (
            <Box sx={{p: 2, textAlign: 'center'}}>
                <Typography variant="body2" sx={{
                    color: "text.secondary"
                }}>No commit history.</Typography>
            </Box>
        );
    }

    return (
        <List dense disablePadding>
            {sortedCommits.map((commit) => (
                <ListItemButton
                    key={commit.hash}
                    divider
                    onClick={() => handleChooseCommit(commit.hash)}
                    selected={commit.hash === selectedCommit}
                    sx={{
                        py: 1,
                        px: 1.5,
                        border: 1,
                        borderColor: 'divider',
                        borderRadius: 1,
                        mb: 0.5,
                        display: 'flex',
                        justifyContent: 'space-between',
                        transition: 'background-color 0.2s',
                        '&.Mui-selected': {
                            backgroundColor: 'action.selected',
                            borderColor: 'primary.main',
                        },
                        '&:hover': {
                            backgroundColor: 'action.hover',
                            cursor: 'pointer',
                        },
                    }}
                >
                    <ListItemText
                        primary={
                            <Typography variant="body2" component="div" sx={{fontFamily: 'monospace'}}>
                                {commit.hash.substring(0, 7)}
                            </Typography>
                        }
                        secondary={
                            <Typography variant="caption" component="div">
                                {new Date(commit.when).toLocaleDateString()}
                            </Typography>
                        }
                        sx={{m: 0}}
                    />
                    {commit.hash === selectedCommit && <Check fontSize="small" color="primary"/>}
                </ListItemButton>
            ))}
        </List>
    );
}
