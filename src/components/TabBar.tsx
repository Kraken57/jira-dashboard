"use client";

type Tab = { id: string; label: string };

interface TabBarProps {
  tabs: Tab[];
  active: string;
  onChange: (id: string) => void;
}

export function TabBar({ tabs, active, onChange }: TabBarProps) {
  return (
    <nav
      aria-label="Dashboard sections"
      className="dashboard-tabbar flex w-full gap-1 overflow-x-auto py-2"
    >
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          aria-current={active === tab.id ? "page" : undefined}
          className={`flex shrink-0 items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-jira-blue focus-visible:ring-offset-2 ${
            active === tab.id
              ? "dashboard-tab-active bg-jira-blue-bg text-jira-blue shadow-sm"
              : "text-jira-text-muted hover:bg-jira-bg hover:text-jira-text"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  )
}
