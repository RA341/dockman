import React, {useState} from "react";
import {Box, Typography} from "@mui/material";
import {VerticalAlignTop as MoveToRootIcon} from "@mui/icons-material";
import {useFiles} from "../../../context/file-context.tsx";
import {useFileDrag} from "../state/files.ts";
import {useFileComponents} from "../state/terminal.tsx";

// RootDropZone is a drop target that only exists while a file-tree entry is being
// dragged. It lets you move an entry back to the root of the tree — otherwise
// impossible when the root has no sibling file to drop onto.
//
// It is rendered as an ABSOLUTE overlay covering the file-list header (the alias
// bar), so it never overlaps a file row and — crucially — never shifts the list
// layout. Shifting the list during a drag moves the dragged row and makes the
// browser cancel the drag; an absolute overlay avoids that entirely. The parent
// header must be position:relative.
export function RootDropZone() {
    const dragging = useFileDrag(state => state.dragging);
    const setDragging = useFileDrag(state => state.setDragging);
    const {renameFile} = useFiles();
    const {alias} = useFileComponents();
    const [isOver, setIsOver] = useState(false);

    // Nothing to show unless an internal drag is in progress.
    if (!dragging) return null;

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsOver(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsOver(false);
    };

    const handleDrop = async (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsOver(false);
        setDragging(false);

        const sourcePath = e.dataTransfer.getData("sourcePath");
        if (!sourcePath) return;

        // Tree paths are "<alias>/<relpath>": the first segment is the alias (the
        // tree root), NOT part of the file path. A root move therefore keeps the
        // alias prefix and drops everything in between -> "<alias>/<basename>".
        const parts = sourcePath.split("/").filter(Boolean);
        // Already at the root (only "<alias>/<name>") -> nothing to do.
        if (parts.length <= 2) return;

        const newPath = `${parts[0]}/${parts[parts.length - 1]}`;
        await renameFile(sourcePath, newPath);
    };

    return (
        <Box
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            sx={{
                position: 'absolute',
                inset: 0,
                zIndex: 6,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 0.75,
                px: 1,
                backgroundColor: isOver ? 'rgba(144,202,249,0.22)' : 'rgba(30,30,30,0.97)',
                color: isOver ? 'primary.main' : 'rgba(255,255,255,0.85)',
                border: '2px dashed',
                borderColor: isOver ? 'primary.main' : 'rgba(255,255,255,0.4)',
                borderRadius: 1,
                cursor: 'copy',
                transition: 'background-color 80ms, border-color 80ms, color 80ms',
            }}
        >
            <MoveToRootIcon sx={{fontSize: 18}}/>
            <Typography variant="caption" fontWeight={600} noWrap>
                Move to {alias || 'root'}
            </Typography>
        </Box>
    );
}

export default RootDropZone;
