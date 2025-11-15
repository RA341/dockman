import React, {useEffect, useRef, useState} from "react";

type ResizeDirection = 'top' | 'bottom' | 'left' | 'right';

const useResizeBar = (direction: ResizeDirection, initialSize: number = 250) => {
    const [panelSize, setPanelSize] = useState(initialSize);
    const [isResizing, setIsResizing] = useState(false);
    const panelRef = useRef<HTMLDivElement | null>(null);

    const handleMouseDown = (e: React.MouseEvent) => {
        setIsResizing(true);
        e.preventDefault();
    };

    const handleMouseMove = (e: MouseEvent) => {
        if (!isResizing || !panelRef.current) return;

        const panelRect = panelRef.current.getBoundingClientRect();
        let newSize: number;

        switch (direction) {
            case 'right':
                newSize = e.clientX - panelRect.left;
                break;
            case 'left':
                newSize = panelRect.right - e.clientX;
                break;
            case 'bottom':
                newSize = e.clientY - panelRect.top;
                break;
            case 'top':
                newSize = panelRect.bottom - e.clientY;
                break;
            default:
                return;
        }

        setPanelSize(Math.max(150, Math.min(600, newSize)));
    };

    const handleMouseUp = () => {
        setIsResizing(false);
    };

    useEffect(() => {
        if (isResizing) {
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
            return () => {
                document.removeEventListener('mousemove', handleMouseMove);
                document.removeEventListener('mouseup', handleMouseUp);
            };
        }
        // eslint-disable-next-line
    }, [isResizing]);

    const isHorizontal = direction === 'left' || direction === 'right';
    const cursor = isHorizontal ? 'ew-resize' : 'ns-resize';
    const sizeProperty = isHorizontal ? 'width' : 'height';

    return {
        panelRef,
        panelSize,
        isResizing,
        handleMouseDown,
        cursor,
        sizeProperty,
        isHorizontal
    };
};

export default useResizeBar;