import { MetricInsight } from "./types";

const DEFINITIONS: Record<string, Omit<MetricInsight, "recent" | "trend">> = {
  "Say/Do Ratio": {
    what: "Share of committed story points that was actually completed in the selected scope.",
    formula: "Done SP ÷ Committed SP × 100",
    howToCompare:
      "Compare with the 80% target, the previous sprint, and other pods. A drop usually means late scope or stalled work.",
    target: { label: "Healthy", value: 80, unit: "%", direction: "atLeast" },
  },
  "Sprint Carry Over": {
    what: "Share of committed story points that was not completed and spilled into later work.",
    formula: "Carried SP ÷ Committed SP × 100",
    howToCompare:
      "Lower is better. Compare with the 18% target and use Delivery Diagnosis to see why work was carried.",
    target: { label: "Healthy", value: 18, unit: "%", direction: "atMost" },
  },
  "Team/Epic Velocity": {
    what: "Story points completed in the selected period.",
    formula: "Sum of story points on done items",
    howToCompare:
      "Compare with the previous sprint and the 3-sprint average. Rising velocity is good only if Say/Do and quality stay stable.",
  },
  "Future Predictability": {
    what:
      "Percentage of planned features expected to be delivered by their due date. A feature is forecast to finish on time when its estimated remaining work can be completed by its due date based on the team's delivery rate.",
    formula:
      "Features forecast to finish on or before due date ÷ planned features with a future due date × 100",
    howToCompare:
      "Compare with the 85% target. In the popup, the Reason column separates On Forecast from At Risk features.",
    target: { label: "On track", value: 85, unit: "%", direction: "atLeast" },
  },

  "Total Work Items": {
    what: "Every work item in the current Pod, Quarter, and Sprint scope.",
    howToCompare:
      "Use this as the denominator for the other cards. Compare the total with Completed and In Flight to see how much scope is finished.",
  },
  "Completed (Done)": {
    what: "Work items whose status is configured as done.",
    formula: "Count of items with a done status",
    howToCompare:
      "Compare with Total Work Items and In Flight. A small completed share late in a sprint is a spillover warning.",
  },
  "In Flight": {
    what: "Work items that are not done yet.",
    formula: "Total items − done items",
    howToCompare:
      "Compare with Completed. Look at the status and assignee filters to find where work is piling up.",
  },
  "Defect Density": {
    what: "Bugs found per 100 delivered story points.",
    formula: "Bug count ÷ Completed SP × 100",
    howToCompare:
      "Lower is better. Compare across pods and sprints, and read it together with Bug Resolution Rate.",
  },
  "Bug Resolution Rate": {
    what: "Share of bugs that are resolved.",
    formula: "Resolved bugs ÷ all bugs × 100",
    howToCompare:
      "Higher is better. Compare with the previous sprint and inspect unresolved bugs by priority.",
  },
  "Resolution Time": {
    what: "Average time from bug creation to resolution.",
    formula: "Average (Resolution date − Created date) for resolved bugs",
    howToCompare:
      "Lower is better. Compare with previous sprints and check whether high-priority bugs are the slow ones.",
  },
  "Active Defects": {
    what: "Bugs that are not resolved in the selected scope.",
    howToCompare:
      "Compare with total bugs and resolution rate. Filter by priority to see whether the open bugs are severe.",
  },

  "Active Developers": {
    what: "Distinct people with at least one work item in scope.",
    howToCompare:
      "Compare with Total Delivered and Avg SP / Developer to see whether delivery is concentrated in a few people.",
  },
  "Avg SP / Developer": {
    what: "Delivered story points divided by active developers.",
    formula: "Total delivered SP ÷ active developers",
    howToCompare:
      "Compare with previous sprints and other pods. A high average can hide uneven load, so check the table.",
  },
  "Total Delivered": {
    what: "Story points completed by the people in scope.",
    formula: "Sum of delivered SP",
    howToCompare:
      "Compare with the sprint's committed SP and with the per-developer rows below to see concentration.",
  },
  "Top Contributor": {
    what: "The person with the highest delivered story points in scope.",
    howToCompare:
      "Use it for load balancing, not performance ranking. Compare the top row with the rest of the table.",
  },

  "Sprint Scope Churn": {
    what: "How much scope changed after the sprint started.",
    howToCompare:
      "Lower is better. This requires Jira changelog data, which the dashboard does not fetch yet, so it shows N/A.",
  },
  "Planned Work Share": {
    what: "Share of story points that existed on or before the active sprint started.",
    formula: "Planned SP ÷ (planned + unplanned SP) × 100",
    howToCompare:
      "Higher means more stable planning. Compare with the unplanned share and the work-type breakdown.",
  },
  "Avg Cycle Time": {
    what: "Average time from work starting to being done.",
    howToCompare:
      "Lower is better. This requires In-Progress→Done transition history, which is not fetched yet, so it shows N/A.",
  },
  "Avg Lead Time": {
    what: "Average time from request creation to delivery for completed items.",
    formula: "Average (Resolution date − Created date) for done items",
    howToCompare:
      "Lower is better. Compare with previous sprints and inspect the slowest work types.",
  },

  "Slippage Volume": {
    what: "Story points that were committed but not completed.",
    formula: "Committed SP − Done SP",
    howToCompare:
      "Lower is better. Compare with committed SP and read the primary driver and contributor rows.",
  },
  "Primary Driver": {
    what: "The most common reason behind unfinished work.",
    howToCompare:
      "Use it to pick one improvement action. Compare the reason counts and check whether the same driver repeats every sprint.",
  },
  "Contributors with Spillover": {
    what: "People who still have at least one unfinished item.",
    howToCompare:
      "Compare the count with the total number of contributors. Look at incomplete SP, not just item count.",
  },
  "Unfinished Work Items": {
    what: "Every work item that is not done in the selected scope.",
    howToCompare:
      "Compare the count and SP with the completed list. Filter by status or assignee to find the bottleneck.",
  },

  "Peak Velocity": {
    what: "The highest single-sprint story-point delivery in the window.",
    howToCompare:
      "Compare with the rolling average. One peak is not a trend; check whether it repeats.",
  },
  "Rolling Velocity": {
    what: "The smoothed velocity up to the latest sprint.",
    formula: "Expanding average of done SP",
    howToCompare:
      "Compare with actual velocity. A flat or rising average is healthier than one spike.",
  },
  "Cumulative Throughput": {
    what: "Running total of completed work items across the window.",
    howToCompare:
      "Compare the slope between sprints. A flattening line means delivery is slowing down.",
  },
  "Throughput Momentum": {
    what: "Completed items as a share of all items across the window.",
    formula: "Completed items ÷ total items × 100",
    howToCompare:
      "Higher is better. Compare with velocity and Say/Do to separate more output from more scope.",
  },
};

const GENERIC: Omit<MetricInsight, "recent" | "trend"> = {
  what: "Every work item behind this card in the current filter scope.",
  howToCompare:
    "Compare the count and story points with the other cards on this tab. Use the filters below to isolate status, type, or assignee.",
};

export function getMetricDefinition(title: string): Omit<MetricInsight, "recent" | "trend"> {
  if (DEFINITIONS[title]) return DEFINITIONS[title];

  if (/ Priority$/.test(title)) {
    return {
      what: `Work items with ${title.replace(/ Priority$/, "").toLowerCase()} priority in the current scope.`,
      howToCompare:
        "Compare the priority mix across pods and sprints. A rising high-priority share means the team is spending more time on urgent work.",
    };
  }

  if (/ items$/.test(title)) {
    return {
      what: `All work items of type “${title.replace(/ items$/, "")}” in the current scope.`,
      howToCompare:
        "Compare the count and story points with other work types. A growing bug or support share often explains slower delivery.",
    };
  }

  return {
    ...GENERIC,
    what: `Work items currently in “${title}” within the selected scope.`,
  };
}
