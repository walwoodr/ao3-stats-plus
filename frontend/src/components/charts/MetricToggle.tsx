import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";

// Reusable role="tablist" segmented control (docs/plans/additional-metric-
// trend-charts.md §3.0/§3.4, T-I2) - used for BOTH the top-level metric
// picker (DashboardPage, WorkComparisonSection) AND the nested Bookmarks
// [By Work][By Type] sub-tab (nested tablists are valid ARIA per plan §6).
// Follows the WAI-ARIA APG "manual activation" tabs pattern: arrow
// keys/Home/End only ROVE focus among the tab buttons; the actual selection
// only changes on click or Enter/Space, at which point focus also moves
// into the owned tabpanel (plan §6, "focus moving to the panel on select").
export interface MetricToggleTab<K extends string = string> {
  key: K;
  label: string;
}

export interface MetricToggleProps<K extends string = string> {
  label: string;
  tabs: MetricToggleTab<K>[];
  selectedKey: K;
  onChange: (key: K) => void;
  children: ReactNode;
}

export function MetricToggle<K extends string = string>({
  label,
  tabs,
  selectedKey,
  onChange,
  children,
}: MetricToggleProps<K>) {
  const idPrefix = useId();
  // The roving-tabindex target: defaults to the selected tab, then tracks
  // whichever tab last received focus (click or arrow-key nav) - the
  // standard "only one tab is ever in the Tab order" pattern.
  const [focusedKey, setFocusedKey] = useState<K>(selectedKey);
  const tabRefs = useRef(new Map<K, HTMLButtonElement>());
  const panelRef = useRef<HTMLDivElement>(null);
  const isFirstRender = useRef(true);

  // Moves focus into the tabpanel exactly when the CALLER's selectedKey
  // prop actually changes (i.e. a real selection happened) - never on mere
  // arrow-key roving, which never touches this prop. Skipped on the very
  // first render so mounting a toggle doesn't steal focus from the page.
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    panelRef.current?.focus();
  }, [selectedKey]);

  function focusTab(key: K) {
    setFocusedKey(key);
    tabRefs.current.get(key)?.focus();
  }

  function selectTab(key: K) {
    setFocusedKey(key);
    if (key !== selectedKey) onChange(key);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    switch (event.key) {
      case "ArrowRight":
        event.preventDefault();
        focusTab(tabs[(index + 1) % tabs.length].key);
        break;
      case "ArrowLeft":
        event.preventDefault();
        focusTab(tabs[(index - 1 + tabs.length) % tabs.length].key);
        break;
      case "Home":
        event.preventDefault();
        focusTab(tabs[0].key);
        break;
      case "End":
        event.preventDefault();
        focusTab(tabs[tabs.length - 1].key);
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        selectTab(tabs[index].key);
        break;
      default:
        break;
    }
  }

  const selectedTabId = `${idPrefix}-tab-${selectedKey}`;

  return (
    <div>
      <div
        role="tablist"
        aria-label={label}
        className="flex flex-wrap gap-1 border-b border-ink/12"
      >
        {tabs.map((tab, index) => {
          const isSelected = tab.key === selectedKey;
          return (
            <button
              key={tab.key}
              ref={(el) => {
                if (el) tabRefs.current.set(tab.key, el);
                else tabRefs.current.delete(tab.key);
              }}
              id={`${idPrefix}-tab-${tab.key}`}
              type="button"
              role="tab"
              aria-selected={isSelected}
              tabIndex={tab.key === focusedKey ? 0 : -1}
              onClick={() => selectTab(tab.key)}
              onKeyDown={(event) => handleKeyDown(event, index)}
              onFocus={() => setFocusedKey(tab.key)}
              className={`rounded-t-md px-3 py-2 text-sm font-medium transition-colors duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                isSelected
                  ? "border-b-2 border-ink text-ink"
                  : "border-b-2 border-transparent text-ink-soft hover:text-ink"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      <div
        ref={panelRef}
        role="tabpanel"
        aria-labelledby={selectedTabId}
        tabIndex={-1}
        className="mt-4"
      >
        {children}
      </div>
    </div>
  );
}
