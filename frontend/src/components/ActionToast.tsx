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
  }, [onDismiss]);

  return (
    <div className="toast" role="status" aria-live="polite">
      <div className="toast-title">{toast.title}</div>
      {toast.description && <div className="toast-body">{toast.description}</div>}
    </div>
  );
}
