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
  pod: string[];
  quarter: string[];
  sprint: string[];
  developer: string[];
  status: string;
};
export type FilterValue = string | string[];

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

function MultiSelect({
  label,
  items,
  value,
  onChange,
}: {
  label: string;
  items: FilterOption[];
  value: string[];
  onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selectedItems = items.filter((item) => value.includes(item.id));
  const selectableIds = items.filter((item) => item.id !== "all").map((item) => item.id);
  const allSelected = value.includes("all")
    || (selectableIds.length > 0 && selectableIds.every((id) => value.includes(id)));
  const summary = allSelected
    ? items.find((item) => item.id === "all")?.name ?? "All"
    : value.length === 0
      ? "None selected"
      : value.length === 1
      ? selectedItems[0]?.name ?? "1 selected"
      : `${selectedItems[0]?.name ?? value[0]} +${value.length - 1}`;

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1" ref={ref}>
      <label className="text-xs font-medium uppercase tracking-wider text-jira-text-muted">
        {label}
      </label>
      <div className="relative">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
          className="flex w-full items-center justify-between rounded border border-jira-border bg-white px-3 py-2 text-left text-sm font-medium text-jira-text transition-colors hover:bg-jira-bg/50 focus:outline-none focus:ring-1 focus:ring-jira-blue"
        >
          <span className="truncate">{summary}</span>
          <span className="ml-2 text-xs text-jira-text-muted">{open ? "▲" : "▼"}</span>
        </button>
        {open && (
          <div className="absolute z-30 mt-1 w-full min-w-[220px] overflow-hidden rounded border border-jira-border bg-white shadow-lg">
            <div className="flex items-center justify-between border-b border-jira-border px-3 py-2">
              <span className="text-xs font-semibold text-jira-text-muted">Select one or more</span>
              <button
                type="button"
                onClick={() => onChange([])}
                className="text-xs font-semibold text-jira-blue hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-jira-blue"
              >
                Deselect all
              </button>
            </div>
            <div className="max-h-64 overflow-y-auto py-1">
              {items.map((item) => {
                const isAll = item.id === "all";
                const checked = isAll ? allSelected : allSelected || value.includes(item.id);
                return (
                  <label
                    key={item.id}
                    className="flex cursor-pointer items-start gap-2.5 px-3 py-2 text-sm text-jira-text hover:bg-jira-bg/60"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        if (isAll) {
                          onChange(allSelected ? [] : ["all"]);
                        } else if (allSelected) {
                          onChange([item.id]);
                        } else {
                          const next = checked
                            ? value.filter((id) => id !== item.id && id !== "all")
                            : [...value.filter((id) => id !== "all"), item.id];
                          onChange(selectableIds.every((id) => next.includes(id)) ? ["all"] : next);
                        }
                      }}
                      className="mt-0.5 accent-jira-blue"
                    />
                    <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
                      <span className="truncate">{item.name}</span>
                      {item.sub && <span className="shrink-0 text-xs text-jira-text-muted">{item.sub}</span>}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

interface TabFiltersProps {
  keys: FilterKey[];
  title?: string;
  value: FilterState;
  options: Partial<Record<FilterKey, FilterOption[]>>;
  onChange: (key: FilterKey, value: FilterValue) => void;
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
            {key === "pod" || key === "quarter" || key === "sprint" || key === "developer" ? (
              <MultiSelect
                label={LABELS[key]}
                items={options[key] || []}
                value={value[key] as string[]}
                onChange={(ids) => onChange(key, ids)}
              />
            ) : (
              <Select
                label={LABELS[key]}
                items={options[key] || []}
                value={value[key] as string}
                onChange={(id) => onChange(key, id)}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
