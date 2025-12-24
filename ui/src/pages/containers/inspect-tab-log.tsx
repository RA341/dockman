import {useCallback, useRef} from 'react';
import {FitAddon} from "@xterm/addon-fit";
import AppTerminal from "../compose/components/logs-terminal.tsx";
import {createTab} from "../compose/state/terminal.tsx";
import {getWSUrl} from "../../lib/api.ts";
import {useHostStore} from "../compose/state/files.ts";

const InspectTabLog = ({containerID}: { containerID: string }) => {
    const fitAddonRef = useRef<FitAddon>(new FitAddon());

    const selectedHost = useHostStore(state => state.host)

    const getLogTab = useCallback(() => {
        return createTab(
            getWSUrl(`api/docker/logs/${containerID}/${encodeURIComponent(selectedHost)}`),
            `Logs: ${containerID}`,
            false)
    }, [containerID, selectedHost])

    return (
        <AppTerminal
            {...getLogTab()}
            fit={fitAddonRef}
            isActive={true}
        />
    );
};

export default InspectTabLog;