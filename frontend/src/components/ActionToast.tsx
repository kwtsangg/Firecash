import { useEffect } from "react";

export type ActionToastData = {
  title: string;
  description?: string;
};

type ActionToastProps = {
  toast: ActionToastData;
  onDismiss: () => void;
};

export default function ActionToast({ toast, onDismiss }: ActionToastProps) {
  useEffect(() => {
    const timeout = window.setTimeout(() => {
      onDismiss();
    }, 2600);
    return () => window.clearTimeout(timeout);
  }, [toast, onDismiss]);

  return (
    <div className="toast toast-floating" role="status" aria-live="polite">
      <div className="toast-header">
        <div className="toast-title">{toast.title}</div>
        <button
          type="button"
          className="toast-close"
          onClick={onDismiss}
          aria-label="Dismiss notification"
        >
          ×
        </button>
      </div>
      {toast.description && <div className="toast-body">{toast.description}</div>}
    </div>
  );
}
