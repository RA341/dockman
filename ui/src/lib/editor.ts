import type {TabDetails} from "../context/tab-context.tsx";
import {useCallback} from "react";
import {useLocation} from "react-router-dom";
import {useAliasStore, useHostStore} from "../pages/compose/state/files.ts";
import type {DockmanYaml} from "../gen/dockyaml/v1/dockyaml_pb.ts";

export const COMPOSE_EXTENSIONS = ['compose.yaml', 'compose.yml']

export function isComposeFile(filename: string): boolean {
    return COMPOSE_EXTENSIONS.some(ext => filename.endsWith(ext))
}

// Stack tab indexes by the names accepted in dockman.yml compose.defaultTab.
const STACK_TAB_INDEXES: Record<string, number> = {
    editor: 0,
    deploy: 1,
    stats: 2,
}

// Resolves the tab a file should open on when none is selected yet, per the
// compose.defaultTab setting in dockman.yml. Non-compose files only have an
// editor tab; unknown values fall back to the editor.
export function stackDefaultTab(dockYaml: DockmanYaml | null | undefined, filename?: string): number {
    if (!filename || !isComposeFile(filename)) return 0
    const name = dockYaml?.composePage?.defaultTab?.trim().toLowerCase() ?? ''
    return STACK_TAB_INDEXES[name] ?? 0
}

export const formatBytes = (bytes: number | bigint, decimals = 2) => {
    if (bytes === 0 || bytes === 0n) return '0 B'
    const k = 1024
    const dm = decimals < 0 ? 0 : decimals
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(Number(bytes)) / Math.log(k))
    return parseFloat((Number(bytes) / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i]
}


// Determines the color based on resource usage percentage.
// - Green for normal usage (< 70%)
// - Yellow for high usage (70-90%)
// - Red for critical usage (> 90%)
export const getUsageColor = (value: number): 'success.main' | 'warning.main' | 'error.main' => {
    if (value > 90) {
        return 'error.main' // Critical
    }
    if (value > 70) {
        return 'warning.main' // High
    }
    return 'success.main' // Normal
}


export const useEditorUrl = () => {
    const host = useHostStore(state => state.host)
    const prevAlias = useAliasStore(state => state.alias)
    const {pathname, search} = useLocation()

    return useCallback((filename?: string, tabDetail?: TabDetails | number, track: number = 0) => {
        const query = new URLSearchParams(search);
        let path = pathname;

        const tabKey = track === 0 ? "tab" : "splitTab";

        if (track === 0) {
            if (filename) {
                path = `/${host}/files/${filename}`;
                if (tabDetail === undefined) {
                    // Opening a file without an explicit tab: drop the tab
                    // inherited from the previous file so the view falls back
                    // to the dockman.yml compose.defaultTab setting.
                    query.delete(tabKey);
                }
            } else if (!pathname.includes("/files/")) {
                path = `/${host}/files/${prevAlias || "compose"}`;
            }
        } else {
            if (filename) {
                query.set("split", filename);
            } else {
                query.delete("split");
            }
        }

        if (tabDetail !== undefined) {
            const tabValue = typeof tabDetail === 'number' ? tabDetail : (tabDetail.subTabIndex ?? 0);
            query.set(tabKey, tabValue.toString());
        }

        const queryString = query.toString();
        const res = queryString ? `${path}?${queryString}` : path;
        return res.replace(/\/$/, "");
    }, [host, prevAlias, pathname, search]);
};

export const getLanguageFromExtension = (filename?: string): string => {
    if (!filename) {
        return 'plaintext';
    }

    const extension = filename.split('.').pop()?.toLowerCase();
    if (!extension) {
        return 'plaintext';
    }

    const languageMap: Record<string, string> = {
        js: 'javascript',
        jsx: 'javascript',
        ts: 'typescript',
        tsx: 'typescript',
        json: 'json',
        css: 'css',
        html: 'html',
        yaml: 'yaml',
        yml: 'yaml',
        md: 'markdown',
        py: 'python',
        java: 'java',
        sh: 'shell',
        env: 'ini'
    };
    return languageMap[extension] || 'plaintext';
};
