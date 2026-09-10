'use client';

import { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from 'react';
import { AlertTriangle, Check, Inbox, Info, X } from 'lucide-react';
import { avatarHue, cx, initials } from '@/lib/format';

// ── Buttons ────────────────────────────────────────────────────────
export function Button({
  variant = 'default',
  size,
  className,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'default' | 'primary' | 'ghost' | 'danger' | 'soft' | 'outline'; size?: 'sm' | 'lg' }) {
  const v = variant === 'outline' ? '' : variant === 'default' ? '' : `btn-${variant}`;
  return <button className={cx('btn', v, size && `btn-${size}`, className)} {...rest} />;
}

// ── Avatar ─────────────────────────────────────────────────────────
export function Avatar({ user, size, className }: { user?: { name?: string; avatarUrl?: string } | null; size?: 'sm' | 'lg'; className?: string }) {
  const name = user?.name ?? '?';
  const hue = avatarHue(name);
  if (user?.avatarUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img className={cx('avatar', size && `avatar-${size}`, className)} src={user.avatarUrl} alt={name} />;
  }
  return (
    <span className={cx('avatar', size && `avatar-${size}`, className)} style={{ ['--hue' as any]: hue }} aria-hidden>
      {initials(name)}
    </span>
  );
}

export function AvatarStack({ users, max = 4 }: { users?: Array<{ id: string; name: string; avatarUrl?: string }> | null; max?: number }) {
  const list = (users ?? []).slice(0, max);
  if (!list.length) return <span className="dim" style={{ fontSize: 12 }}>—</span>;
  return (
    <span className="avatar-stack">
      {list.map((u) => (
        <Avatar key={u.id} user={u} size="sm" />
      ))}
      {(users?.length ?? 0) > max && <span className="avatar avatar-sm" style={{ background: 'var(--bg-4)', color: 'var(--text-2)' }}>+{(users!.length) - max}</span>}
    </span>
  );
}

// ── Modal ──────────────────────────────────────────────────────────
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  wide,
  labelledBy,
}: {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
  labelledBy?: string;
}) {
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={cx('modal', wide && 'modal-wide')} role="dialog" aria-modal="true" aria-labelledby={labelledBy ?? id}>
        <div className="modal-head">
          <h3 id={labelledBy ?? id} style={{ fontSize: 16 }}>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><X /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Confirm({ open, onClose, onConfirm, title, message, confirmLabel = 'Delete', danger }: { open: boolean; onClose: () => void; onConfirm: () => void; title: string; message: string; confirmLabel?: string; danger?: boolean }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button onClick={onClose} variant="ghost">Cancel</Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={() => { onConfirm(); onClose(); }}>{confirmLabel}</Button>
        </>
      }
    >
      <p className="muted">{message}</p>
    </Modal>
  );
}

// ── Dropdown menu ──────────────────────────────────────────────────
export function Menu({ button, children, align = 'right', label, width }: { button: React.ReactNode; children: React.ReactNode; align?: 'left' | 'right'; label?: string; width?: number }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);
  return (
    <div style={{ position: 'relative' }} ref={ref}>
      <span onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }} role="button" tabIndex={0} aria-haspopup="menu" aria-expanded={open} aria-label={label} onKeyDown={(e) => e.key === 'Enter' && setOpen((o) => !o)}>
        {button}
      </span>
      {open && (
        <div className={cx('menu', align === 'left' && 'menu-left')} role="menu" style={width ? { width } : undefined} onClick={() => setOpen(false)}>
          {children}
        </div>
      )}
    </div>
  );
}

export function MenuItem({ children, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className="menu-item" role="menuitem" {...rest}>{children}</button>;
}

// ── Fields ─────────────────────────────────────────────────────────
export function Field({ label, hint, error, children, className }: { label?: string; hint?: string; error?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cx('field', className)}>
      {label && <label>{label}</label>}
      {children}
      {hint && !error && <span className="hint">{hint}</span>}
      {error && <span className="error-text" role="alert">{error}</span>}
    </div>
  );
}

export function Input({ className, ...rest }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx('input', className)} {...rest} />;
}

export function Textarea({ className, ...rest }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx('textarea', className)} {...rest} />;
}

export function Select({ className, children, ...rest }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cx('select', className)} {...rest}>
      {children}
    </select>
  );
}

