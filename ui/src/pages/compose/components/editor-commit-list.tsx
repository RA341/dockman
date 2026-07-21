import {useCallback, useEffect, useMemo, useState} from "react"
import {
    Accordion,
    AccordionDetails,
    AccordionSummary,
    Box,
    CircularProgress,
    IconButton,
    Tooltip,
    Typography
} from "@mui/material"
import {Circle} from "@mui/icons-material"
import {callRPC, useClient} from "../../../lib/api.ts";
import {type Commit, GitService} from "../../../gen/git/v1/git_pb.ts";
import {useSnackbar} from "../../../hooks/snackbar.ts";

interface CommitListProps {
    selectedFile: string
    selectedCommit: string
    chooseCommit: (commit: string) => void
}

interface GroupedCommits {
    [date: string]: Commit[]
}

export function EditorCommitList({selectedFile, selectedCommit, chooseCommit}: CommitListProps) {
    const gitClient = useClient(GitService)
    const {showError} = useSnackbar()
    const [commits, setCommits] = useState<Commit[]>([])
    const [loading, setLoading] = useState(true)
    const [expandedDate, setExpandedDate] = useState<string | false>(false)

    const fetchCommitCallback = useCallback(async () => {
        if (!selectedFile) {
            setCommits([])
            setLoading(false)
            return
        }
        setLoading(true)
        const {val, err} = await callRPC(() => gitClient.listCommits({name: selectedFile}))
        if (err) {
            showError(String(err))
            setCommits([])
        } else {
            setCommits(val?.commits ?? [])
        }
        setLoading(false)
    }, [gitClient, selectedFile, showError])

    useEffect(() => {
        fetchCommitCallback().then()
    }, [fetchCommitCallback])

    const groupedCommits = useMemo(() => {
        const sortedCommits = [...commits].sort((a, b) => new Date(b.when).getTime() - new Date(a.when).getTime())

        return sortedCommits.reduce((acc: GroupedCommits, commit) => {
            const commitDate = new Date(commit.when).toLocaleDateString(undefined, {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
            })
            if (!acc[commitDate]) {
                acc[commitDate] = []
            }
            acc[commitDate].push(commit)
            return acc
        }, {})
    }, [commits])

    // Set the latest date group to be expanded by default
    useEffect(() => {
        const firstDate = Object.keys(groupedCommits)[0]
        if (firstDate) {
            setExpandedDate(firstDate)
        } else {
            setExpandedDate(false)
        }
    }, [groupedCommits])


    const handleAccordionChange = (date: string) => (_: React.SyntheticEvent, isExpanded: boolean) => {
        setExpandedDate(isExpanded ? date : false)
    }

    const handleShowDiff = (commitHash: string) => {
        if (commitHash === selectedCommit) {
            // clear hash if already selected
            chooseCommit("")
        } else {
            chooseCommit(commitHash)
        }
    }

    if (loading) {
        return (
            <Box sx={{display: 'flex', justifyContent: 'center', alignItems: 'center', p: 4}}>
                <CircularProgress/>
            </Box>
        )
    }

    if (Object.keys(groupedCommits).length === 0) {
        return (
            <Box sx={{p: 2, textAlign: 'center'}}>
                <Typography sx={{
                    color: "text.secondary"
                }}>No commit history found for this file.</Typography>
            </Box>
        );
    }

    return (
        <Box>
            {Object.entries(groupedCommits).map(([date, commitsOnDate]) => (
                <Accordion
                    key={date}
                    expanded={expandedDate === date}
                    onChange={handleAccordionChange(date)}
                    disableGutters
                    elevation={0}
                    sx={{
                        '&:before': {display: 'none'},
                        backgroundColor: 'transparent',
                    }}
                >
                    <AccordionSummary
                        aria-controls={`panel-content-${date}`}
                        id={`panel-header-${date}`}
                        sx={{
                            flexDirection: 'column',
                            alignItems: 'center',
                            py: 1,
                            px: 0,
                            '& .MuiAccordionSummary-content': {
                                margin: 0
                            }
                        }}
                    >
                        {expandedDate === date ?
                            <Typography variant="subtitle1" component="div">{date}</Typography>
                            :
                            <Tooltip title={`Expand commits for ${date}`} placement="right">
                                <Circle sx={{fontSize: '24px'}}/>
                            </Tooltip>
                        }
                    </AccordionSummary>
                    <AccordionDetails sx={{
                        p: '8px 0',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center'
                    }}>
                        {commitsOnDate.map((commit) => (
                            <Tooltip
                                key={commit.hash}
                                title={`${commit.message} at ${new Date(commit.when).toLocaleTimeString()}`}
                                placement="right"
                            >
                                <IconButton
                                    onClick={() => handleShowDiff(commit.hash)}
                                    color={commit.hash === selectedCommit ? 'primary' : 'default'}
                                    size="small"
                                >
                                    <Circle sx={{fontSize: '12px'}}/>
                                </IconButton>
                            </Tooltip>
                        ))}
                    </AccordionDetails>
                </Accordion>
            ))}
        </Box>
    )
}
