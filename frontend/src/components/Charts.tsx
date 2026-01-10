import { useMemo, useRef, useState, type MouseEvent } from "react";

type LineChartProps = {
  points: number[];
  labels?: string[];
  formatValue?: (value: number) => string;
  formatLabel?: (label: string) => string;
  xLabels?: { label: string; position: number }[];
  yLabels?: { label: string; position: number }[];
  showAxisLabels?: boolean;
  lineWidth?: number;
  pointRadius?: number;
};

export function LineChart({
  points,
  labels = [],
  formatValue,
  formatLabel,
  xLabels = [],
  yLabels = [],
  showAxisLabels = true,
  lineWidth = 2.2,
  pointRadius = 2,
}: LineChartProps) {
  if (points.length === 0) {
    return <div className="chart-empty">No data</div>;
  }
  const wrapperRef = useRef<HTMLDivElement | null>(null);
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

  const defaultYLabels = majorYTicks.map((tick, index) => {
    const value = chartMax - (index / (majorYCount - 1)) * chartRange;
    const label = formatValue ? formatValue(value) : value.toFixed(0);
    return { label, position: tick };
  });

  const defaultXLabels = majorXTicks.map((tick, index) => {
    if (labels.length === 0) {
      return { label: `${index + 1}`, position: tick };
    }
    const labelIndex = Math.round((index / (majorXCount - 1)) * (labels.length - 1));
    const rawLabel = labels[labelIndex];
    const label = formatLabel ? formatLabel(rawLabel) : rawLabel;
    return { label, position: tick };
  });

  const resolvedYLabels = yLabels.length ? yLabels : defaultYLabels;
  const resolvedXLabels = xLabels.length ? xLabels : defaultXLabels;

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

  const tooltipStyle = useMemo(() => {
    if (!wrapperRef.current || !activePoint) {
      return undefined;
    }
    const rect = wrapperRef.current.getBoundingClientRect();
    const left = (activePoint.x / 100) * rect.width;
    const top = (activePoint.y / 100) * rect.height;
    const maxLeft = rect.width - 120;
    const clampedLeft = Math.min(Math.max(left, 120), Math.max(maxLeft, 120));
    return {
      left: `${clampedLeft}px`,
      top: `${top}px`,
    };
  }, [activePoint]);

  const areaPath = `${path} L ${paddingX + plotWidth} ${100 - paddingY} L ${paddingX} ${
    100 - paddingY
  } Z`;

  return (
    <div className="line-chart candlestick-chart" ref={wrapperRef}>
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
        <path d={areaPath} fill="url(#lineAreaGradient)" opacity="0.35" />
        <path
          d={path}
          fill="none"
          stroke="url(#lineGradient)"
          strokeWidth={lineWidth}
          strokeLinecap="round"
        />
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
              r={pointRadius}
            />
          </g>
        ) : null}
        {showAxisLabels
          ? resolvedYLabels.map((item, index) => (
              <text
                key={`y-${item.label}-${index}`}
                x="2"
                y={item.position}
                className="chart-axis-text"
                textAnchor="start"
              >
                {item.label}
              </text>
            ))
          : null}
        {showAxisLabels
          ? resolvedXLabels.map((item, index) => (
              <text
                key={`x-${item.label}-${index}`}
                x={item.position}
                y="98"
                className="chart-axis-text"
                textAnchor="middle"
              >
                {item.label}
              </text>
            ))
          : null}
        <defs>
          <linearGradient id="lineGradient" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="#7f5bff" />
            <stop offset="100%" stopColor="#5b6cff" />
          </linearGradient>
          <linearGradient id="lineAreaGradient" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#7f5bff" />
            <stop offset="100%" stopColor="#1b1f36" stopOpacity="0.2" />
          </linearGradient>
        </defs>
      </svg>
      {activePoint && tooltipValue ? (
        <div
          className="chart-tooltip"
          style={tooltipStyle ?? { left: `${activePoint.x}%`, top: `${activePoint.y}%` }}
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
  formatValue?: (value: number) => string;
};

export function BarChart({ values, formatValue }: BarChartProps) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [hovered, setHovered] = useState<{
    label: string;
    value: number;
    x: number;
    y: number;
  } | null>(null);
  const max = Math.max(...values.map((item) => item.value), 1);
  const majorYCount = 5;
  const minorPerMajor = 1;
  const majorTicks = Array.from({ length: majorYCount }, (_, index) =>
    (index / (majorYCount - 1)) * 100,
  );
  const minorTicks = majorTicks.flatMap((start, index) => {
    const next = majorTicks[index + 1];
    if (next === undefined) {
      return [];
    }
    return Array.from({ length: minorPerMajor }, (_, step) =>
      start + ((step + 1) * (next - start)) / (minorPerMajor + 1),
    );
  });
  const axisLabels = majorTicks.map((position, index) => {
    const value = max - (index / (majorYCount - 1)) * max;
    return { label: value.toFixed(0), position };
  });
  return (
    <div className="bar-chart" ref={wrapperRef}>
      <div className="bar-chart-grid">
        {majorTicks.map((tick, index) => (
          <span
            key={`bar-major-${index}`}
            className="chart-grid-major"
            style={{ top: `${tick}%` }}
          />
        ))}
        {minorTicks.map((tick, index) => (
          <span
            key={`bar-minor-${index}`}
            className="chart-grid-minor"
            style={{ top: `${tick}%` }}
          />
        ))}
      </div>
      <div className="bar-chart-axis">
        {axisLabels.map((item, index) => (
          <span
            key={`bar-axis-${index}`}
            className="bar-chart-axis-label"
            style={{ top: `${item.position}%` }}
          >
            {item.label}
          </span>
        ))}
      </div>
      <div className="bar-chart-bars">
        {values.map((item) => (
          <div
            key={item.label}
            className="bar-item"
            onMouseLeave={() => setHovered(null)}
            onMouseMove={(event) => {
              if (!wrapperRef.current) {
                return;
              }
              const rect = wrapperRef.current.getBoundingClientRect();
              setHovered({
                label: item.label,
                value: item.value,
                x: event.clientX - rect.left,
                y: event.clientY - rect.top,
              });
            }}
          >
            <div
              className="bar-fill"
              style={{ height: `${(item.value / max) * 100}%` }}
            />
            <span>{item.label}</span>
          </div>
        ))}
      </div>
      {hovered ? (
        <div
          className="bar-tooltip"
          style={{ left: hovered.x, top: hovered.y }}
        >
          <div className="bar-tooltip-label">{hovered.label}</div>
          <div className="bar-tooltip-value">
            {formatValue ? formatValue(hovered.value) : hovered.value.toFixed(2)}
          </div>
        </div>
      ) : null}
    </div>
  );
}

