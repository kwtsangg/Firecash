import { useEffect, useRef } from "react";

export type ActionToastData = {
  title: string;
  description?: string;
};

type ActionToastProps = {
  toast: ActionToastData;
  onDismiss: () => void;
};

export default function ActionToast({ toast, onDismiss }: ActionToastProps) {
  const timerId = useRef<number | null>(null);
  const startTime = useRef(0);
  const remaining = useRef(8000);

  const clearTimer = () => {
    if (timerId.current !== null) {
      window.clearTimeout(timerId.current);
      timerId.current = null;
    }
  };

  const startTimer = () => {
    clearTimer();
    startTime.current = Date.now();
    timerId.current = window.setTimeout(() => {
      onDismiss();
    }, remaining.current);
  };

  const pauseTimer = () => {
    if (timerId.current === null) {
      return;
    }
    remaining.current = Math.max(0, remaining.current - (Date.now() - startTime.current));
    clearTimer();
  };

  const resumeTimer = () => {
    if (timerId.current !== null) {
      return;
    }
    startTimer();
  };

  useEffect(() => {
    remaining.current = 8000;
    startTimer();
    return () => {
      clearTimer();
      remaining.current = 8000;
    };
  }, [toast, onDismiss]);

  return (
    <div
      className="toast toast-floating"
      role="status"
      aria-live="polite"
      onMouseEnter={pauseTimer}
      onMouseLeave={resumeTimer}
      onFocus={pauseTimer}
      onBlur={resumeTimer}
    >
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
