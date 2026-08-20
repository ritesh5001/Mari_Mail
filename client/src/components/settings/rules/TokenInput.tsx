"use client";

import { useState } from "react";
import { X } from "lucide-react";

/**
 * Chip input for free-vocabulary values (cargo names).
 *
 * The cargo fields used to be one text box whose contents were split on commas
 * and whitespace and upper-cased at submit time. You could not see what the
 * form had actually understood until the rule appeared in the table — and
 * "IRON ORE" silently became two entries, `IRON` and `ORE`, neither of which
 * matches anything.
 *
 * Committing on Enter makes the parse visible at the moment it happens, and
 * lets a multi-word cargo stay one value.
 */
export function TokenInput({
  value,
  onChange,
  placeholder,
  id,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  id?: string;
}) {
  const [draft, setDraft] = useState("");

  function commit() {
    // Upper-cased to match how the values are stored and compared, so "coal"
    // and "COAL" can't become two different rules.
    const next = draft.trim().toUpperCase();
    if (!next || value.includes(next)) {
      setDraft("");
      return;
    }
    onChange([...value, next]);
    setDraft("");
  }

  return (
    <div className="rounded-md border border-slate-300 px-2 py-1.5 focus-within:border-accent-500 focus-within:ring-1 focus-within:ring-accent-500 dark:border-white/15 dark:bg-white/[0.04]">
      <div className="flex flex-wrap items-center gap-1.5">
        {value.map((token) => (
          <span
            key={token}
            className="inline-flex items-center gap-1 rounded-full border border-accent-500/25 bg-accent-500/10 py-0.5 pl-2.5 pr-1 text-xs font-medium text-accent-700 dark:text-accent-300"
          >
            {token}
            <button
              type="button"
              onClick={() => onChange(value.filter((item) => item !== token))}
              aria-label={`Remove ${token}`}
              className="rounded-full p-0.5 hover:bg-accent-500/20"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          id={id}
          type="text"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === ",") {
              event.preventDefault();
              commit();
            } else if (event.key === "Backspace" && !draft && value.length > 0) {
              onChange(value.slice(0, -1));
            }
          }}
          placeholder={value.length === 0 ? placeholder : ""}
          className="min-w-[8rem] flex-1 bg-transparent px-1 py-1 text-sm text-slate-900 outline-none placeholder:text-slate-400 dark:text-white"
        />
      </div>
    </div>
  );
}
