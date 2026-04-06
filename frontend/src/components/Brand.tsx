export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={
        compact ? "flex items-center gap-1" : "flex items-center gap-2"
      }
    >
      <div
        className={
          compact
            ? "grid h-10 w-10 place-items-center rounded-xl bg-[rgba(var(--accent-rgb),0.14)]"
            : "grid h-11 w-11 place-items-center rounded-xl bg-[rgba(var(--accent-rgb),0.14)]"
        }
      >
        <img
          alt="Cogitation Works"
          className={
            compact ? "h-9 w-9 object-cover" : "h-17 w-17 object-cover"
          }
          src="/cw-logo.png"
        />
      </div>
      <div>
        <p
          className={
            compact
              ? "text-[0.9rem] font-bold tracking-tight whitespace-nowrap"
              : "text-xl font-bold tracking-tight"
          }
        >
          Cogitation Works
        </p>
        {!compact ? (
          <p className="font-label text-[10px] uppercase tracking-[0.24em] text-[var(--soft)]">
            Command Center
          </p>
        ) : null}
      </div>
    </div>
  );
}
