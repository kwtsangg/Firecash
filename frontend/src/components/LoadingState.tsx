type LoadingStateProps = {
  title: string;
  description?: string;
  className?: string;
};

export default function LoadingState({ title, description, className }: LoadingStateProps) {
  return (
    <div
      className={`page-state loading-state ${className ?? ""}`.trim()}
      role="status"
      aria-live="polite"
    >
      <div className="loading-spinner" aria-hidden="true" />
      <div className="loading-state-copy">
        <p className="loading-state-title">{title}</p>
        {description ? <p className="muted">{description}</p> : null}
      </div>
    </div>
  );
}
