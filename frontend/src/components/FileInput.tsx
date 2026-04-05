import { Paperclip } from "lucide-react";

export function FileInput({
  label,
  helper,
  files,
  onChange,
}: {
  label: string;
  helper?: string;
  files: File[];
  onChange: (files: File[]) => void;
}) {
  return (
    <div className="file-input-panel surface-strong rounded-[1.6rem] p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-bold text-[var(--text)]">{label}</p>
          {helper ? (
            <p className="mt-2 max-w-xl text-sm leading-6 text-[var(--muted)]">
              {helper}
            </p>
          ) : null}
        </div>
        <label className="file-input-add inline-flex cursor-pointer items-center gap-2 rounded-full border border-dashed border-[var(--line-strong)] bg-[var(--surface)] px-4 py-2.5 text-[11px] font-extrabold uppercase tracking-[0.18em] text-[var(--text)] transition hover:border-[rgba(var(--accent-rgb),0.42)]">
          <Paperclip className="h-4 w-4 text-[var(--accent)]" />
          <span>Add files</span>
          <input
            className="hidden"
            multiple
            onChange={(event) => onChange(Array.from(event.target.files ?? []))}
            type="file"
          />
        </label>
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        {files.length === 0 ? (
          <div className="file-input-empty rounded-2xl bg-[var(--surface)] px-4 py-3 text-xs text-[var(--soft)]">
            No files selected yet.
          </div>
        ) : (
          files.map((file, index) => (
            <div
              className="file-input-item rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3"
              key={`${file.name}-${file.size}`}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-[var(--text)]">
                    {file.name}
                  </p>
                  <p className="mt-1 text-xs text-[var(--soft)]">
                    {(file.size / 1024).toFixed(1)} KB
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    className="file-input-download rounded-full border border-[var(--line)] px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-[0.16em] text-[var(--text)]"
                    onClick={() => {
                      const url = URL.createObjectURL(file);
                      const link = document.createElement("a");
                      link.href = url;
                      link.download = file.name;
                      link.click();
                      URL.revokeObjectURL(url);
                    }}
                    type="button"
                  >
                    Download
                  </button>
                  <button
                    aria-label={`Remove ${file.name}`}
                    className="file-input-remove grid h-7 w-7 place-items-center rounded-full bg-[rgba(var(--danger-rgb),0.12)] text-sm font-black text-[var(--danger)]"
                    onClick={() =>
                      onChange(
                        files.filter((_, fileIndex) => fileIndex !== index),
                      )
                    }
                    type="button"
                  >
                    X
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
