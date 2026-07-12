import React, {useState} from "react";
import {Box, Typography} from "@mui/material";
import {VerticalAlignTop as MoveToRootIcon} from "@mui/icons-material";
import {getDir, getEntryDisplayName, useFiles} from "../../../context/file-context.tsx";
import {useFileDrag} from "../state/files.ts";
import {useFileComponents} from "../state/terminal.tsx";

// RootDropZone is a drop target that only exists while a file-tree entry is being
// dragged. It lets you move an entry back to the root of the tree — otherwise
// impossible when the root has no sibling file to drop onto. It is rendered as an
// absolute overlay so it takes no layout space (and causes no reflow) outside of a
// drag, and it stays pinned to the top of the list area so it is always reachable
// without scrolling.
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
        // Already at the root (no parent directory) -> nothing to do.
        if (getDir(sourcePath) === "") return;

        const newPath = getEntryDisplayName(sourcePath);
        if (newPath && newPath !== sourcePath) {
            await renameFile(sourcePath, newPath);
        }
    };

    return (
        <Box
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            sx={{
                position: 'absolute',
                top: 6,
                left: 6,
                right: 6,
                zIndex: 20,
                height: 34,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 0.75,
                borderRadius: 1,
                border: '1.5px dashed',
                borderColor: isOver ? 'primary.main' : 'rgba(255,255,255,0.35)',
                backgroundColor: isOver ? 'rgba(144,202,249,0.18)' : 'rgba(30,30,30,0.94)',
                color: isOver ? 'primary.main' : 'rgba(255,255,255,0.75)',
                boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
                transition: 'background-color 80ms, border-color 80ms, color 80ms',
                pointerEvents: 'auto',
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
