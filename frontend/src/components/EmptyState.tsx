type EmptyStateProps = {
  title: string;
  description: string;
  actionLabel: string;
  onAction: () => void;
  actionHint?: string;
};

export default function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
  actionHint,
}: EmptyStateProps) {
  return (
    <div className="empty-state-card">
      <div className="empty-state-copy">
        <span className="empty-state-label">What is this?</span>
        <h4>{title}</h4>
        <p className="muted">{description}</p>
      </div>
      <div className="empty-state-action">
        <span className="empty-state-label">Next best action</span>
        <button className="pill primary" type="button" onClick={onAction}>
          {actionLabel}
        </button>
        {actionHint ? <span className="empty-state-note">{actionHint}</span> : null}
      </div>
    </div>
  );
}
