"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Dropdown } from "./Dropdown";

export type FilterKey =
  | "pod"
  | "quarter"
  | "sprint"
  | "developer"
  | "status";

export type FilterState = {
  pod: string;
  quarter: string;
  sprint: string;
  developer: string;
  status: string;
};

export interface FilterOption {
  id: string;
  name: string;
  sub?: string;
}

const LABELS: Record<FilterKey, string> = {
  pod: "Services / Pods",
  quarter: "Quarter / PI",
  sprint: "Sprint",
  developer: "Developer",
  status: "Status",
};

function Select({
  label,
  items,
  value,
  onChange,
}: {
  label: string;
  items: FilterOption[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div className="min-w-0" ref={ref}>
      <Dropdown
        label={label}
        items={items}
        value={value}
        onChange={onChange}
        open={open}
        onToggle={setOpen}
      />
    </div>
  );
}

interface TabFiltersProps {
  keys: FilterKey[];
  title?: string;
  value: FilterState;
  options: Partial<Record<FilterKey, FilterOption[]>>;
  onChange: (key: FilterKey, value: string) => void;
  onReset?: () => void;
  snapshot?: ReactNode;
}

export function TabFilters({
  keys,
  title,
  value,
  options,
  onChange,
  onReset,
  snapshot,
}: TabFiltersProps) {
  if (keys.length === 0) return null;

  return (
    <div className="bg-white border border-jira-border rounded-lg p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h2 className="text-xs font-bold text-jira-text-muted uppercase tracking-wider">
          Filters{title ? ` · ${title}` : ""}
        </h2>
        {(snapshot || onReset) && (
          <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
            {snapshot}
            {onReset && (
              <button
                type="button"
                onClick={onReset}
                className="inline-flex min-h-8 items-center gap-1.5 rounded-md border border-jira-border bg-white px-3 text-xs font-semibold text-jira-text-muted transition hover:border-jira-blue/30 hover:bg-jira-blue-bg hover:text-jira-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-jira-blue focus-visible:ring-offset-2"
              >
                Reset filters
              </button>
            )}
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-4">
        {keys.map((key) => (
          <div key={key} className="flex-1 min-w-[160px]">
            <Select
              label={LABELS[key]}
              items={options[key] || []}
              value={value[key]}
              onChange={(id) => onChange(key, id)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
