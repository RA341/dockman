import {Editor, type Monaco} from "@monaco-editor/react";
import {getLanguageFromExtension} from "../../../lib/editor";
import {useCallback, useEffect, useRef, useState} from "react";
import * as monacoEditor from "monaco-editor";
import {callRPC, useHostClient} from "../../../lib/api.ts";
import {useSnackbar} from "../../../hooks/snackbar.ts";
import {useTabs, useTabsStore} from "../../../context/tab-context.tsx";
import {FileService} from "../../../gen/files/v1/files_pb.ts";
import {useConfig} from "../../../hooks/config.ts";

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
    const file = useHostClient(FileService)
    const {showError} = useSnackbar()

    const editorRef = useRef<monacoEditor.editor.IStandaloneCodeEditor | null>(null);
    const saveLineNum = useSaveLineNum()

    const [mounted, setMounted] = useState(false);
    // bumped on every editor instance creation: the component remounts per
    // file (key={selectedFile}) while `mounted` stays true, so effects that
    // must re-attach to the new instance depend on this counter instead
    const [editorGen, setEditorGen] = useState(0);
    const {setTabDetails} = useTabs()

    const {dockYaml} = useConfig()
    const scrollPastEnd = dockYaml?.editorPage?.scrollPastEnd ?? false

    // dockman.yml editor.scrollPastEnd lets long files scroll half a viewport
    // past their end (the last line stops at mid-view, not at the top), via a
    // bottom padding applied only while the file is taller than the viewport:
    // short files never scroll past their end
    useEffect(() => {
        const editor = editorRef.current;
        if (!editor) return;

        if (!scrollPastEnd) {
            editor.updateOptions({padding: {bottom: 0}});
            return;
        }

        const apply = () => {
            const lineHeight = editor.getOption(monacoEditor.editor.EditorOption.lineHeight);
            const lineCount = editor.getModel()?.getLineCount() ?? 0;
            const height = editor.getLayoutInfo().height;
            const overflows = lineCount * lineHeight > height;
            editor.updateOptions({padding: {bottom: overflows ? Math.round(height / 2) : 0}});
        };

        apply();
        const contentSub = editor.onDidChangeModelContent(apply);
        const layoutSub = editor.onDidLayoutChange(apply);
        return () => {
            contentSub.dispose();
            layoutSub.dispose();
        };
    }, [scrollPastEnd, editorGen]);

    const handleEditorDidMount = (editor: monacoEditor.editor.IStandaloneCodeEditor, monaco: Monaco) => {
        editorRef.current = editor;
        setMounted(true);
        setEditorGen(gen => gen + 1);
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

        // console.log("clearing stack for initial load");
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
                // stop the view from scrolling past the last line: short files
                // no longer show a useless scrollbar and long files stop with
                // the last line at the bottom, like classic editors
                // (dockman.yml editor.scrollPastEnd re-enables it dynamically)
                scrollBeyondLastLine: false,
                // hover/suggest widgets render position:fixed so the overflow
                // clip on the editor container cannot cut them off
                fixedOverflowWidgets: true,
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
                // console.log("Saving cursor position: ", value)
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
