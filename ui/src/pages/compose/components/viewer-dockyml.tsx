import {callRPC, useHostClient} from "../../../lib/api.ts";import {DockyamlService} from "../../../gen/dockyaml/v1/dockyaml_pb.ts";
import {Box, Button, capitalize, Tooltip, Typography} from '@mui/material';
import {indicatorMap, type SaveState} from "../hooks/status-hook.tsx";
import {useConfig} from "../../../hooks/config.ts";
import {useState} from "react";
import EditorCommon from "./editor-common.tsx";

const dockyamlFilePath = "dockman.yml";

export function formatDockyaml(alias: string, host: string) {
    return `${alias}/${host}.${dockyamlFilePath}`;
}

function stringToArrayBuffer(str: string): Uint8Array<ArrayBuffer> {
    const encoder = new TextEncoder();
    return encoder.encode(str);
}

function bytesToString(bytes?: Uint8Array): string {
    if (!bytes) {
        return "";
    }

    return new TextDecoder('utf-8').decode(bytes);
}

function DockyamlViewer({filename}: { filename: string }) {
    const dockYamlClient = useHostClient(DockyamlService);

    const {fetchDockmanYaml} = useConfig()

    const [saveStatus, setSaveStatus] = useState<SaveState>('idle')

    const refreshFile = async () => {
        await getFile()
    }

    const getFile = async (): Promise<{ contents: string; err: string }> => {
        const {val, err} = await callRPC(() => dockYamlClient.get({}))
        return {
            contents: bytesToString(val?.contents),
            err: err
        }
    };

    const saveFile = async (_: string, newContent: string): Promise<string> => {
        const {err} = await callRPC(() =>
            dockYamlClient.save({contents: stringToArrayBuffer(newContent)})
        );
        return err
    };

    return (
        <Box sx={{
            height: '100%',
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            bgcolor: '#1e1e1e'
        }}>
            <Box sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                px: 2,
                py: 0.75,
                borderBottom: 1,
                borderColor: 'divider',
                bgcolor: 'background.default'
            }}>
                {/* Left Side: Status & Filename */}
                <Box sx={{display: 'flex', alignItems: 'center', gap: 1.5}}>
                    <Tooltip title={"Refetch the file"}>
                        <Button
                            size="small"
                            variant="outlined"
                            color="warning"
                            onClick={refreshFile}
                            // startIcon={<Refresh sx={{fontSize: 16}}/>}
                            sx={{fontSize: '0.75rem', textTransform: 'none'}}
                        >
                            Reload
                        </Button>
                    </Tooltip>

                    <Tooltip title={"Apply the new config"}>
                        <Button
                            size="small"
                            variant="outlined"
                            color="info"
                            disableElevation
                            onClick={fetchDockmanYaml}
                            sx={{fontSize: '0.75rem', textTransform: 'none'}}
                        >
                            Apply
                        </Button>
                    </Tooltip>

                    <Typography variant="caption" sx={{
                        px: 1,
                        py: 0.2,
                        borderRadius: 1,
                        bgcolor: 'transparent',
                        borderColor: indicatorMap[saveStatus].color,
                        color: indicatorMap[saveStatus].color,
                        fontWeight: 'bold',
                        border: '1px solid',
                    }}>
                        {capitalize(saveStatus)}
                    </Typography>
                </Box>
            </Box>

            <EditorCommon
                filename={filename}
                setFileSaveStatus={setSaveStatus}
                getFile={getFile}
                saveFile={saveFile}
            />
        </Box>
    )
}

export default DockyamlViewer;
