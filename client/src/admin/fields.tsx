import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react';
import { cx } from '../components/ui';

export const inputClass =
  'h-9 w-full rounded-md border border-line bg-page px-3 text-base text-fg sm:text-sm outline-none transition-colors placeholder:text-faint focus:border-accent disabled:opacity-50';

export function Field({ label, hint, children, className }: { label: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cx('block', className)}>
      <span className="mb-1.5 flex items-baseline justify-between gap-2 text-[13px] text-muted">
        {label}
        {hint && <span className="text-[12px] text-faint">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

export function TextInput({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx(inputClass, className)} {...rest} />;
}

export function TextArea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx(inputClass, 'h-auto min-h-24 py-2 leading-relaxed', className)} {...rest} />;
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: [T, string][];
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex rounded-md border border-line bg-page p-0.5">
      {options.map(([key, label]) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          className={cx('h-7 rounded px-3 text-[13px] transition-colors', value === key ? 'bg-raised text-fg' : 'text-muted hover:text-fg')}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
