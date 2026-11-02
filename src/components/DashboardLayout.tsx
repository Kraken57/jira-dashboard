"use client";

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  return (
    <div className="min-h-screen bg-jira-bg font-sans antialiased">
      <nav className="dashboard-topbar sticky top-0 z-30 border-b border-jira-border bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[92rem] items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-jira-blue text-xs font-bold text-white shadow-sm shadow-jira-blue/20">
              J
            </div>
            <span className="font-semibold text-jira-text text-sm tracking-tight">Jira dashboard</span>
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-[92rem] px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        {children}
      </main>
    </div>
  );
}
