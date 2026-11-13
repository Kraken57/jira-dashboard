"use client";

import type { MouseEvent, ReactNode } from "react";

/** Forge Custom UI uses the host router so a normal click can open the Jira issue in a new tab. */
export async function openJiraWorkLink(
  href: string,
  issueKey: string,
  inForge: boolean,
  openLocal = (url: string) => { window.open(url, "_blank", "noopener,noreferrer"); },
  openForge = async (key: string) => { const { router } = await import("@forge/bridge"); await router.open(`/browse/${encodeURIComponent(key)}`); },
) {
  if (inForge) await openForge(issueKey);
  else openLocal(href);
}

export function JiraWorkLink({ issueKey, jiraDomain, children }: {
  issueKey: string;
  jiraDomain?: string;
  children?: ReactNode;
}) {
  if (!jiraDomain) return <span>{children || issueKey}</span>;
  const href = `${jiraDomain.replace(/\/+$/, "")}/browse/${encodeURIComponent(issueKey)}`;
  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    // Keep the browser's normal anchor handling locally, including modifier keys.
    if (window.self === window.top || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    event.stopPropagation();
    void openJiraWorkLink(href, issueKey, true).catch((error: unknown) => {
      console.warn("Could not open Jira work item through Forge", error);
      window.open(href, "_blank", "noopener,noreferrer");
    });
  };
  return <a href={href} target="_blank" rel="noopener noreferrer" onClick={onClick}
    className="cursor-pointer font-semibold text-jira-blue underline-offset-2 hover:underline focus-visible:rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-jira-blue">
    {children || issueKey}
  </a>;
}
