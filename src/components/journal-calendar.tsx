"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";

export type CalendarEntry = { id: string; title?: string; createdAt: string | null };

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

/**
 * A month-view tracker calendar: days with at least one saved journal entry
 * get a small marker, so the user can see their journaling rhythm at a
 * glance and jump straight to any day's entries — like flipping back
 * through a physical diary instead of scrolling a flat list.
 */
export function JournalCalendar({
  entries,
  selectedDate,
  onSelectDate,
}: {
  entries: CalendarEntry[];
  selectedDate: string | null;
  onSelectDate: (dateKey: string | null) => void;
}) {
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const entryCountsByDate = useMemo(() => {
    const counts = new Map<string, number>();
    for (const entry of entries) {
      if (!entry.createdAt) continue;
      const key = toDateKey(new Date(entry.createdAt));
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [entries]);

  const todayKey = toDateKey(new Date());

  const weeks = useMemo(() => {
    const year = visibleMonth.getFullYear();
    const month = visibleMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const startOffset = firstDay.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const cells: (Date | null)[] = [];
    for (let i = 0; i < startOffset; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
    while (cells.length % 7 !== 0) cells.push(null);

    const rows: (Date | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
    return rows;
  }, [visibleMonth]);

  const monthLabel = visibleMonth.toLocaleDateString(undefined, { month: "long", year: "numeric" });

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <button
          onClick={() => setVisibleMonth(new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() - 1, 1))}
          className="rounded-full px-2 py-1 text-sm text-stone-500 transition-colors hover:bg-stone-200/50 dark:text-stone-400 dark:hover:bg-stone-800"
          aria-label="Previous month"
        >
          ‹
        </button>
        <span className="font-journal text-sm font-medium text-stone-700 dark:text-stone-200">{monthLabel}</span>
        <button
          onClick={() => setVisibleMonth(new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 1))}
          className="rounded-full px-2 py-1 text-sm text-stone-500 transition-colors hover:bg-stone-200/50 dark:text-stone-400 dark:hover:bg-stone-800"
          aria-label="Next month"
        >
          ›
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-stone-400 dark:text-stone-500">
        {WEEKDAYS.map((w, i) => (
          <span key={i}>{w}</span>
        ))}
      </div>

      <div className="mt-1 grid grid-cols-7 gap-1">
        {weeks.flatMap((week, wi) =>
          week.map((day, di) => {
            if (!day) return <span key={`${wi}-${di}`} />;
            const key = toDateKey(day);
            const count = entryCountsByDate.get(key) ?? 0;
            const isSelected = selectedDate === key;
            const isToday = key === todayKey;
            return (
              <motion.button
                key={key}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => onSelectDate(isSelected ? null : key)}
                className={
                  "relative flex h-8 w-8 flex-col items-center justify-center rounded-full text-xs transition-colors " +
                  (isSelected
                    ? "bg-gradient-to-br from-amber-300 to-rose-300 text-stone-900 shadow-sm"
                    : isToday
                      ? "border border-amber-400 text-stone-700 dark:text-stone-200"
                      : "text-stone-600 hover:bg-stone-200/50 dark:text-stone-300 dark:hover:bg-stone-800")
                }
              >
                {day.getDate()}
                {count > 0 && !isSelected && (
                  <span className="absolute bottom-0.5 h-1 w-1 rounded-full bg-gradient-to-r from-amber-400 to-violet-400" />
                )}
              </motion.button>
            );
          })
        )}
      </div>
    </div>
  );
}
