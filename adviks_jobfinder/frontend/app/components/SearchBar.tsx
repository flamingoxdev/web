"use client";

import { useState } from "react";

interface SearchBarProps {
  onSearch: (query: string, location: string, remote: boolean) => void;
  isSearching: boolean;
  disabled: boolean;
  defaultQuery?: string;
}

export default function SearchBar({ onSearch, isSearching, disabled, defaultQuery = "Software Engineer" }: SearchBarProps) {
  const [query, setQuery] = useState(defaultQuery);
  const [location, setLocation] = useState("Remote");
  const [remote, setRemote] = useState(true);

  return (
    <div className="animate-slide-up flex flex-col gap-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
        <div className="flex-[2]">
          <label className="mb-1.5 block text-xs font-medium text-muted">Role / keywords</label>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. Software Engineer, Data Analyst"
            disabled={isSearching}
            className="w-full rounded-lg border border-border bg-surface py-2.5 px-3 text-sm text-foreground placeholder-muted/50 outline-none transition-colors focus:border-accent-cyan/50 focus:ring-1 focus:ring-accent-cyan/20 disabled:opacity-50"
          />
        </div>

        <div className="flex-1">
          <label className="mb-1.5 block text-xs font-medium text-muted">Location</label>
          <input
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="City, state, or Remote"
            disabled={isSearching}
            className="w-full rounded-lg border border-border bg-surface py-2.5 px-3 text-sm text-foreground placeholder-muted/50 outline-none transition-colors focus:border-accent-cyan/50 disabled:opacity-50"
          />
        </div>

        <label className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-foreground lg:mb-0">
          <input
            type="checkbox"
            checked={remote}
            onChange={(e) => setRemote(e.target.checked)}
            disabled={isSearching}
            className="accent-accent-cyan"
          />
          Remote only
        </label>

        <button
          onClick={() => onSearch(query.trim(), location, remote)}
          disabled={disabled || isSearching || !query.trim()}
          className={`flex items-center justify-center gap-2 rounded-lg px-6 py-2.5 text-sm font-semibold transition-all ${
            disabled || isSearching || !query.trim()
              ? "cursor-not-allowed bg-surface-raised text-muted"
              : "bg-gradient-to-r from-accent-cyan to-accent-violet text-white hover:shadow-lg hover:scale-[1.02]"
          }`}
        >
          {isSearching ? (
            <>
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              Searching…
            </>
          ) : (
            "Search Jobs"
          )}
        </button>
      </div>
    </div>
  );
}
