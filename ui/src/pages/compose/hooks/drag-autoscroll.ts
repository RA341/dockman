import {useCallback, useEffect, useRef} from "react";

// useDragAutoScroll returns a callback ref to attach to a scrollable element.
// While a drag hovers within EDGE px of the element's top or bottom edge, the
// element auto-scrolls in that direction, so you can drag an entry from the
// bottom of a long list up to a folder (or the root banner) at the top, and
// vice-versa.
//
// Listeners are attached in the capture phase because the file rows call
// stopPropagation on their own dragover handlers, which would otherwise stop a
// bubbling listener on the container from ever firing while the pointer is over
// a row. A callback ref (rather than a plain ref + effect) re-attaches cleanly
// when the underlying node is swapped out (e.g. toggling pinned mode).
export function useDragAutoScroll() {
    const cleanupRef = useRef<(() => void) | null>(null);

    const setNode = useCallback((el: HTMLElement | null) => {
        // Detach from any previously attached node.
        cleanupRef.current?.();
        cleanupRef.current = null;
        if (!el) return;

        const EDGE = 40;   // px from an edge that starts scrolling
        const STEP = 10;   // px scrolled per tick
        let timer: number | null = null;
        let dir = 0;       // -1 up, +1 down, 0 idle

        const stop = () => {
            dir = 0;
            if (timer !== null) {
                clearInterval(timer);
                timer = null;
            }
        };

        const onDragOver = (e: DragEvent) => {
            const rect = el.getBoundingClientRect();
            const y = e.clientY;
            if (y < rect.top + EDGE) dir = -1;
            else if (y > rect.bottom - EDGE) dir = 1;
            else {
                stop();
                return;
            }
            if (timer === null) {
                timer = window.setInterval(() => {
                    el.scrollTop += dir * STEP;
                }, 16);
            }
        };

        const onDragLeave = (e: DragEvent) => {
            // Only stop when the pointer actually leaves the container (relatedTarget
            // outside it), not when moving between the rows inside it.
            const to = e.relatedTarget as Node | null;
            if (!to || !el.contains(to)) stop();
        };

        el.addEventListener("dragover", onDragOver, true);
        el.addEventListener("dragleave", onDragLeave, true);
        window.addEventListener("dragend", stop);
        window.addEventListener("drop", stop);

        cleanupRef.current = () => {
            el.removeEventListener("dragover", onDragOver, true);
            el.removeEventListener("dragleave", onDragLeave, true);
            window.removeEventListener("dragend", stop);
            window.removeEventListener("drop", stop);
            stop();
        };
    }, []);

    // Detach on unmount.
    useEffect(() => () => {
        cleanupRef.current?.();
    }, []);

    return setNode;
}

export default useDragAutoScroll;
