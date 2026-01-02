import {Box, Button, Link, Typography} from '@mui/material';
import {useHostClient} from "../../../lib/api.ts";
import {ViewerService} from "../../../gen/viewer/v1/viewer_pb.ts";
import {useEffect, useState} from "react";
import {useFileComponents} from "../state/terminal.tsx";

const ViewerSqlite = () => {
    const viewerClient = useHostClient(ViewerService)

    const {filename, alias: activeAlias} = useFileComponents()

    const [iframeUrl, setIframeUrl] = useState("")
    const [sessionErr, setSessionErr] = useState("")
    const [reload, setReload] = useState(false)


    useEffect(() => {
        const controller = new AbortController();
        const startSession = async () => {
            setSessionErr("");
            setIframeUrl("");

            try {
                const sqliteStream = viewerClient.startSqliteSession({
                    path: {
                        filename: filename,
                        alias: activeAlias
                    }
                }, {signal: controller.signal});

                for await (const st of sqliteStream) {
                    if (controller.signal.aborted) {
                        return
                    }
                    setIframeUrl(st.url ?? "")
                }
            } catch (error: unknown) {
                if (controller.signal.aborted) {
                    return
                }
                let err: string
                if (error instanceof Error) {
                    err = error.message
                } else {
                    err = String(error)
                }
                setSessionErr(err)
            }
        }

        startSession().then();
        return () => {
            controller.abort();
        }
    }, [filename, activeAlias, viewerClient, reload]);

    return (
        <Box sx={{
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            width: '100%',
            overflow: 'hidden',
            p: 1
        }}>
            {sessionErr ? (
                <Box>
                    <Typography variant="h6">
                        {sessionErr}
                    </Typography>

                    <Button onClick={() => setReload(prevState => !prevState)}>
                        Retry
                    </Button>
                </Box>



            ) : (
                iframeUrl ? (
                    <Box
                        component="iframe"
                        src={iframeUrl}
                        title="Database Editor"
                        sx={{
                            flex: 1,
                            width: '100%',
                            border: 'none',
                            bgcolor: 'background.default'
                        }}
                    />
                ) : (
                    <Box display="flex" justifyContent="center" alignItems="center" minHeight="200px">
                        <Typography variant="h6">
                            Connecting to sqlite web ui...
                            <br/>
                            Go support the dev !!{' '}
                            <Link
                                href="https://github.com/coleifer/sqlite-web"
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                https://github.com/coleifer/sqlite-web
                            </Link>
                        </Typography>
                    </Box>
                )
            )}
        </Box>
    );
};

export default ViewerSqlite;