"use client";

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  return (
    <div className="min-h-screen bg-jira-bg font-sans antialiased">
      <nav className="bg-white border-b border-jira-border">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-jira-blue rounded flex items-center justify-center text-white font-bold text-xs">
              J
            </div>
            <span className="font-semibold text-jira-text text-sm tracking-tight">Jira dashboard</span>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {children}
      </main>
    </div>
  );
}
