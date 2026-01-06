type KpiCardProps = {
  label: string;
  value: string;
  trend?: string;
  footnote?: string;
};

export default function KpiCard({ label, value, trend, footnote }: KpiCardProps) {
  return (
    <div className="card kpi-card">
      <div className="kpi-header">
        <span>{label}</span>
        {trend ? <span className="kpi-trend">{trend}</span> : null}
      </div>
      <p className="metric">{value}</p>
      {footnote ? <p className="muted">{footnote}</p> : null}
    </div>
  );
}
