"use client";

interface DashboardLayoutProps {
  children: React.ReactNode;
  navigation?: React.ReactNode;
}

export function DashboardLayout({ children, navigation }: DashboardLayoutProps) {
  return (
    <div className="min-h-screen bg-jira-bg font-sans antialiased">
      {navigation && (
        <header className="dashboard-topbar sticky top-0 z-40 border-b border-jira-border bg-white/95 backdrop-blur-xl">
          <div className="mx-auto max-w-[92rem] px-4 sm:px-6 lg:px-8">
            {navigation}
          </div>
        </header>
      )}

      <main className="mx-auto max-w-[92rem] px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
        {children}
      </main>
    </div>
  );
}
