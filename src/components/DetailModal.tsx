"use client";

import { ReactNode, useEffect } from "react";

interface DetailModalProps {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}

export function DetailModal({
  title,
  subtitle,
  onClose,
  children,
  wide,
}: DetailModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className={`bg-white rounded-lg shadow-xl w-full ${
          wide ? "max-w-5xl" : "max-w-3xl"
        } max-h-[85vh] flex flex-col`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between px-5 py-4 border-b border-jira-border">
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-jira-text uppercase tracking-wider">
              {title}
            </h3>
            {subtitle && (
              <p className="text-xs text-jira-text-muted mt-0.5">{subtitle}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-jira-text-muted hover:text-jira-text text-lg leading-none px-2 shrink-0"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <div className="overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
