"use client";

type Tab = { id: string; label: string };

interface TabBarProps {
  tabs: Tab[];
  active: string;
  onChange: (id: string) => void;
}

export function TabBar({ tabs, active, onChange }: TabBarProps) {
  return (
    <div className="flex gap-1 bg-white border-b border-jira-border p-1">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
            active === tab.id
              ? "bg-jira-blue text-white shadow-sm"
              : "text-jira-text-muted hover:text-jira-text hover:bg-jira-bg/50"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}
