import type {TabDetails} from "../context/tab-context.tsx";
import {useHost} from "../pages/home/home.tsx";
import {useCallback} from "react";

export const COMPOSE_EXTENSIONS = ['compose.yaml', 'compose.yml']

export function isComposeFile(filename: string): boolean {
    return COMPOSE_EXTENSIONS.some(ext => filename.endsWith(ext))
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
    const host = useHost();
    return useCallback((filename?: string, tabDetail?: TabDetails | number) => {
        let base = `/${host}/files`;
        if (filename) {
            base = `${base}/${filename}`;
            if (tabDetail) {
                let tabValue: number;
                if (typeof tabDetail === 'number') {
                    tabValue = tabDetail;
                } else {
                    tabValue = tabDetail.subTabIndex ?? 0;
                }
                base = `${base}?tab=${tabValue}`;
            }
        }
        return base;
    }, [host]);
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
