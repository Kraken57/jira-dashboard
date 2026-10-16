# Connecting a Backend Later

## Current state (mock data)

All data lives in `src/lib/mockData.ts`. Components receive data as props — they never call `fetch` directly.

## The plan

`src/lib/api.ts` already has a `fetchJson` helper:

```ts
export async function fetchJson<T>(path: string, options?: RequestInit): Promise<T>
```

It reads `BASE_URL` from `process.env.NEXT_PUBLIC_API_BASE_URL`.

## Steps to connect a real backend

1. **Add API routes** (optional, same repo): Create files under `src/app/api/` (e.g. `src/app/api/pods/route.ts`). Next.js API routes run on the server.
2. **Or point to external backend**: Set `NEXT_PUBLIC_API_BASE_URL=http://your-backend.com` in `.env`.
3. **Swap data source**: In `src/app/page.tsx`, replace mock data imports with calls to `fetchJson("/api/pods")`, etc.
4. **Update types**: Replace mock data types with your backend's response types.

## No frontend changes needed for step 1-2

Components are data-agnostic. They accept props. Changing where props come from is a one-file change in `page.tsx` (or a new data hook).
