'use client';

import type { ChangeEvent, InputHTMLAttributes } from 'react';

export type EventIdInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type' | 'placeholder'
> & {
  label?: string;
  /** Additional wrapper classes */
  containerClassName?: string;
};

/**
 * Controlled Event ID field — empty by default, no hardcoded value.
 * Use placeholder="Enter Event ID" in production UIs.
 */
export default function EventIdInput({
  label,
  id = 'event-id-input',
  className = '',
  containerClassName = '',
  value,
  onChange,
  ...rest
}: EventIdInputProps) {
  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    onChange?.(e);
  };

  return (
    <div className={containerClassName}>
      {label ? (
        <label
          htmlFor={id}
          className="block text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] mb-2 ml-1"
        >
          {label}
        </label>
      ) : null}
      <input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        spellCheck={false}
        placeholder="Enter Event ID"
        value={value ?? ''}
        onChange={handleChange}
        {...rest}
        className={className}
      />
    </div>
  );
}
