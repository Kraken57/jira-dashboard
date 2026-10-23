# Atlassian Forge Deployment

The dashboard runs as a Jira global page. The Next.js app is statically exported
and served by Forge; the backend resolver calls Jira with `api.asApp()`.

## Prerequisites

- Node.js 20+ and pnpm
- Forge CLI: `npm install -g @forge/cli`
- A Jira Cloud site where you can install apps (site admin)
- Login with the Atlassian account that owns app
  `ari:cloud:ecosystem::app/1c8d1c77-a602-4c3a-85fd-b5abdea53e7c`

## Build

From the repository root:

```bash
pnpm install
pnpm run build:forge
```

This writes the static export to `out/` and copies it to `forge/out/`.
The manifest serves `forge/out/`.

## Configure

```bash
cd forge
forge login
forge variables set JIRA_HOST https://your-site.atlassian.net
forge variables set JIRA_JQL "project in (ABC)"
forge variables set JIRA_STORY_POINTS_FIELD customfield_10031
forge variables set JIRA_SPRINT_FIELD customfield_10020
forge variables set JIRA_POD_FIELD customfield_10050
forge variables set JIRA_DONE_STATUSES "Done,Accepted,Released"
```

No email/token variables are needed: Forge authenticates as the app. Variables
are per environment; `forge deploy` and `forge install` default to `development`.
Use `-e production` for production.

## Deploy and install

```bash
cd forge
forge lint
forge deploy
forge install
```

Choose Jira Cloud and your site. The app appears as **Enterprise Delivery KPIs**
in Jira's global navigation.

For production:

```bash
forge variables set -e production JIRA_HOST https://your-site.atlassian.net
# ...other variables with -e production
forge deploy -e production
forge install -e production
```

## Updating

```bash
git pull
pnpm install
pnpm run build:forge
cd forge
forge deploy
forge install --upgrade
```

If Forge asks to approve a major version (for example after a scope change),
approve it.
