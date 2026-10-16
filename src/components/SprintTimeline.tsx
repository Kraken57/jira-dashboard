"use strict";

import { Sprint } from "@/lib/mockData";

interface SprintTimelineProps {
  sprints: Sprint[];
  selectedSprintId: string | null;
  onSelect: (id: string) => void;
}

export function SprintTimeline({ sprints, selectedSprintId, onSelect }: SprintTimelineProps) {
  return (
    <div className="bg-white border border-jira-border rounded-lg p-4 mb-6">
      <h2 className="text-sm font-semibold text-jira-text mb-3 uppercase tracking-wider">
        Sprint Timeline
      </h2>
      <div className="overflow-x-auto pb-2">
        <div className="flex gap-2 min-w-max">
          {sprints.map((sprint) => {
            const isSelected = selectedSprintId === sprint.id;
            return (
              <button
                key={sprint.id}
                onClick={() => onSelect(sprint.id)}
                className={`flex flex-col gap-1.5 px-4 py-3 rounded-lg border min-w-[140px] transition-colors cursor-pointer ${
                  isSelected
                    ? "border-jira-blue bg-blue-50 text-jira-blue"
                    : "border-jira-border/50 text-jira-text-muted hover:border-jira-blue hover:bg-jira-bg/50"
                }`}
              >
                <span className="text-xs font-medium">{sprint.name}</span>
                <span className="text-xs text-jira-text-muted">{sprint.team}</span>
                <span className="text-[10px] text-jira-text-muted">
                  {sprint.startDate} &mdash; {sprint.endDate}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  )
}
