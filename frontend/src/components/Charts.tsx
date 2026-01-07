import { useMemo, useState, type MouseEvent } from "react";

type LineChartProps = {
  points: number[];
  labels?: string[];
  formatValue?: (value: number) => string;
  xLabels?: { label: string; position: number }[];
  yLabels?: { label: string; position: number }[];
};

export function LineChart({
  points,
  labels = [],
  formatValue,
  xLabels = [],
  yLabels = [],
}: LineChartProps) {
  if (points.length === 0) {
    return <div className="chart-empty">No data</div>;
  }
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const max = Math.max(...points);
  const min = Math.min(...points);
  const range = max - min || 1;
  const count = Math.max(points.length - 1, 1);
  const positions = useMemo(
    () =>
      points.map((value, index) => {
        const x = (index / count) * 100;
        const y = 100 - ((value - min) / range) * 100;
        return { x, y, value };
      }),
    [points, count, min, range],
  );
  const path = positions
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ");
  const activePoint = activeIndex === null ? null : positions[activeIndex];
  const tooltipValue =
    activePoint && formatValue ? formatValue(activePoint.value) : activePoint?.value.toString();
  const tooltipLabel = activeIndex !== null ? labels[activeIndex] : null;

  const handleMove = (event: MouseEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const relativeX = event.clientX - rect.left;
    const ratio = rect.width ? relativeX / rect.width : 0;
    const nextIndex = Math.min(
      positions.length - 1,
      Math.max(0, Math.round(ratio * (positions.length - 1))),
    );
    setActiveIndex(nextIndex);
  };

  const handleLeave = () => {
    setActiveIndex(null);
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
        <path d={path} fill="none" stroke="url(#lineGradient)" strokeWidth="3" />
        {activePoint ? (
          <g className="chart-crosshair-group">
            <line
              className="chart-crosshair"
              x1={activePoint.x}
              y1="0"
              x2={activePoint.x}
              y2="100"
            />
            <line
              className="chart-crosshair"
              x1="0"
              y1={activePoint.y}
              x2="100"
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
};

export function DonutChart({ values }: DonutChartProps) {
  const total = values.reduce((sum, item) => sum + item.value, 0) || 1;
  let cumulative = 0;
  return (
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
          />
        );
      })}
      <text x="60" y="60" textAnchor="middle" dominantBaseline="middle" fill="#f5f6ff">
        {total.toFixed(0)}
      </text>
    </svg>
  );
}
