"use client";

import { useState } from "react";
import { Sprint } from "@/lib/mockData";

interface SprintFilterProps {
  sprints: Sprint[];
  onChange: (sprintId: string) => void;
  value: string;
}

export function SprintFilter({ sprints, onChange, value }: SprintFilterProps) {
  const [open, setOpen] = useState(false);
  const selected = sprints.find((s) => s.id === value);

  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-jira-text-muted uppercase tracking-wider">
        Sprint
      </label>
      <div className="relative">
        <button
          onClick={() => setOpen(!open)}
          className="flex w-full items-center justify-between px-3 py-2 bg-white border border-jira-border rounded text-jira-text text-sm font-medium hover:bg-jira-bg/50 transition-colors focus:outline-none focus:ring-1 focus:ring-jira-blue"
        >
          <span>{selected?.name ?? "All Sprints"}</span>
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
            {sprints.map((sprint) => (
              <button
                key={sprint.id}
                onClick={() => {
                  onChange(sprint.id);
                  setOpen(false);
                }}
                className={`flex w-full items-center px-3 py-2 text-sm transition-colors ${
                  value === sprint.id
                    ? "bg-jira-blue text-white"
                    : "text-jira-text hover:bg-jira-bg/50"
                }`}
              >
                <div className="flex flex-col">
                  <span className="font-medium">{sprint.name}</span>
                  <span className="text-xs text-jira-text-muted">{sprint.team}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
