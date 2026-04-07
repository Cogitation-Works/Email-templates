import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  RotateCcw,
  Sparkles,
  Sunrise,
  Sunset,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { cn } from "../lib/utils";

const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function parseScheduledValue(value: string) {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toLocalDateTimeValue(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function startOfCalendarGrid(date: Date) {
  const first = startOfMonth(date);
  return new Date(first.getFullYear(), first.getMonth(), 1 - first.getDay());
}

function isSameDay(left: Date | null, right: Date | null) {
  if (!left || !right) {
    return false;
  }
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function withTime(date: Date, hours: number, minutes: number) {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    hours,
    minutes,
    0,
    0,
  );
}

function nextBusinessDay(baseDate: Date) {
  const next = new Date(baseDate);
  next.setDate(next.getDate() + 1);
  while (next.getDay() === 0 || next.getDay() === 6) {
    next.setDate(next.getDate() + 1);
  }
  return next;
}

export function defaultScheduledDateTimeValue(reference = new Date()) {
  const next = new Date(reference);
  next.setSeconds(0, 0);
  const minutes = next.getMinutes();
  const roundedMinutes = minutes <= 30 ? 30 : 60;
  if (roundedMinutes === 60) {
    next.setHours(next.getHours() + 1, 0, 0, 0);
  } else {
    next.setMinutes(roundedMinutes, 0, 0);
  }

  if (next.getTime() <= reference.getTime()) {
    next.setMinutes(next.getMinutes() + 30, 0, 0);
  }

  return toLocalDateTimeValue(next);
}

export function formatScheduledDateTime(value: string) {
  const parsed = parseScheduledValue(value);
  if (!parsed) {
    return "Send immediately";
  }
  return parsed.toLocaleString([], {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function isFutureScheduledDateTimeValue(value: string) {
  const parsed = parseScheduledValue(value);
  return Boolean(parsed && parsed.getTime() > Date.now());
}

export function SchedulePicker({
  value,
  onChange,
  disabled = false,
  allowClear = true,
  title = "Schedule dispatch",
  description = "Choose the day, then refine the time.",
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  allowClear?: boolean;
  title?: string;
  description?: string;
}) {
  const selectedDate = parseScheduledValue(value);
  const [visibleMonth, setVisibleMonth] = useState(() =>
    startOfMonth(
      selectedDate ??
        parseScheduledValue(defaultScheduledDateTimeValue()) ??
        new Date(),
    ),
  );

  useEffect(() => {
    if (!selectedDate) {
      return;
    }
    setVisibleMonth((current) => {
      const next = startOfMonth(selectedDate);
      if (
        current.getFullYear() === next.getFullYear() &&
        current.getMonth() === next.getMonth()
      ) {
        return current;
      }
      return next;
    });
  }, [selectedDate]);

  const calendarDays = useMemo(() => {
    const start = startOfCalendarGrid(visibleMonth);
    return Array.from({ length: 42 }, (_, index) => {
      const day = new Date(start);
      day.setDate(start.getDate() + index);
      return day;
    });
  }, [visibleMonth]);

  const selectedTime =
    selectedDate && !Number.isNaN(selectedDate.getTime())
      ? `${pad(selectedDate.getHours())}:${pad(selectedDate.getMinutes())}`
      : "10:00";

  const today = new Date();

  const applyDay = (day: Date) => {
    const source =
      selectedDate ??
      parseScheduledValue(defaultScheduledDateTimeValue()) ??
      new Date();
    onChange(
      toLocalDateTimeValue(
        withTime(day, source.getHours(), source.getMinutes()),
      ),
    );
  };

  const applyTime = (timeValue: string) => {
    const [hoursText, minutesText] = timeValue.split(":");
    const hours = Number.parseInt(hoursText || "0", 10);
    const minutes = Number.parseInt(minutesText || "0", 10);
    const sourceDate =
      selectedDate ??
      parseScheduledValue(defaultScheduledDateTimeValue()) ??
      new Date();
    onChange(
      toLocalDateTimeValue(withTime(sourceDate, hours || 0, minutes || 0)),
    );
  };

  const quickDateOptions = [
    {
      id: "today",
      label: "Today",
      icon: Sparkles,
      value: () => {
        const base =
          parseScheduledValue(defaultScheduledDateTimeValue()) ?? new Date();
        return toLocalDateTimeValue(base);
      },
    },
    {
      id: "tomorrow",
      label: "Tomorrow",
      icon: Sunrise,
      value: () => {
        const base = new Date();
        base.setDate(base.getDate() + 1);
        return toLocalDateTimeValue(withTime(base, 9, 30));
      },
    },
    {
      id: "business",
      label: "Next business day",
      icon: CalendarDays,
      value: () => {
        const base = nextBusinessDay(new Date());
        return toLocalDateTimeValue(withTime(base, 10, 0));
      },
    },
  ];

  const quickTimeOptions = [
    { id: "morning", label: "09:30", icon: Sunrise, value: "09:30" },
    { id: "midday", label: "12:00", icon: Sparkles, value: "12:00" },
    { id: "afternoon", label: "15:30", icon: Clock3, value: "15:30" },
    { id: "evening", label: "18:00", icon: Sunset, value: "18:00" },
  ];

  return (
    <div
      className={cn(
        "rounded-[1.7rem] border border-[var(--line)] bg-[linear-gradient(180deg,rgba(var(--accent-rgb),0.08),rgba(var(--secondary-rgb),0.04)_42%,var(--surface-strong)_100%)] p-4 shadow-[0_20px_48px_rgba(var(--shadow),0.08)] sm:p-5",
        disabled && "opacity-60",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-[var(--accent)]">
            {title}
          </p>
          <p className="mt-2 text-sm leading-7 text-[var(--muted)]">
            {description}
          </p>
        </div>
        <div className="rounded-full border border-[rgba(var(--accent-rgb),0.18)] bg-[rgba(var(--bg-rgb),0.3)] px-4 py-2 text-right backdrop-blur-xl">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-[var(--soft)]">
            Selected slot
          </p>
          <p className="mt-1 text-sm font-black text-[var(--text)]">
            {formatScheduledDateTime(value)}
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-5">
        <div className="rounded-[1.5rem] border border-[var(--line)] bg-[rgba(var(--bg-rgb),0.2)] p-4">
          <div className="flex items-center justify-between gap-3">
            <button
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--line)] bg-[var(--surface)] text-[var(--text)] transition hover:border-[rgba(var(--accent-rgb),0.35)] hover:text-[var(--accent)] disabled:cursor-not-allowed"
              disabled={disabled}
              onClick={() =>
                setVisibleMonth(
                  (current) =>
                    new Date(current.getFullYear(), current.getMonth() - 1, 1),
                )
              }
              type="button"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="text-center">
              <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-[var(--soft)]">
                Calendar
              </p>
              <p className="mt-1 text-lg font-black text-[var(--text)]">
                {visibleMonth.toLocaleString([], {
                  month: "long",
                  year: "numeric",
                })}
              </p>
            </div>
            <button
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--line)] bg-[var(--surface)] text-[var(--text)] transition hover:border-[rgba(var(--accent-rgb),0.35)] hover:text-[var(--accent)] disabled:cursor-not-allowed"
              disabled={disabled}
              onClick={() =>
                setVisibleMonth(
                  (current) =>
                    new Date(current.getFullYear(), current.getMonth() + 1, 1),
                )
              }
              type="button"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-4 grid grid-cols-7 gap-2">
            {weekdayLabels.map((label) => (
              <div
                className="px-1 py-2 text-center text-[10px] font-extrabold uppercase tracking-[0.16em] text-[var(--soft)]"
                key={label}
              >
                {label}
              </div>
            ))}
            {calendarDays.map((day) => {
              const inCurrentMonth = day.getMonth() === visibleMonth.getMonth();
              const isSelected = isSameDay(day, selectedDate);
              const isToday = isSameDay(day, today);

              return (
                <button
                  className={cn(
                    "group relative flex min-h-[4rem] flex-col items-start justify-between rounded-[1rem] border px-3 py-2 text-left transition",
                    isSelected
                      ? "border-[rgba(var(--accent-rgb),0.42)] bg-[linear-gradient(160deg,rgba(var(--accent-rgb),0.22),rgba(var(--secondary-rgb),0.08))] text-[var(--text)] shadow-[0_14px_28px_rgba(var(--shadow),0.16)]"
                      : inCurrentMonth
                        ? "border-[var(--line)] bg-[var(--surface)] text-[var(--text)] hover:border-[rgba(var(--accent-rgb),0.24)] hover:bg-[var(--surface-high)]"
                        : "border-[var(--line)] bg-[rgba(var(--bg-rgb),0.18)] text-[var(--soft)] hover:border-[var(--line-strong)] hover:text-[var(--muted)]",
                  )}
                  disabled={disabled}
                  key={day.toISOString()}
                  onClick={() => applyDay(day)}
                  type="button"
                >
                  <span className="text-sm font-black">{day.getDate()}</span>
                  <span
                    className={cn(
                      "text-[10px] font-extrabold uppercase tracking-[0.16em]",
                      isSelected
                        ? "text-[var(--accent)]"
                        : isToday
                          ? "text-[var(--secondary)]"
                          : "text-[var(--soft)]",
                    )}
                  >
                    {isToday
                      ? "Today"
                      : day.toLocaleString([], { weekday: "short" })}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-[1.5rem] border border-[var(--line)] bg-[rgba(var(--bg-rgb),0.2)] p-4">
            <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-[var(--soft)]">
              Quick dates
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-3 xl:grid-cols-1">
              {quickDateOptions.map((option) => {
                const Icon = option.icon;
                return (
                  <button
                    className="inline-flex items-center justify-between gap-3 rounded-[1rem] border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-left text-sm font-bold text-[var(--text)] transition hover:border-[rgba(var(--accent-rgb),0.28)] hover:bg-[var(--surface-high)]"
                    disabled={disabled}
                    key={option.id}
                    onClick={() => onChange(option.value())}
                    type="button"
                  >
                    <span className="inline-flex items-center gap-2">
                      <Icon className="h-4 w-4 text-[var(--accent)]" />
                      {option.label}
                    </span>
                    <span className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[var(--soft)]">
                      Apply
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-[1.5rem] border border-[var(--line)] bg-[rgba(var(--bg-rgb),0.2)] p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-[var(--soft)]">
                Time control
              </p>
              <Clock3 className="h-4 w-4 text-[var(--secondary)]" />
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {quickTimeOptions.map((option) => {
                const Icon = option.icon;
                return (
                  <button
                    className={cn(
                      "inline-flex items-center justify-between gap-3 rounded-[1rem] border px-4 py-3 text-left text-sm font-bold transition",
                      selectedTime === option.value
                        ? "border-[rgba(var(--secondary-rgb),0.42)] bg-[rgba(var(--secondary-rgb),0.14)] text-[var(--text)]"
                        : "border-[var(--line)] bg-[var(--surface)] text-[var(--text)] hover:border-[rgba(var(--secondary-rgb),0.28)] hover:bg-[var(--surface-high)]",
                    )}
                    disabled={disabled}
                    key={option.id}
                    onClick={() => applyTime(option.value)}
                    type="button"
                  >
                    <span className="inline-flex items-center gap-2">
                      <Icon className="h-4 w-4 text-[var(--secondary)]" />
                      {option.value}
                    </span>
                    <span className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[var(--soft)]">
                      Preset
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="mt-4 rounded-[1rem] border border-[var(--line)] bg-[var(--surface)] px-4 py-3">
              <label className="block">
                <span className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-[var(--soft)]">
                  Exact time
                </span>
                <input
                  className="mt-2 h-[3.1rem] w-full rounded-xl border border-[var(--line)] bg-[var(--surface-lowest)] px-4 text-sm font-bold text-[var(--text)] outline-none focus:border-[rgba(var(--accent-rgb),0.3)] focus:ring-2 focus:ring-[rgba(var(--accent-rgb),0.12)]"
                  disabled={disabled}
                  onChange={(event) => applyTime(event.target.value)}
                  step={300}
                  type="time"
                  value={selectedTime}
                />
              </label>
            </div>
          </div>

          <div className="lg:col-span-2">
            {allowClear ? (
              <button
                className="inline-flex items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--surface)] px-4 py-2.5 text-[11px] font-extrabold uppercase tracking-[0.18em] text-[var(--muted)] transition hover:border-[rgba(var(--danger-rgb),0.24)] hover:text-[var(--danger)]"
                disabled={disabled}
                onClick={() => onChange("")}
                type="button"
              >
                <RotateCcw className="h-4 w-4" />
                Clear schedule
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
