import {Editor, type Monaco} from "@monaco-editor/react";
import {getLanguageFromExtension} from "../../../lib/editor";
import {useCallback, useEffect, useRef, useState} from "react";
import * as monacoEditor from "monaco-editor";
import {callRPC, useFileClient} from "../../../lib/api.ts";
import {useSnackbar} from "../../../hooks/snackbar.ts";
import {useTabsStore, useTabs} from "../../../context/tab-context.tsx";

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
    const file = useFileClient()
    const {showError} = useSnackbar()

    const editorRef = useRef<monacoEditor.editor.IStandaloneCodeEditor | null>(null);
    const saveLineNum = useSaveLineNum()

    const [mounted, setMounted] = useState(false);
    const {setTabDetails} = useTabs()

    const handleEditorDidMount = (editor: monacoEditor.editor.IStandaloneCodeEditor, monaco: Monaco) => {
        editorRef.current = editor;
        setMounted(true);
        editor.focus();

        editor.addCommand(
            monaco.KeyMod.Alt | monaco.KeyCode.KeyL,
            async () => {
                const {val, err} = await callRPC(() => file.format({filename: selectedFile}))
                if (err) {
                    showError(err)
                } else {
                    const contents = val?.contents;
                    if (contents) {
                        const model = editor.getModel()!;
                        const position = editor.getPosition()!;
                        const offset = model?.getOffsetAt(position);
                        const fullRange = model.getFullModelRange();

                        // Replace content while preserving undo stack
                        editor.executeEdits('format', [{
                            range: fullRange,
                            text: contents,
                            forceMoveMarkers: true
                        }]);

                        // Calculate new position from offset
                        // This handles cases where formatting changes line counts
                        const newPosition = model.getPositionAt(Math.min(offset, contents.length));
                        editor.setPosition(newPosition);
                        editor.revealPositionInCenter(newPosition);
                    }
                }
            }
        );

        editorRef.current?.getValue();

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

        const tab = useTabsStore.getState().allTabs[selectedFile];
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
                tabSize: 2,
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