type Candle = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
};

type CandlestickChartProps = {
  candles: Candle[];
  formatValue?: (value: number) => string;
  formatLabel?: (label: string) => string;
  showAxisLabels?: boolean;
  axisTitleX?: string;
  axisTitleY?: string;
};

export function CandlestickChart({
  candles,
  formatValue,
  formatLabel,
  showAxisLabels = true,
  axisTitleX = "Date",
  axisTitleY = "Price",
}: CandlestickChartProps) {
  if (candles.length === 0) {
    return <div className="chart-empty">No data</div>;
  }
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const values = candles.flatMap((candle) => [candle.low, candle.high]);
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const paddingX = showAxisLabels ? 16 : 6;
  const paddingY = showAxisLabels ? 16 : 8;
  const plotWidth = 100 - paddingX * 2;
  const plotHeight = 100 - paddingY * 2;
  const valuePadding = range === 0 ? Math.max(1, Math.abs(max) * 0.1) : range * 0.08;
  const chartMax = max + valuePadding;
  const chartMin = min - valuePadding;
  const chartRange = chartMax - chartMin || 1;
  const candleWidth = Math.min(6, Math.max(1, plotWidth / candles.length - 0.6));
  const majorYCount = 5;
  const desiredXLabels = 4;
  const xLabelStep = Math.max(1, Math.floor((candles.length - 1) / desiredXLabels));
  const xLabelIndices = Array.from(
    new Set(
      Array.from({ length: desiredXLabels + 1 }, (_, index) =>
        Math.min(index * xLabelStep, candles.length - 1),
      ),
    ),
  );
  const minorPerMajor = 1;
  const majorYTicks = Array.from({ length: majorYCount }, (_, index) =>
    paddingY + (plotHeight * index) / (majorYCount - 1),
  );
  const majorXTicks = xLabelIndices.map(
    (index) => paddingX + (index / Math.max(candles.length - 1, 1)) * plotWidth,
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

  const defaultYLabels = majorYTicks.map((tick, index) => {
    const value = chartMax - (index / (majorYCount - 1)) * chartRange;
    const label = formatValue ? formatValue(value) : value.toFixed(2);
    return { label, position: tick };
  });

  const defaultXLabels = xLabelIndices.map((candleIndex, index) => {
    const tick = majorXTicks[index];
    const candle = candles[candleIndex];
    const label = candle
      ? formatLabel
        ? formatLabel(candle.date)
        : candle.date
      : `${index + 1}`;
    return { label, position: tick ?? paddingX };
  });

  const formatTooltipValue = (value: number) =>
    formatValue ? formatValue(value) : value.toFixed(2);

  const [hoverState, setHoverState] = useState<{
    index: number;
    x: number;
    y: number;
    value: number;
  } | null>(null);

  const tooltip = useMemo(() => {
    if (hoverIndex === null || !hoverState) {
      return null;
    }
    const candle = candles[hoverIndex];
    if (!candle) {
      return null;
    }
    const label = formatLabel ? formatLabel(candle.date) : candle.date;
    const x = hoverState.x;
    const y = hoverState.y;
    return { candle, label, x, y };
  }, [candles, formatLabel, hoverIndex, hoverState]);

  const tooltipStyle = useMemo(() => {
    if (!wrapperRef.current || !tooltip) {
      return undefined;
    }
    const rect = wrapperRef.current.getBoundingClientRect();
    const left = (tooltip.x / 100) * rect.width;
    const top = (tooltip.y / 100) * rect.height;
    const maxLeft = rect.width - 140;
    const clampedLeft = Math.min(Math.max(left, 140), Math.max(maxLeft, 140));
    return {
      left: `${clampedLeft}px`,
      top: `${top}px`,
    };
  }, [tooltip]);

  return (
    <div className="line-chart candlestick-chart" ref={wrapperRef}>
      <svg
        viewBox="0 0 100 100"
        className="chart-svg"
        preserveAspectRatio="none"
        onMouseLeave={() => {
          setHoverIndex(null);
          setHoverState(null);
        }}
        onMouseMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const relativeX = event.clientX - rect.left;
          const relativeY = event.clientY - rect.top;
          const viewX = (relativeX / rect.width) * 100;
          const viewY = (relativeY / rect.height) * 100;
          const clampedX = Math.min(100 - paddingX, Math.max(paddingX, viewX));
          const clampedY = Math.min(100 - paddingY, Math.max(paddingY, viewY));
          const ratio = (clampedX - paddingX) / plotWidth;
          const index = Math.round(ratio * (candles.length - 1));
          const value =
            chartMax - ((clampedY - paddingY) / plotHeight) * chartRange;
          setHoverIndex(index);
          setHoverState({ index, x: clampedX, y: clampedY, value });
        }}
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
        {candles.map((candle, index) => {
          const x =
            paddingX + (index / Math.max(candles.length - 1, 1)) * plotWidth;
          const openY =
            paddingY + (1 - (candle.open - chartMin) / chartRange) * plotHeight;
          const closeY =
            paddingY + (1 - (candle.close - chartMin) / chartRange) * plotHeight;
          const highY =
            paddingY + (1 - (candle.high - chartMin) / chartRange) * plotHeight;
          const lowY =
            paddingY + (1 - (candle.low - chartMin) / chartRange) * plotHeight;
          const isUp = candle.close >= candle.open;
          const bodyTop = isUp ? closeY : openY;
          const bodyBottom = isUp ? openY : closeY;
          return (
            <g key={`${candle.date}-${index}`} className="candlestick">
              <line
                className="candlestick-wick"
                x1={x}
                y1={highY}
                x2={x}
                y2={lowY}
              />
              <rect
                className={isUp ? "candlestick-body up" : "candlestick-body down"}
                x={x - candleWidth / 2}
                y={bodyTop}
                width={candleWidth}
                height={Math.max(1, bodyBottom - bodyTop)}
              />
            </g>
          );
        })}
        {hoverState ? (
          <g className="chart-crosshair-group">
            <line
              className="chart-crosshair"
              x1={hoverState.x}
              y1={paddingY}
              x2={hoverState.x}
              y2={100 - paddingY}
            />
            <line
              className="chart-crosshair chart-crosshair-horizontal"
              x1={paddingX}
              y1={hoverState.y}
              x2={100 - paddingX}
              y2={hoverState.y}
            />
          </g>
        ) : null}
      </svg>
      {showAxisLabels ? (
        <div className="chart-axis-overlay">
          {defaultYLabels.map((item, index) => (
            <span
              key={`y-${item.label}-${index}`}
              className="chart-axis-overlay-text axis-text-y"
              style={{ left: `${paddingX - 2}%`, top: `${item.position}%` }}
            >
              {item.label}
            </span>
          ))}
          {defaultXLabels.map((item, index) => (
            <span
              key={`x-${item.label}-${index}`}
              className="chart-axis-overlay-text axis-text-x"
              style={{ left: `${item.position}%`, top: "96%" }}
            >
              {item.label}
            </span>
          ))}
        </div>
      ) : null}
      {showAxisLabels ? (
        <>
          <div className="chart-axis-title y">{axisTitleY}</div>
          <div className="chart-axis-title x">{axisTitleX}</div>
        </>
      ) : null}
      {tooltip ? (
        <div
          className="chart-tooltip"
          style={tooltipStyle ?? { left: `${tooltip.x}%`, top: `${tooltip.y}%` }}
        >
          <div className="chart-tooltip-label">{tooltip.label}</div>
          <div className="chart-tooltip-value">
            O {formatTooltipValue(tooltip.candle.open)} · H {formatTooltipValue(tooltip.candle.high)}
          </div>
          <div className="chart-tooltip-value">
            L {formatTooltipValue(tooltip.candle.low)} · C {formatTooltipValue(tooltip.candle.close)}
          </div>
        </div>
      ) : null}
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
    event: MouseEvent<SVGElement>,
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
          if (values.length === 1 || item.value === total) {
            return (
              <circle
                key={item.label}
                cx="60"
                cy="60"
                r="46"
                stroke={item.color}
                strokeWidth="16"
                fill="none"
                strokeLinecap="round"
                onMouseMove={(event) => handleMove(event, item)}
                onMouseLeave={() => setHovered(null)}
              />
            );
          }
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
