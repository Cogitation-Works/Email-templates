import { forwardRef } from "react";

import { cn } from "../lib/utils";

interface FieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  helper?: string;
  textarea?: false;
  variant?: "panel" | "editorial";
}

interface TextareaFieldProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  helper?: string;
  textarea: true;
  variant?: "panel" | "editorial";
}

type Props = FieldProps | TextareaFieldProps;

export const Field = forwardRef<HTMLInputElement | HTMLTextAreaElement, Props>(
  function Field(
    { label, helper, className, textarea, variant = "panel", ...props },
    ref,
  ) {
    const sharedClass =
      "w-full bg-[var(--surface-lowest)] text-sm text-[var(--text)] outline-none transition placeholder:text-[var(--soft)]";
    const panelClass =
      "rounded-xl border border-[var(--line)] px-4 py-3.5 focus:border-[rgba(var(--accent-rgb),0.26)] focus:ring-2 focus:ring-[rgba(var(--accent-rgb),0.12)]";
    const editorialClass =
      "rounded-none border-0 border-b border-[rgba(var(--accent-rgb),0.16)] bg-transparent px-0 py-3.5 focus:border-[var(--accent)] focus:ring-0";

    return (
      <label className="block">
        <span className="field-label mb-2.5 block font-label text-[11px] font-extrabold uppercase tracking-[0.22em] text-[var(--soft)]">
          {label}
        </span>
        {textarea ? (
          <textarea
            {...(props as React.TextareaHTMLAttributes<HTMLTextAreaElement>)}
            className={cn(
              "field-input min-h-32",
              sharedClass,
              variant === "panel" ? panelClass : editorialClass,
              className,
            )}
            ref={ref as React.Ref<HTMLTextAreaElement>}
          />
        ) : (
          <input
            {...(props as React.InputHTMLAttributes<HTMLInputElement>)}
            className={cn(
              "field-input h-[3.25rem]",
              sharedClass,
              variant === "panel" ? panelClass : editorialClass,
              className,
            )}
            ref={ref as React.Ref<HTMLInputElement>}
          />
        )}
        {helper ? (
          <span className="field-helper mt-2 block text-xs leading-6 text-[var(--muted)]">
            {helper}
          </span>
        ) : null}
      </label>
    );
  },
);
