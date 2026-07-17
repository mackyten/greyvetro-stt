import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';

type Variant = 'success' | 'error' | 'info';

interface Toast {
  id: number;
  message: string;
  variant: Variant;
  leaving?: boolean;
}

const ToastContext = createContext<(message: string, variant?: Variant) => void>(() => {});

/** Show a transient snackbar: `const toast = useToast(); toast('Preset saved.')`. */
export const useToast = () => useContext(ToastContext);

const VISIBLE_MS = 2700;
const EXIT_MS = 300;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const show = useCallback((message: string, variant: Variant = 'success') => {
    const id = nextId.current++;
    setToasts((list) => [...list, { id, message, variant }]);
    setTimeout(
      () => setToasts((list) => list.map((t) => (t.id === id ? { ...t, leaving: true } : t))),
      VISIBLE_MS,
    );
    setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), VISIBLE_MS + EXIT_MS);
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="toast-stack">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.variant}${t.leaving ? ' leaving' : ''}`} role="status">
            <span className="toast-icon">
              {t.variant === 'success' ? '✓' : t.variant === 'error' ? '✕' : 'ℹ'}
            </span>
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
