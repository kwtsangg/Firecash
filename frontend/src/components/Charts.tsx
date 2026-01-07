import { useMemo, useRef, useState, type MouseEvent } from "react";

type LineChartProps = {
  points: number[];
  labels?: string[];
  formatValue?: (value: number) => string;
  formatLabel?: (label: string) => string;
  xLabels?: { label: string; position: number }[];
  yLabels?: { label: string; position: number }[];
};

export function LineChart({
  points,
  labels = [],
  formatValue,
  formatLabel,
  xLabels = [],
  yLabels = [],
}: LineChartProps) {
  if (points.length === 0) {
    return <div className="chart-empty">No data</div>;
  }
  const [hoverRatio, setHoverRatio] = useState<number | null>(null);
  const max = Math.max(...points);
  const min = Math.min(...points);
  const range = max - min || 1;
  const paddingX = 6;
  const paddingY = 8;
  const plotWidth = 100 - paddingX * 2;
  const plotHeight = 100 - paddingY * 2;
  const valuePadding = range === 0 ? Math.max(1, Math.abs(max) * 0.1) : range * 0.08;
  const chartMax = max + valuePadding;
  const chartMin = min - valuePadding;
  const chartRange = chartMax - chartMin || 1;
  const count = Math.max(points.length - 1, 1);
  const positions = useMemo(
    () =>
      points.map((value, index) => {
        const x = paddingX + (index / count) * plotWidth;
        const y = paddingY + (1 - (value - chartMin) / chartRange) * plotHeight;
        return { x, y, value };
      }),
    [points, count, chartMin, chartRange, paddingX, paddingY, plotHeight, plotWidth],
  );
  const path = positions
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ");
  const activePoint = useMemo(() => {
    if (hoverRatio === null) {
      return null;
    }
    const clampedRatio = Math.min(1, Math.max(0, hoverRatio));
    const scaledIndex = clampedRatio * (points.length - 1);
    const lowerIndex = Math.floor(scaledIndex);
    const upperIndex = Math.min(lowerIndex + 1, points.length - 1);
    const blend =
      upperIndex === lowerIndex ? 0 : (scaledIndex - lowerIndex) / (upperIndex - lowerIndex);
    const value =
      points[lowerIndex] + (points[upperIndex] - points[lowerIndex]) * blend;
    const x = paddingX + clampedRatio * plotWidth;
    const y = paddingY + (1 - (value - chartMin) / chartRange) * plotHeight;
    return {
      x,
      y,
      value,
      lowerIndex,
      upperIndex,
      blend,
    };
  }, [chartMin, chartRange, hoverRatio, paddingX, paddingY, plotHeight, plotWidth, points]);

  const majorYCount = 5;
  const majorXCount = 5;
  const minorPerMajor = 1;
  const majorYTicks = Array.from({ length: majorYCount }, (_, index) =>
    paddingY + (plotHeight * index) / (majorYCount - 1),
  );
  const majorXTicks = Array.from({ length: majorXCount }, (_, index) =>
    paddingX + (plotWidth * index) / (majorXCount - 1),
  );
  const minorYTicks = majorYTicks.flatMap((start, index) => {
    const next = majorYTicks[index + 1];
    if (!next) {
      return [];
    }
    return Array.from({ length: minorPerMajor }, (_, step) =>
      start + ((step + 1) * (next - start)) / (minorPerMajor + 1),
    );
  });
  const minorXTicks = majorXTicks.flatMap((start, index) => {
    const next = majorXTicks[index + 1];
    if (!next) {
      return [];
    }
    return Array.from({ length: minorPerMajor }, (_, step) =>
      start + ((step + 1) * (next - start)) / (minorPerMajor + 1),
    );
  });

  const tooltipValue =
    activePoint && formatValue
      ? formatValue(activePoint.value)
      : activePoint?.value.toString();
  const tooltipLabel = useMemo(() => {
    if (!activePoint || labels.length === 0) {
      return null;
    }
    const lowerLabel = labels[activePoint.lowerIndex];
    const upperLabel = labels[activePoint.upperIndex];
    const lowerTime = Date.parse(lowerLabel);
    const upperTime = Date.parse(upperLabel);
    if (Number.isNaN(lowerTime) || Number.isNaN(upperTime)) {
      const fallbackLabel = labels[Math.round(activePoint.lowerIndex + activePoint.blend)];
      return formatLabel ? formatLabel(fallbackLabel) : fallbackLabel;
    }
    const interpolatedTime = lowerTime + (upperTime - lowerTime) * activePoint.blend;
    const interpolatedLabel = new Date(interpolatedTime).toISOString().split("T")[0];
    return formatLabel ? formatLabel(interpolatedLabel) : interpolatedLabel;
  }, [activePoint, formatLabel, labels]);

  const handleMove = (event: MouseEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const relativeX = event.clientX - rect.left;
    const ratio = rect.width ? relativeX / rect.width : 0;
    setHoverRatio(ratio);
  };

  const handleLeave = () => {
    setHoverRatio(null);
  };

  return (
    <div className="line-chart">
      <svg
        viewBox="0 0 100 100"
        className="chart-svg"
        preserveAspectRatio="none"
        onMouseMove={handleMove}
        onMouseLeave={handleLeave}
      >
        <g className="chart-grid">
          {majorYTicks.map((tick, index) => (
            <line
              key={`y-major-${index}`}
              className="chart-grid-major"
              x1={paddingX}
              y1={tick}
              x2={100 - paddingX}
              y2={tick}
            />
          ))}
          {minorYTicks.map((tick, index) => (
            <line
              key={`y-minor-${index}`}
              className="chart-grid-minor"
              x1={paddingX}
              y1={tick}
              x2={100 - paddingX}
              y2={tick}
            />
          ))}
          {majorXTicks.map((tick, index) => (
            <line
              key={`x-major-${index}`}
              className="chart-grid-major"
              x1={tick}
              y1={paddingY}
              x2={tick}
              y2={100 - paddingY}
            />
          ))}
          {minorXTicks.map((tick, index) => (
            <line
              key={`x-minor-${index}`}
              className="chart-grid-minor"
              x1={tick}
              y1={paddingY}
              x2={tick}
              y2={100 - paddingY}
            />
          ))}
        </g>
        <path d={path} fill="none" stroke="url(#lineGradient)" strokeWidth="3" />
        {activePoint ? (
          <g className="chart-crosshair-group">
            <line
              className="chart-crosshair"
              x1={activePoint.x}
              y1={paddingY}
              x2={activePoint.x}
              y2={100 - paddingY}
            />
            <line
              className="chart-crosshair chart-crosshair-horizontal"
              x1={paddingX}
              y1={activePoint.y}
              x2={100 - paddingX}
              y2={activePoint.y}
            />
            <circle
              className="chart-point"
              cx={activePoint.x}
              cy={activePoint.y}
              r="2.5"
            />
          </g>
        ) : null}
        {yLabels.map((item, index) => (
          <text
            key={`y-${item.label}-${index}`}
            x="2"
            y={item.position}
            className="chart-axis-text"
            textAnchor="start"
          >
            {item.label}
          </text>
        ))}
        {xLabels.map((item, index) => (
          <text
            key={`x-${item.label}-${index}`}
            x={item.position}
            y="98"
            className="chart-axis-text"
            textAnchor="middle"
          >
            {item.label}
          </text>
        ))}
        <defs>
          <linearGradient id="lineGradient" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="#7f5bff" />
            <stop offset="100%" stopColor="#5b6cff" />
          </linearGradient>
        </defs>
      </svg>
      {activePoint && tooltipValue ? (
        <div
          className="chart-tooltip"
          style={{ left: `${activePoint.x}%`, top: `${activePoint.y}%` }}
        >
          {tooltipLabel ? <div className="chart-tooltip-label">{tooltipLabel}</div> : null}
          <div className="chart-tooltip-value">{tooltipValue}</div>
        </div>
      ) : null}
    </div>
  );
}

