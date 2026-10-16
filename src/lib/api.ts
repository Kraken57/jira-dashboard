const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "";

export async function fetchJson<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${res.statusText}`);
  return res.json();
}

/* ponytail: currently returns mock data from mockData.ts.
   When backend is ready, swap this to call fetchJson("/api/...") instead.
   Upgrade path: replace mock imports with fetchJson calls in page.tsx. */
