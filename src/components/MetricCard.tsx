"use client";

const SayDoIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
  </svg>
);
const CarryIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
  </svg>
);
const VelocityIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
  </svg>
);
const PredictabilityIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const ICONS: Record<string, React.FC<{ className?: string }>> = {
  "Say/Do Ratio": SayDoIcon,
  "Sprint Carry Over": CarryIcon,
  "Team/Epic Velocity": VelocityIcon,
  "Feature Predictability": PredictabilityIcon,
};

const colorMap: Record<string, { bg: string; text: string }> = {
  blue: { bg: "bg-blue-50", text: "text-jira-blue" },
  green: { bg: "bg-green-50", text: "text-jira-green" },
  red: { bg: "bg-red-50", text: "text-jira-red" },
};

interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle: string;
  trend: number;
  trendLabel: string;
  color: "blue" | "green" | "red";
}

export function MetricCard({ title, value, subtitle, trend, trendLabel, color }: MetricCardProps) {
  const c = colorMap[color];
  const isPositive = trend >= 0;
  const Icon = ICONS[title];

  return (
    <div className={`${c.bg} rounded-lg p-4 border border-jira-border/50`}>
      <div className="flex items-start justify-between mb-3">
        <h3 className="text-sm font-bold text-jira-text-muted uppercase tracking-wider">{title}</h3>
      </div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-2xl font-bold text-jira-text">{value}</p>
        {Icon && <Icon className={`w-7 h-7 ${c.text}`} />}
      </div>
      <p className="text-xs text-jira-text-muted mb-3">{subtitle}</p>
      <div className={`flex items-center gap-1.5 text-xs font-bold ${isPositive ? "text-jira-green" : "text-jira-red"}`}>
        <svg
          className={`w-3 h-3 ${isPositive ? "text-jira-green" : "text-jira-red"}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d={isPositive ? "M5 15l7-7 7 7" : "M5 9l7 7 7-7"}
          />
        </svg>
        <span>{isPositive ? "+" : ""}{trend}%</span>
        <span className="text-jira-text-muted">{trendLabel}</span>
      </div>
    </div>
  );
}
