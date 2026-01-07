type LoadingSkeletonProps = {
  lines?: number;
  label?: string;
  className?: string;
};

const widths = ["95%", "88%", "92%", "80%", "86%", "76%", "90%", "84%"];

export default function LoadingSkeleton({
  lines = 5,
  label = "Loading",
  className = "",
}: LoadingSkeletonProps) {
  return (
    <div className={`loading-skeleton ${className}`.trim()} role="status" aria-live="polite">
      <span className="loading-skeleton-label">{label}</span>
      <div className="loading-skeleton-lines" aria-hidden="true">
        {Array.from({ length: lines }).map((_, index) => (
          <span
            key={`${label}-${index}`}
            className="loading-skeleton-line"
            style={{ width: widths[index % widths.length] }}
          />
        ))}
      </div>
    </div>
  );
}