export function Switch({ checked, onChange, label, id }: { checked: boolean; onChange: (v: boolean) => void; label?: string; id?: string }) {
  const uid = useId();
  return (
    <label className="check-row" htmlFor={id ?? uid}>
      <span className="switch">
        <input type="checkbox" id={id ?? uid} checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span className="slider" />
      </span>
      {label && <span>{label}</span>}
    </label>
  );
}

// ── Misc ───────────────────────────────────────────────────────────
export function Spinner({ label }: { label?: string }) {
  return (
    <div className="center-box" role="status">
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
        <div className="spinner" />
        {label && <div className="dim">{label}</div>}
      </div>
    </div>
  );
}

export function LoadingBox({ rows = 4 }: { rows?: number }) {
  return (
    <div className="stack" aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="card card-pad">
          <div className="skeleton" style={{ height: 14, width: '35%' }} />
          <div className="skeleton" style={{ height: 14, width: '80%', marginTop: 10 }} />
        </div>
      ))}
    </div>
  );
}

export function EmptyState({ icon, title, sub, action }: { icon?: React.ReactNode; title: string; sub?: string; action?: React.ReactNode }) {
  return (
    <div className="state-card card card-pad state-inline">
      {icon ?? <Inbox />}
      <div>
        <div className="state-title">{title}</div>
        {sub && <div className="state-sub">{sub}</div>}
      </div>
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry, title = 'Something went wrong' }: { message?: string; onRetry?: () => void; title?: string }) {
  return (
    <div className="state-card card card-pad state-inline">
      <AlertTriangle />
      <div>
        <div className="state-title">{title}</div>
        <div className="state-sub">{message ?? 'Unable to load this page.'}</div>
      </div>
      {onRetry && <Button onClick={onRetry} size="sm">Try again</Button>}
    </div>
  );
}

export function Tabs({ items, value, onChange }: { items: Array<{ key: string; label: string; badge?: number }>; value: string; onChange: (key: string) => void }) {
  return (
    <div className="tabs" role="tablist">
      {items.map((t) => (
        <button key={t.key} className={cx('tab', value === t.key && 'active')} role="tab" aria-selected={value === t.key} onClick={() => onChange(t.key)}>
          {t.label}
          {t.badge !== undefined && t.badge > 0 && <span className="chip" style={{ marginLeft: 6 }}>{t.badge}</span>}
        </button>
      ))}
    </div>
  );
}

export function Progress({ value, label, green }: { value: number; label?: string; green?: boolean }) {
  return (
    <div>
      {label && (
        <div className="progress-label">
          <span>{label}</span>
          <span>{value}%</span>
        </div>
      )}
      <div className={cx('progress', green && 'green')} role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
        <i style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      </div>
    </div>
  );
}

// ── Toasts ─────────────────────────────────────────────────────────
type ToastKind = 'success' | 'error' | 'info';
type ToastItem = { id: number; kind: ToastKind; title: string; message?: string };
const ToastCtx = createContext<{ push: (kind: ToastKind, title: string, message?: string) => void }>({ push: () => undefined });

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);
  const push = useCallback((kind: ToastKind, title: string, message?: string) => {
    const id = ++seq.current;
    setItems((prev) => [...prev.slice(-3), { id, kind, title, message }]);
    window.setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), kind === 'error' ? 6000 : 3800);
  }, []);
  return (
    <ToastCtx.Provider value={{ push }}>
      {children}
      <div className="toasts" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={cx('toast', t.kind)}>
            {t.kind === 'success' && <Check />}
            {t.kind === 'error' && <AlertTriangle />}
            {t.kind === 'info' && <Info />}
            <div>
              <div className="t-title">{t.title}</div>
              {t.message && <div className="t-msg">{t.message}</div>}
            </div>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  return useContext(ToastCtx);
}

/** Friendly message resolution for API failures + AI not-configured state. */
export function errMsg(err: unknown): string {
  const e = err as { code?: string; message?: string } | null;
  if (!e) return 'Request failed';
  if (e.code === 'AI_NOT_CONFIGURED') return 'AI features are not configured. Add an AI provider key to the Python service (.env) to enable them.';
  if (e.code === 'AI_SERVICE_UNAVAILABLE') return 'The AI service is not running — start the Python service and try again.';
  if (e.code === 'AI_TIMEOUT') return 'The AI service took too long to respond. Try again.';
  return e.message ?? 'Request failed';
}
