# 05 - Jira Cloud API Integration Guide

> **Historical snapshot.** For current behavior, setup, and metrics, read
> [`08-complete-system-guide.md`](08-complete-system-guide.md) first.

This document explains the technical details of connecting to Atlassian Jira Cloud REST APIs.

---

## 1. Atlassian REST API Changes & The 410 Gone Deprecation

In late 2024 / 2025, Atlassian permanently deprecated the legacy search endpoint:
- ❌ **Deprecated**: `GET /rest/api/3/search?jql=...` (Returns `410 Gone`)
- ✅ **Current**: `POST /rest/api/3/search/jql`

### Correct API Call Payload
```typescript
const response = await fetch(`${JIRA_DOMAIN}/rest/api/3/search/jql`, {
  method: "POST",
  headers: {
    "Authorization": `Basic ${authHeader}`,
    "Accept": "application/json",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    jql: "project in (CRM, DTP, ERP, SEC, SRG) ORDER BY created DESC",
    maxResults: 100,
    nextPageToken: nextPageToken || undefined,
    fields: [
      "summary",
      "status",
      "issuetype",
      "project",
      "customfield_10016",
      "customfield_10031",
      "customfield_10020",
      "created",
      "resolutiondate",
      "assignee",
      "priority",
    ],
  }),
});
```

---

## 2. Authentication: Scoped vs Unscoped Tokens

Atlassian supports two API token types:
1. **Standard API Token (Recommended)**: Created at `id.atlassian.com/manage-profile/security/api-tokens`. Authenticates via HTTP Basic Auth:
   ```typescript
   const auth = Buffer.from(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`).toString("base64");
   // Header: Authorization: Basic <base64>
   ```
2. **API Token with Scopes**: Often blocks `BROWSE_PROJECTS` unless granted explicit fine-grained app permissions.

---

## 3. Jira Custom Field ID Mapping

In Jira Cloud, custom fields are assigned dynamic IDs per instance. On the `one-atlas-yzpp.atlassian.net` instance:

| Field Name | Jira Custom Field Key | Explanation |
|---|---|---|
| **Story Points** | `customfield_10031` | Holds the integer or float story points value. |
| **Story Point Estimate** | `customfield_10016` | Alternate estimate field (used as fallback). |
| **Sprint** | `customfield_10020` | Contains an array of sprint objects: `[{ id: 1, name: "2026-Q3 Iteration 1" }]`. |

### Defensive Field Parsing Pattern
```typescript
// Safe story points extraction
const spRaw = fields.customfield_10031 ?? fields.customfield_10016 ?? 0;
const storyPoints = typeof spRaw === "number" ? spRaw : parseFloat(String(spRaw)) || 0;

// Safe sprint extraction
const sprintObj = fields.customfield_10020;
let sprints: string[] = [];
if (Array.isArray(sprintObj)) {
  sprints = sprintObj.map((s: { name?: string }) => s.name || "").filter(Boolean);
} else if (typeof sprintObj === "string") {
  // Handles comma-separated multi-sprint rollovers
  sprints = sprintObj.split(",").map((s) => s.trim()).filter(Boolean);
}
```

---

## 4. Paginated Ingestion Loop

Because Jira Cloud restricts responses to a maximum of 100 items per call, `fetchAllJiraWorkItems()` loops using `nextPageToken` until all pages are retrieved:

```typescript
let nextPageToken: string | undefined = undefined;
const allIssues: JiraWorkItem[] = [];

do {
  const result = await fetchJiraPage(nextPageToken);
  allIssues.push(...result.issues);
  nextPageToken = result.nextPageToken;
} while (nextPageToken);
```

This retrieves all **930 issues** across all 5 projects cleanly. The in-memory cache then stores this array for 5 minutes, preventing repetitive API roundtrips.

