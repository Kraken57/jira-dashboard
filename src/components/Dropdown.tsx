"use client";

import { forwardRef } from "react";

interface DropdownProps {
  label: string;
  items: { id: string; name: string; sub?: string }[];
  onChange: (id: string) => void;
  value: string;
  open: boolean;
  onToggle: (open: boolean) => void;
}

const Dropdown = forwardRef<HTMLDivElement, DropdownProps>(({ label, items, onChange, value, open, onToggle }, ref) => {
  const selected = items.find((i) => i.id === value);

  return (
    <div className="flex flex-col gap-1 flex-1 min-w-0" ref={ref}>
      <label className="text-xs font-medium text-jira-text-muted uppercase tracking-wider">
        {label}
      </label>
      <div className="relative">
        <button
          onClick={() => onToggle(!open)}
          className="flex w-full items-center justify-between px-3 py-2 bg-white border border-jira-border rounded text-jira-text text-sm font-medium hover:bg-jira-bg/50 transition-colors focus:outline-none focus:ring-1 focus:ring-jira-blue"
        >
          <span>{selected?.name ?? "All"}</span>
          <svg
            className={`w-3.5 h-3.5 text-jira-text-muted transition-transform ${open ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {open && (
          <div className="absolute z-20 w-full mt-1 bg-white border border-jira-border rounded shadow-lg max-h-60 overflow-y-auto">
            {items.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  onChange(item.id);
                  onToggle(false);
                }}
                className={`flex w-full items-center px-3 py-2 text-sm transition-colors ${
                  value === item.id
                    ? "bg-jira-blue text-white"
                    : "text-jira-text hover:bg-jira-bg/50"
                }`}
              >
                <div className="flex w-full items-center justify-between gap-2 min-w-0">
                  <span className="font-medium truncate">{item.name}</span>
                  {item.sub && (
                    <span
                      className={`text-xs whitespace-nowrap shrink-0 ${
                        value === item.id ? "text-white/75" : "text-jira-text-muted"
                      }`}
                    >
                      {item.sub}
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
});

Dropdown.displayName = "Dropdown";

export { Dropdown };
