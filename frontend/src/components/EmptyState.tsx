type EmptyStateProps = {
  title: string;
  description: string;
  actionLabel: string;
  onAction: () => void;
  actionHint?: string;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
  secondaryActionHint?: string;
  className?: string;
};

export default function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
  actionHint,
  secondaryActionLabel,
  onSecondaryAction,
  secondaryActionHint,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={`empty-state-card ${className ?? ""}`.trim()}
      role="status"
      aria-live="polite"
    >
      <div className="empty-state-copy">
        <span className="empty-state-label">What is this?</span>
        <h4>{title}</h4>
        <p className="muted">{description}</p>
      </div>
      <div className="empty-state-action">
        <span className="empty-state-label">Next best action</span>
        <div className="empty-state-actions">
          <button className="pill primary" type="button" onClick={onAction}>
            {actionLabel}
          </button>
          {secondaryActionLabel && onSecondaryAction ? (
            <button className="pill" type="button" onClick={onSecondaryAction}>
              {secondaryActionLabel}
            </button>
          ) : null}
        </div>
        {actionHint ? <span className="empty-state-note">{actionHint}</span> : null}
        {secondaryActionHint ? (
          <span className="empty-state-note">{secondaryActionHint}</span>
        ) : null}
      </div>
    </div>
  );
}
