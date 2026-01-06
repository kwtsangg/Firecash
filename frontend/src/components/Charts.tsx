type LineChartProps = {
  points: number[];
};

export function LineChart({ points }: LineChartProps) {
  if (points.length === 0) {
    return <div className="chart-empty">No data</div>;
  }
  const max = Math.max(...points);
  const min = Math.min(...points);
  const range = max - min || 1;
  const path = points
    .map((value, index) => {
      const x = (index / (points.length - 1)) * 100;
      const y = 100 - ((value - min) / range) * 100;
      return `${index === 0 ? "M" : "L"} ${x} ${y}`;
    })
    .join(" ");

  return (
    <svg viewBox="0 0 100 100" className="chart-svg" preserveAspectRatio="none">
      <path d={path} fill="none" stroke="url(#lineGradient)" strokeWidth="3" />
      <defs>
        <linearGradient id="lineGradient" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stopColor="#7f5bff" />
          <stop offset="100%" stopColor="#5b6cff" />
        </linearGradient>
      </defs>
    </svg>
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
