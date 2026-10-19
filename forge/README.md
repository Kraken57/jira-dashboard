# Atlassian Forge Deployment Guide

This directory contains the Atlassian Forge configuration and backend resolvers to host the **Enterprise Sprint Performance Dashboard** directly inside Jira Cloud.

## Architecture

- **Frontend**: The root Next.js application, built and statically exported into `out/`.
- **Backend Resolvers**: Located in `src/index.ts`, calling Jira Cloud REST APIs using `@forge/api` (asUser product fetch) and calculating metrics via the shared `metricsEngine`.
- **Manifest**: `manifest.yml` exposes the dashboard as a `jira:globalPage` accessible across your entire Jira instance.

## Deployment Steps

### 1. Install Forge CLI
```bash
npm install -g @forge/cli
```

### 2. Log in with your Atlassian API Token
```bash
forge login
```
*(Default email: `ahmad.saad@edulevel.ai`)*

### 3. Build the Next.js Frontend
From the root directory:
```bash
npm run build
```

### 4. Deploy to Forge
From the `forge/` directory:
```bash
forge deploy
```

### 5. Install to your Jira Cloud Instance
```bash
forge install
```
Select Jira Cloud, enter your site URL (e.g. `your-company.atlassian.net`), and grant permissions.

