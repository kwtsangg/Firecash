type ErrorStateProps = {
  headline: string;
  details?: string[];
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
};

export default function ErrorState({
  headline,
  details = [],
  onRetry,
  retryLabel = "Retry",
  className,
}: ErrorStateProps) {
  return (
    <div className={`page-state error ${className ?? ""}`.trim()} role="alert">
      <p>{headline}</p>
      {details.length > 0 ? (
        <>
          <p className="muted">Debug details</p>
          <ul>
            {details.map((detail) => (
              <li key={detail}>{detail}</li>
            ))}
          </ul>
        </>
      ) : null}
      {onRetry ? (
        <button className="pill" type="button" onClick={onRetry}>
          {retryLabel}
        </button>
      ) : null}
    </div>
  );
}
