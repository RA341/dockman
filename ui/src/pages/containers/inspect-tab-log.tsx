import {useCallback, useRef} from 'react';
import {FitAddon} from "@xterm/addon-fit";
import AppTerminal from "../compose/components/logs-terminal.tsx";
import {createTab} from "../compose/state/terminal.tsx";
import {useContainerLogsWsUrl} from "../../lib/api.ts";

const InspectTabLog = ({containerID}: { containerID: string }) => {
    const fitAddonRef = useRef<FitAddon>(new FitAddon());
    const getLogUrl = useContainerLogsWsUrl()

    const getLogTab = useCallback(() => {
        const url = getLogUrl(containerID)
        return createTab(url, `Logs: ${containerID}`, false)
    }, [containerID, getLogUrl])

    return (
        <AppTerminal
            {...getLogTab()}
            fit={fitAddonRef}
            isActive={true}
        />
    );
};

export default InspectTabLog;