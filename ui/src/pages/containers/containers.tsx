import {Box} from '@mui/material';
import {Delete, PlayArrow, RestartAlt, Stop, Update} from '@mui/icons-material';
import {ContainerTable} from '../compose/components/container-info-table';
import {useMemo, useState} from "react";
import {useDockerContainers} from "../../hooks/docker-containers.ts";
import {callRPC, useClient} from "../../lib/api.ts";
import {DockerService} from "../../gen/docker/v1/docker_pb.ts";
import {useSnackbar} from "../../hooks/snackbar.ts";
import SearchBar from "../../components/search-bar.tsx";
import useSearch from "../../hooks/search.ts";
import ActionButtons from "../../components/action-buttons.tsx";
import {LogsDialogProvider} from "./logs-dialog/logs-context.tsx";
import {useLogsDialog} from "./logs-dialog/logs-hook.ts";
import {useExecDialog} from "./exec-dialog/exec-hook.ts";
import {ExecDialogProvider} from "./exec-dialog/exec-context.tsx";

function ContainersPage() {
    return (
        <ExecDialogProvider>
            <LogsDialogProvider>
                <CorePage/>
            </LogsDialogProvider>
        </ExecDialogProvider>
    );
}

function CorePage() {
    const dockerService = useClient(DockerService)
    const {containers, loading, fetchContainers} = useDockerContainers();
    const {showSuccess, showError} = useSnackbar()

    const {search, setSearch, searchInputRef} = useSearch()
    const {showDialog: showLogsDialog} = useLogsDialog()
    const {showDialog: showExecDialog} = useExecDialog()

    const [selectedContainers, setSelectedContainers] = useState<string[]>([])

    const actions = [
        {
            action: 'start',
            buttonText: "Start",
            icon: <PlayArrow/>,
            disabled: selectedContainers.length === 0,
            handler: async () => {
                await handleContainerAction('start', 'containerStart', "started")
            },
            tooltip: "",
        },
        {
            action: 'stop',
            buttonText: "Stop",
            icon: <Stop/>,
            disabled: selectedContainers.length === 0,
            handler: async () => {
                await handleContainerAction('stop', 'containerStop', "stopped")
            },
            tooltip: "",
        },
        {
            action: 'remove',
            buttonText: "Remove",
            icon: <Delete/>,
            disabled: selectedContainers.length === 0,
            handler: async () => {
                await handleContainerAction('remove', 'containerRemove', "removed")
            },
            tooltip: "",
        },
        {
            action: 'restart',
            buttonText: "Restart",
            icon: <RestartAlt/>,
            disabled: selectedContainers.length === 0,
            handler: async () => {
                await handleContainerAction('restart', 'containerRestart', "restarted")
            },
            tooltip: "",
        },
        {
            action: 'update',
            buttonText: "Update",
            icon: <Update/>,
            disabled: selectedContainers.length === 0,
            handler: async () => {
                await handleContainerAction('update', 'containerUpdate', "updated")
            },
            tooltip: "",
        },
    ];

    async function handleContainerAction(
        name: string,
        rpcName: keyof typeof dockerService,
        message: string,
    ) {
        const {err} = await callRPC(
            // @ts-expect-error: type too complex to represent
            () => dockerService[rpcName]({
                containerIds: selectedContainers
            }) as Promise<never> // we don't care about the output only err
        )

        if (err) {
            console.error(err)
            showError(`Failed to ${name} Containers: ${err}`)
        } else {
            showSuccess(`Successfully ${message} containers`)
        }

        fetchContainers().then()
        setSelectedContainers([])
    }

    const filteredContainers = useMemo(() => {
        const lowerSearch = search.toLowerCase()

        if (search) {
            return containers.filter(cont =>
                cont.serviceName.toLowerCase().includes(lowerSearch) ||
                cont.imageName.toLowerCase().includes(lowerSearch) ||
                cont.stackName.toLowerCase().includes(lowerSearch) ||
                cont.name.toLowerCase().includes(lowerSearch)
            )
        }
        return containers;
    }, [containers, search]);


    return (
        <Box sx={{
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: 'background.default'
        }}>
            <Box sx={{
                flexGrow: 1,
                p: 3,
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden'
            }}>
                <Box sx={{
                    display: 'flex',
                    gap: 2,
                    flexWrap: 'wrap',
                    mb: 3,
                    flexShrink: 0
                }}>
                    <SearchBar
                        search={search}
                        setSearch={setSearch}
                        inputRef={searchInputRef}
                    />

                    <ActionButtons
                        actions={actions}
                        variant={"outlined"}
                    />
                </Box>

                <Box sx={{
                    height: '83vh', overflow: 'hidden', border: '3px ridge',
                    borderColor: 'rgba(255, 255, 255, 0.23)', borderRadius: 3, display: 'flex',
                    flexDirection: 'column', backgroundColor: 'rgb(41,41,41)'
                }}>
                    <ContainerTable
                        containers={filteredContainers}
                        loading={loading}
                        onShowLogs={showLogsDialog}
                        setSelectedServices={setSelectedContainers}
                        selectedServices={selectedContainers}
                        useContainerId={true}
                        onExec={showExecDialog}
                    />
                </Box>
            </Box>
        </Box>
    )
}

export default ContainersPage;