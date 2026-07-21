import {Box} from "@mui/material";

interface SparklineProps {
    data: number[];
    color: string;
    /** rendered height in px — also the drawing's vertical resolution */
    height?: number;
}

// Fixed horizontal drawing space, stretched to the parent width. The vertical
// axis is NOT stretched: the viewBox height equals the rendered height
// (Dockhand's cards do the same), so the 1px line stays crisp instead of
// blurring through a fractional vertical scale.
const VIEW_W = 120;

/**
 * Inline SVG area chart for live metric history (CPU %, memory %...),
 * reproducing Dockhand's chart rendering: zero-based scale with the ceiling
 * at the window maximum (floored at 1), thin 1px line, 15% area fill.
 */
export function Sparkline({data, color, height = 26}: SparklineProps) {
    // no data yet: keep the footprint with a subtle placeholder
    if (data.length === 0) {
        return (
            <Box sx={{
                width: '100%',
                height,
                borderRadius: 0.5,
                bgcolor: 'rgba(255,255,255,0.06)',
            }}/>
        );
    }

    // a single reading draws a flat line so the chart shows up on the very
    // first poll instead of after two ticks
    const series = data.length === 1 ? [data[0], data[0]] : data;

    const max = Math.max(...series, 1);
    const step = VIEW_W / (series.length - 1);
    const points = series.map((v, i) => {
        const x = i * step;
        const y = height - (Math.max(v, 0) / max) * height;
        return `${x.toFixed(2)},${y.toFixed(2)}`;
    });

    const line = points.join(' ');
    const area = `0,${height} ${line} ${VIEW_W},${height}`;

    return (
        <svg
            width="100%"
            height={height}
            viewBox={`0 0 ${VIEW_W} ${height}`}
            preserveAspectRatio="none"
            style={{display: 'block'}}
            aria-hidden
        >
            <polygon points={area} fill={color} opacity={0.15}/>
            <polyline
                points={line}
                fill="none"
                stroke={color}
                strokeWidth={1}
                strokeLinejoin="round"
                strokeLinecap="round"
            />
        </svg>
    );
}

export default Sparkline;
