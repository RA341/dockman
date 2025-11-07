import {Delete, PlayArrow, RestartAlt, Stop, Update} from "@mui/icons-material";
import {atom} from "jotai";

export const sideBarState = atom(false);

export const openFiles = atom(new Set<string>())


export const deployActionsConfig = [
    {name: 'start', rpcName: 'composeStart', message: "started", icon: <PlayArrow/>},
    {name: 'stop', rpcName: 'composeStop', message: "stopped", icon: <Stop/>},
    {name: 'remove', rpcName: 'composeRemove', message: "removed", icon: <Delete/>},
    {name: 'restart', rpcName: 'composeRestart', message: "restarted", icon: <RestartAlt/>},
    {name: 'update', rpcName: 'composeUpdate', message: "updated", icon: <Update/>},
] as const;


export interface LogTab {
    id: string;
    title: string;
    stream: AsyncIterable<string>;
    controller: AbortController;
    inputFn?: (cmd: string) => void,
}

export const activeActionAtom = atom<string | null>(null)
export const openTerminalsAtom = atom<LogTab[]>([])
export const activeTerminalAtom = atom<string | null>(null)
export const isTerminalPanelOpenAtom = atom(true)

export const closeTerminalAtom = atom(
    null, // This atom has no read value
    (get, set, tabIdToClose: string) => {
        const allTabs = get(openTerminalsAtom);
        const activeTabId = get(activeTerminalAtom);

        const tabToClose = allTabs.find(tab => tab.id === tabIdToClose);
        if (tabToClose) {
            tabToClose.controller.abort("Tab closed by user");
        }

        const remainingTabs = allTabs.filter(tab => tab.id !== tabIdToClose);

        if (activeTabId === tabIdToClose) {
            if (remainingTabs.length > 0) {
                // If there are tabs left, make the last one active
                const newActiveTabId = remainingTabs[remainingTabs.length - 1].id;
                set(activeTerminalAtom, newActiveTabId);
            } else {
                // If no tabs are left, clear the active ID and minimize the panel
                set(activeTerminalAtom, null);
                set(isTerminalPanelOpenAtom, true);
            }
        }

        set(openTerminalsAtom, remainingTabs);
    }
);