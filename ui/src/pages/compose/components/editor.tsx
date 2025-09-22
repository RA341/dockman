import {Editor} from "@monaco-editor/react";
import {getLanguageFromExtension} from "../../../lib/editor";
import {useCallback, useEffect, useRef, useState} from "react";
import * as monacoEditor from "monaco-editor";
import {useTabs} from "../../../hooks/tabs.ts";

interface MonacoEditorProps {
    selectedFile: string;
    fileContent: string;
    handleEditorChange: (value: string | undefined) => void;
}

export function MonacoEditor(
    {
        selectedFile,
        fileContent,
        handleEditorChange,
    }: MonacoEditorProps) {

    const editorRef = useRef<monacoEditor.editor.IStandaloneCodeEditor | null>(null);
    const saveLineNum = useSaveLineNum()

    const {tabs, setTabDetails} = useTabs()
    const [mounted, setMounted] = useState(false);

    const handleEditorDidMount = (editor: monacoEditor.editor.IStandaloneCodeEditor) => {
        editorRef.current = editor;
        setMounted(true); // mark as ready
        editor.focus();

        editor.onDidChangeCursorPosition((e) => {
            const {lineNumber, column} = e.position;
            saveLineNum({filename: selectedFile, col: column, row: lineNumber}, (value) => {
                setTabDetails(value.filename, {row: value.row, col: value.col});
            });
        });
    };

    useEffect(() => {
        if (!mounted || !editorRef.current) return;

        const model = editorRef.current.getModel();
        if (!model) return;

        console.log("clearing stack for initial load");
        model.pushStackElement();
        model.setValue(fileContent);

        model.onDidChangeContent(() => {
            handleEditorChange(model.getValue());
        });

        const tab = tabs[selectedFile];
        if (!tab) return;
        const {row, col} = tab;

        // Clamp row/column to model size
        const lineNumber = Math.min(row, model.getLineCount());
        const column = Math.min(col, model.getLineMaxColumn(lineNumber));

        editorRef.current.setPosition({lineNumber, column});
        const padding = 5;
        editorRef.current.revealRangeInCenter({
            startLineNumber: Math.max(1, lineNumber - padding),
            startColumn: 1,
            endLineNumber: lineNumber + padding,
            endColumn: 1,
        });
        // do not add tabs as dependencies
        // it will mess with the editor typing
        // resetting cursor position when the tab
    }, [fileContent, selectedFile, mounted]);

    return (
        <Editor
            key={selectedFile}
            language={getLanguageFromExtension(selectedFile)}
            defaultValue={""}
            onMount={handleEditorDidMount}
            theme="vs-dark"
            options={{
                selectOnLineNumbers: true,
                minimap: {enabled: false},
                automaticLayout: true,
            }}
        />
    );
}

type RowColUpdate = { row: number; col: number; filename: string };

function useSaveLineNum(debounceMs: number = 200) {
    const debounceTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

    const handleContentChange = useCallback(
        (value: RowColUpdate, onSave: (value: RowColUpdate) => void) => {
            if (debounceTimeout.current) {
                clearTimeout(debounceTimeout.current);
            }

            debounceTimeout.current = setTimeout(() => {
                onSave(value);
                console.log("Saving cursor position: ", value)
            }, debounceMs);
        },
        [debounceMs]
    );

    useEffect(() => {
        return () => {
            if (debounceTimeout.current) {
                clearTimeout(debounceTimeout.current);
            }
        };
    }, []);

    return handleContentChange;
}
