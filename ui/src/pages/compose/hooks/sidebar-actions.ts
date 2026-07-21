import {useCallback} from "react";
import {useNavigate} from "react-router-dom";
import {useFiles} from "../../../context/file-context.tsx";
import {useFileSearch} from "../dialogs/file-search.tsx";
import {useFileCreate} from "../dialogs/file-create.tsx";
import {useEditorUrl} from "../../../lib/editor.ts";
import {formatDockyaml} from "../components/viewer-dockyml.tsx";
import {useFileComponents} from "../state/terminal.tsx";

// useSidebarActions centralizes the file-explorer toolbar actions so they can
// be rendered either in the file list header (top placement) or on the left
// activity rail (side placement) without duplicating the wiring.
export function useSidebarActions() {
    const {listFiles} = useFiles();
    const showSearch = useFileSearch(state => state.open);
    const fileCreate = useFileCreate(state => state.open);
    const nav = useNavigate();
    const editUrl = useEditorUrl();
    const {host, alias} = useFileComponents();

    const reload = useCallback(() => {
        listFiles("", []).then();
    }, [listFiles]);

    const showFileAdd = useCallback(() => {
        fileCreate(`${alias}`);
    }, [fileCreate, alias]);

    const showDockyaml = useCallback(() => {
        nav(editUrl(formatDockyaml(alias, host)));
    }, [nav, editUrl, alias, host]);

    return {reload, showSearch, showFileAdd, showDockyaml};
}
