"use client";

type Tab = { id: string; label: string };

interface TabBarProps {
  tabs: Tab[];
  active: string;
  onChange: (id: string) => void;
}

export function TabBar({ tabs, active, onChange }: TabBarProps) {
  return (
    <div className="dashboard-tabbar flex gap-1 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm shadow-slate-900/5">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
            active === tab.id
              ? "dashboard-tab-active bg-jira-blue text-white shadow-sm"
              : "text-jira-text-muted hover:text-jira-text hover:bg-jira-bg/50"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}
