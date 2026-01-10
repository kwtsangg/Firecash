import { useMemo, type ReactNode } from "react";
import { LineChart } from "./Charts";

type ChartPanelProps = {
  title: string;
  description?: string;
  points: number[];
  labels: string[];
  formatValue?: (value: number) => string;
  formatLabel?: (label: string) => string;
  axisTitleX?: string;
  axisTitleY?: string;
  headerExtras?: ReactNode;
};

const MAX_X_LABELS = 6;
const DEFAULT_TICK_COUNT = 5;

const niceNumber = (range: number, round: boolean) => {
  const exponent = Math.floor(Math.log10(range));
  const fraction = range / 10 ** exponent;
  let niceFraction = 1;

  if (round) {
    if (fraction < 1.5) {
      niceFraction = 1;
    } else if (fraction < 3) {
      niceFraction = 2;
    } else if (fraction < 7) {
      niceFraction = 5;
    } else {
      niceFraction = 10;
    }
  } else if (fraction <= 1) {
    niceFraction = 1;
  } else if (fraction <= 2) {
    niceFraction = 2;
  } else if (fraction <= 5) {
    niceFraction = 5;
  } else {
    niceFraction = 10;
  }

  return niceFraction * 10 ** exponent;
};

const buildNiceTicks = (min: number, max: number, tickCount = DEFAULT_TICK_COUNT) => {
  if (tickCount <= 0) {
    return [];
  }

  if (min === max) {
    const adjustment = Math.max(1, Math.abs(min) * 0.1);
    return [min - adjustment, min, min + adjustment];
  }

  const range = niceNumber(max - min, false);
  const step = niceNumber(range / (tickCount - 1), true);
  const niceMin = Math.floor(min / step) * step;
  const niceMax = Math.ceil(max / step) * step;
  const ticks: number[] = [];

  for (let value = niceMin; value <= niceMax + step / 2; value += step) {
    ticks.push(value);
  }

  return ticks;
};

const buildXAxisLabels = (labels: string[], formatLabel?: (label: string) => string) => {
  if (labels.length === 0) {
    return [];
  }

  const labelCount = Math.min(MAX_X_LABELS, labels.length);
  if (labelCount === 1) {
    const label = formatLabel ? formatLabel(labels[0]) : labels[0];
    return [label];
  }

  const step = (labels.length - 1) / (labelCount - 1);
  const indices = Array.from({ length: labelCount }, (_, index) =>
    Math.round(index * step),
  );
  const uniqueIndices = Array.from(new Set(indices));

  return uniqueIndices
    .filter((index) => labels[index] !== undefined)
    .map((index) => (formatLabel ? formatLabel(labels[index]) : labels[index]));
};

export default function ChartPanel({
  title,
  description,
  points,
  labels,
  formatValue,
  formatLabel,
  axisTitleX = "Date",
  axisTitleY = "Value",
  headerExtras,
}: ChartPanelProps) {
  const axisYLabels = useMemo(() => {
    if (points.length === 0) {
      return [];
    }
    const min = Math.min(...points);
    const max = Math.max(...points);
    const ticks = buildNiceTicks(min, max, DEFAULT_TICK_COUNT).reverse();
    return ticks.map((value) => (formatValue ? formatValue(value) : value.toFixed(0)));
  }, [formatValue, points]);

  const axisXLabels = useMemo(
    () => buildXAxisLabels(labels, formatLabel),
    [formatLabel, labels],
  );

  return (
    <div className="card chart-card">
      <div className="chart-header">
        <div>
          <h3>{title}</h3>
          {description ? <p className="muted">{description}</p> : null}
        </div>
        {headerExtras ? <div>{headerExtras}</div> : null}
      </div>
      <div className="chart-surface chart-axis-surface">
        <LineChart
          points={points}
          labels={labels}
          formatLabel={formatLabel}
          formatValue={formatValue}
          showAxisLabels={false}
        />
        <span className="chart-axis-title y">{axisTitleY}</span>
        <span className="chart-axis-title x">{axisTitleX}</span>
        <div className="chart-axis-y">
          {axisYLabels.map((label, index) => (
            <span key={`${label}-${index}`}>{label}</span>
          ))}
        </div>
        <div className="chart-axis-x">
          {axisXLabels.map((label, index) => (
            <span key={`${label}-${index}`}>{label}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
