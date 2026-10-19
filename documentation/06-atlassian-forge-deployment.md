# 06 - Atlassian Forge Cloud Deployment Guide

This guide details how to build and deploy the dashboard into **Atlassian Forge** to run directly inside Jira Cloud.

---

## 1. What is Atlassian Forge?

Atlassian Forge is Atlassian's serverless cloud app platform:
- **Custom UI**: The frontend React app is hosted inside a sandboxed iframe inside Jira.
- **Backend Resolver (FaaS)**: Node.js serverless functions execute inside Atlassian's secure runtime, calling Jira REST APIs with inherited user credentials via `@forge/api`.
- **Forge Bridge (`@forge/bridge`)**: A lightweight communication bus allowing the Custom UI iframe to communicate with the Forge backend resolver.

---

## 2. Forge Configuration Overview

### `forge/manifest.yml`
```yaml
modules:
  jira:globalPage:
    - key: enterprise-sprint-dashboard
      title: Enterprise Sprint Performance
      resource: dashboard-ui
      resolver:
        function: dashboard-resolver
  function:
    - key: dashboard-resolver
      handler: index.handler

resources:
  - key: dashboard-ui
    path: ../out

permissions:
  scopes:
    - read:jira-work
    - read:jira-user
    - read:sprint:jira-software
    - read:board-scope:jira-software
    - read:issue-details:jira

app:
  id: ari:cloud:ecosystem::app/1c8d1c77-a602-4c3a-85fd-b5abdea53e7c
```

---

## 3. Step-by-Step Deployment Procedure

### Step 1: Install the Forge CLI
```powershell
npm install -g @forge/cli
```

### Step 2: Log In to Forge
```powershell
forge login
```
Provide your Atlassian account email and your Atlassian API token.

### Step 3: Build the Production Bundle
From the project root (`c:\MYPROJECTS\CDK\jira-dashboard`):
```powershell
pnpm run build
```

### Step 4: Deploy the App to Forge Cloud
Navigate to the `forge/` directory and deploy:
```powershell
cd forge
forge deploy
```

### Step 5: Install into Jira Cloud
```powershell
forge install
```
1. Select **Jira**.
2. Enter your Jira domain: `one-atlas-yzpp.atlassian.net`.
3. Confirm permission grants.

---

## 4. Verification in Jira

Once installed:
1. Open `https://one-atlas-yzpp.atlassian.net`.
2. Click **Apps** in the top Jira navigation bar.
3. Select **Enterprise Sprint Performance**.
4. The dashboard will load within Jira, allowing teams and leadership to review sprint metrics, developer velocity, and delivery diagnosis without leaving Jira.

