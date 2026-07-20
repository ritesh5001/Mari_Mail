"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Available merge tags — kept in one place so the autocomplete, the footer
 * hint, and the sender-side substitution can stay in sync. Add a new entry
 * here and both the popover and the docs pill pick it up automatically.
 */
export const MERGE_TAGS = [
  { tag: "first_name", label: "First name", description: "Contact's first name" },
  { tag: "company", label: "Company", description: "Contact's company name" },
  { tag: "vessel_name", label: "Vessel name", description: "Matched vessel name (ETA campaigns)" },
  { tag: "eta_port", label: "ETA port", description: "Destination port for the ETA" },
  { tag: "eta_date", label: "ETA date", description: "Vessel's arrival date" },
] as const;

type MergeTagFieldProps = {
  as: "input" | "textarea";
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  className?: string;
  rows?: number;
  autoFocus?: boolean;
};

type MenuState =
  | { open: false }
  | { open: true; anchor: number; filter: string; highlighted: number };

/**
 * Text field that pops up a merge-tag suggestion menu whenever the user
 * types "{". Filtering keeps the menu useful as more characters are typed
 * (e.g. "{fir" narrows to first_name); Enter/Tab/click insert the full
 * "{{tag}}" and place the caret right after it. Escape or a click outside
 * cancels without inserting. Works for both `<input>` (subject) and
 * `<textarea>` (body) via the `as` prop.
 */
export function MergeTagField({
  as,
  value,
  onChange,
  placeholder,
  className,
  rows,
  autoFocus,
}: MergeTagFieldProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [menu, setMenu] = useState<MenuState>({ open: false });

  function getField() {
    return as === "input" ? inputRef.current : textareaRef.current;
  }

  /**
   * Look backwards from the caret to find the most recent unpaired "{" —
   * if we find one within a short window and everything between it and
   * the caret is safe filter text (no whitespace, not a closing brace),
   * that's the anchor point for the popover.
   */
  function findTrigger(text: string, caret: number): { anchor: number; filter: string } | null {
    // Cap the search window so a long body doesn't scan the whole string.
    const start = Math.max(0, caret - 32);
    for (let i = caret - 1; i >= start; i -= 1) {
      const c = text[i];
      if (c === "{") {
        // Don't retrigger on the second "{" of "{{" — the previous char
        // being "{" means we're inside an already-typed pair.
        if (text[i - 1] === "{") return null;
        const filter = text.slice(i + 1, caret);
        if (/[\s}]/.test(filter)) return null;
        return { anchor: i, filter };
      }
      if (c === "}" || c === "\n" || c === "\r") return null;
    }
    return null;
  }

  function refreshMenu() {
    const field = getField();
    if (!field) return;
    const caret = field.selectionStart ?? value.length;
    const trigger = findTrigger(value, caret);
    if (!trigger) {
      setMenu({ open: false });
      return;
    }
    const filtered = filterTags(trigger.filter);
    if (filtered.length === 0) {
      setMenu({ open: false });
      return;
    }
    setMenu((prev) => ({
      open: true,
      anchor: trigger.anchor,
      filter: trigger.filter,
      highlighted:
        prev.open && prev.anchor === trigger.anchor
          ? Math.min(prev.highlighted, filtered.length - 1)
          : 0,
    }));
  }

  function insertTag(tag: string) {
    const field = getField();
    if (!field || !menu.open) return;
    const caret = field.selectionStart ?? value.length;
    const before = value.slice(0, menu.anchor);
    const after = value.slice(caret);
    const insertion = `{{${tag}}}`;
    const next = `${before}${insertion}${after}`;
    onChange(next);
    setMenu({ open: false });
    // Wait for the controlled re-render, then move the caret to right
    // after the freshly inserted tag.
    requestAnimationFrame(() => {
      const target = getField();
      if (!target) return;
      const pos = menu.anchor + insertion.length;
      target.focus();
      target.setSelectionRange(pos, pos);
    });
  }

  // Close the menu when focus leaves the whole field+popover container —
  // clicking a suggestion is a mousedown on the popover, which happens
  // before the field's blur fires, so this is safe.
  useEffect(() => {
    if (!menu.open) return;
    function onDocClick(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setMenu({ open: false });
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [menu.open]);

  const visibleTags = menu.open ? filterTags(menu.filter) : [];

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) {
    if (!menu.open || visibleTags.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setMenu((prev) =>
        prev.open
          ? { ...prev, highlighted: (prev.highlighted + 1) % visibleTags.length }
          : prev,
      );
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setMenu((prev) =>
        prev.open
          ? {
              ...prev,
              highlighted: (prev.highlighted - 1 + visibleTags.length) % visibleTags.length,
            }
          : prev,
      );
      return;
    }
    if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault();
      insertTag(visibleTags[menu.highlighted].tag);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      setMenu({ open: false });
    }
  }

  const commonProps = {
    value,
    placeholder,
    className,
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      onChange(event.target.value);
      // Defer to next tick so selectionStart reflects the change.
      requestAnimationFrame(refreshMenu);
    },
    onKeyUp: refreshMenu,
    onClick: refreshMenu,
    onKeyDown: handleKeyDown,
  };

  return (
    <div ref={containerRef} className="relative">
      {as === "input" ? (
        <input ref={inputRef} autoFocus={autoFocus} {...commonProps} />
      ) : (
        <textarea ref={textareaRef} rows={rows} autoFocus={autoFocus} {...commonProps} />
      )}
      {menu.open && visibleTags.length > 0 ? (
        <div
          className="absolute left-2 top-full z-40 mt-1 w-64 overflow-hidden rounded-md border border-slate-200 bg-white shadow-lg dark:border-white/10 dark:bg-[#101013]"
          role="listbox"
        >
          <div className="border-b border-slate-100 bg-slate-50 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/50">
            Merge tags
          </div>
          {visibleTags.map((entry, idx) => {
            const highlighted = idx === menu.highlighted;
            return (
              <button
                key={entry.tag}
                type="button"
                role="option"
                aria-selected={highlighted}
                // mousedown, not click — click fires after blur, which
                // closes the menu before the click lands.
                onMouseDown={(event) => {
                  event.preventDefault();
                  insertTag(entry.tag);
                }}
                onMouseEnter={() =>
                  setMenu((prev) => (prev.open ? { ...prev, highlighted: idx } : prev))
                }
                className={`flex w-full items-start gap-2 px-3 py-2 text-left text-xs transition ${
                  highlighted
                    ? "bg-ocean/10 text-slate-950 dark:bg-ocean/20 dark:text-white"
                    : "text-slate-700 hover:bg-slate-50 dark:text-white/80 dark:hover:bg-white/[0.04]"
                }`}
              >
                <span className="flex-1">
                  <span className="font-semibold">{`{{${entry.tag}}}`}</span>
                  <span className="mt-0.5 block text-[11px] text-slate-500 dark:text-white/50">
                    {entry.description}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function filterTags(filter: string) {
  if (!filter) return MERGE_TAGS.slice();
  const needle = filter.toLowerCase();
  return MERGE_TAGS.filter(
    (entry) =>
      entry.tag.includes(needle) ||
      entry.label.toLowerCase().includes(needle),
  );
}
