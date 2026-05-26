"use client";

import { useState } from "react";

interface SearchBarProps {
  onSearch: (location: string) => void;
  isSearching: boolean;
  disabled: boolean;
}

export default function SearchBar({
  onSearch,
  isSearching,
  disabled,
}: SearchBarProps) {
  const [location, setLocation] = useState("Remote");

  return (
    <div className="animate-slide-up flex flex-col gap-3 sm:flex-row sm:items-end">
      <div className="flex-1">
        <label className="mb-1.5 block text-xs font-medium text-muted">
          Location
        </label>
        <div className="relative">
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted"
          >
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
            <circle cx="12" cy="10" r="3" />
          </svg>
          <input
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="City, state, or Remote"
            disabled={isSearching}
            className="w-full rounded-lg border border-border bg-surface py-2.5 pl-9 pr-4 text-sm text-foreground placeholder-muted/50 outline-none transition-colors focus:border-accent-cyan/50 focus:ring-1 focus:ring-accent-cyan/20 disabled:opacity-50"
          />
        </div>
      </div>

      <button
        onClick={() => onSearch(location)}
          disabled={disabled || isSearching}
          className={`
            group relative flex items-center justify-center gap-2 overflow-hidden rounded-lg px-6 py-2.5 text-sm font-semibold
            transition-all duration-300
            ${
              disabled || isSearching
                ? "cursor-not-allowed bg-surface-raised text-muted"
                : "bg-gradient-to-r from-accent-cyan to-accent-violet text-background hover:shadow-lg hover:shadow-accent-cyan/20 hover:scale-[1.02] active:scale-[0.98]"
            }
          `}
        >
          {isSearching ? (
            <>
              <div className="h-4 w-4 rounded-full border-2 border-muted/30 border-t-muted animate-spin" />
              <span>Searching...</span>
            </>
          ) : (
            <>
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <span>Find Internships</span>
            </>
          )}
      </button>
    </div>
  );
}