type BarChartProps = {
  values: { label: string; value: number }[];
};

export function BarChart({ values }: BarChartProps) {
  const max = Math.max(...values.map((item) => item.value), 1);
  return (
    <div className="bar-chart">
      {values.map((item) => (
        <div key={item.label} className="bar-item">
          <div
            className="bar-fill"
            style={{ height: `${(item.value / max) * 100}%` }}
          />
          <span>{item.label}</span>
        </div>
      ))}
    </div>
  );
}

type DonutChartProps = {
  values: { label: string; value: number; color: string }[];
  formatValue?: (value: number) => string;
};

export function DonutChart({ values, formatValue }: DonutChartProps) {
  const total = values.reduce((sum, item) => sum + item.value, 0) || 1;
  let cumulative = 0;
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [hovered, setHovered] = useState<{
    label: string;
    value: number;
    x: number;
    y: number;
    percent: number;
  } | null>(null);

  const handleMove = (
    event: MouseEvent<SVGPathElement>,
    item: { label: string; value: number },
  ) => {
    if (!wrapperRef.current) {
      return;
    }
    const rect = wrapperRef.current.getBoundingClientRect();
    setHovered({
      label: item.label,
      value: item.value,
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
      percent: total > 0 ? (item.value / total) * 100 : 0,
    });
  };

  const formatAmount = (value: number) =>
    formatValue ? formatValue(value) : value.toFixed(2);
  return (
    <div className="donut-chart-wrapper" ref={wrapperRef}>
      <svg viewBox="0 0 120 120" className="donut-chart">
        <circle cx="60" cy="60" r="46" stroke="#2a2f48" strokeWidth="16" fill="none" />
        {values.map((item) => {
          const start = (cumulative / total) * 2 * Math.PI;
          const end = ((cumulative + item.value) / total) * 2 * Math.PI;
          cumulative += item.value;
          const largeArc = end - start > Math.PI ? 1 : 0;
          const startX = 60 + 46 * Math.cos(start - Math.PI / 2);
          const startY = 60 + 46 * Math.sin(start - Math.PI / 2);
          const endX = 60 + 46 * Math.cos(end - Math.PI / 2);
          const endY = 60 + 46 * Math.sin(end - Math.PI / 2);
          const path = `M ${startX} ${startY} A 46 46 0 ${largeArc} 1 ${endX} ${endY}`;
          return (
            <path
              key={item.label}
              d={path}
              stroke={item.color}
              strokeWidth="16"
              fill="none"
              strokeLinecap="round"
              onMouseMove={(event) => handleMove(event, item)}
              onMouseLeave={() => setHovered(null)}
            />
          );
        })}
        <text x="60" y="60" textAnchor="middle" dominantBaseline="middle" fill="#f5f6ff">
          {total.toFixed(0)}
        </text>
      </svg>
      {hovered ? (
        <div
          className="donut-tooltip"
          style={{ left: hovered.x, top: hovered.y }}
        >
          <div className="donut-tooltip-label">{hovered.label}</div>
          <div className="donut-tooltip-value">{formatAmount(hovered.value)}</div>
          <div className="donut-tooltip-meta">
            {hovered.percent.toFixed(1)}%
          </div>
        </div>
      ) : null}
    </div>
  );
}
