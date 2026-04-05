import { cn } from "../lib/utils";

export function StatusPill({
  label,
  tone = "muted",
}: {
  label: string;
  tone?: "accent" | "secondary" | "muted" | "danger" | "success";
}) {
  return (
    <span
      className={cn(
        "status-pill interactive-pill inline-flex items-center rounded-full px-3 py-1.5 font-label text-[10px] font-extrabold uppercase tracking-[0.18em]",
        tone === "accent" &&
          "status-pill-accent bg-[rgba(var(--accent-rgb),0.14)] text-[var(--accent)]",
        tone === "secondary" &&
          "status-pill-secondary bg-[rgba(var(--secondary-rgb),0.14)] text-[var(--secondary)]",
        tone === "muted" &&
          "status-pill-muted bg-[var(--surface-muted)] text-[var(--muted)]",
        tone === "danger" &&
          "status-pill-danger bg-[rgba(var(--danger-rgb),0.12)] text-[var(--danger)]",
        tone === "success" &&
          "status-pill-success bg-[rgba(var(--accent-rgb),0.14)] text-[var(--accent-strong)]",
      )}
    >
      {label}
    </span>
  );
}
