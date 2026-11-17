import type { TextareaHTMLAttributes } from "react";

export function Textarea({
  label,
  id,
  className = "",
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; id: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <textarea
        id={id}
        className={`min-h-24 rounded-lg border border-border bg-surface px-3 py-2 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 ${className}`}
        {...props}
      />
    </div>
  );
}
