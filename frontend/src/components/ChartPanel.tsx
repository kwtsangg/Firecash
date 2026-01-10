import { ReactNode, useMemo } from "react";
import { LineChart } from "./Charts";

type ChartPanelProps = {
  title: string;
  description?: string;
  points: number[];
  labels: string[];
  formatValue: (value: number) => string;
  formatLabel: (label: string) => string;
  axisTitleX?: string;
  axisTitleY?: string;
  headerExtras?: ReactNode;
};

const DEFAULT_TICKS = 5;

const niceNum = (range: number, round: boolean) => {
  if (range === 0) {
    return 1;
  }
  const exponent = Math.floor(Math.log10(Math.abs(range)));
  const fraction = range / Math.pow(10, exponent);
  let niceFraction: number;
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
  return niceFraction * Math.pow(10, exponent);
};

const buildNiceTicks = (min: number, max: number, tickCount = DEFAULT_TICKS) => {
  if (tickCount <= 1) {
    return [min, max];
  }
  const range = niceNum(max - min, false);
  const spacing = niceNum(range / (tickCount - 1), true);
  const niceMin = Math.floor(min / spacing) * spacing;
  const niceMax = Math.ceil(max / spacing) * spacing;
  const ticks: number[] = [];
  for (let value = niceMin; value <= niceMax + spacing / 2; value += spacing) {
    ticks.push(value);
  }
  return ticks;
};

export default function ChartPanel({
  title,
  description,
  points,
  labels,
  formatValue,
  formatLabel,
  axisTitleX = "Date",
  axisTitleY = "Amount",
  headerExtras,
}: ChartPanelProps) {
  const { axisYLabels, axisXLabels } = useMemo(() => {
    if (points.length === 0) {
      return { axisYLabels: [], axisXLabels: [] as string[] };
    }
    const min = Math.min(...points);
    const max = Math.max(...points);
    const ticks = buildNiceTicks(min, max);
    const axisY = ticks
      .slice()
      .reverse()
      .map((value) => formatValue(value));

    const maxLabels = 6;
    const labelCount = Math.min(labels.length || 1, maxLabels);
    const step = labelCount > 1 ? (labels.length - 1) / (labelCount - 1) : 0;
    const axisX = Array.from({ length: labelCount }, (_, index) =>
      Math.round(index * step),
    )
      .filter((index, position, list) => list.indexOf(index) === position)
      .filter((index) => labels[index])
      .map((index) => formatLabel(labels[index]));

    return { axisYLabels: axisY, axisXLabels: axisX };
  }, [formatLabel, formatValue, labels, points]);

  return (
    <div className="card chart-card">
      <div className="chart-header">
        <div>
          <h3>{title}</h3>
          {description ? <p className="muted">{description}</p> : null}
        </div>
        {headerExtras}
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
