"use client";

/**
 * Accessible on/off switch — the toggle primitive for boolean preferences (e.g. the donor's
 * public-recognition opt-in). A raw `<input type="checkbox">` reads as a form check and ships
 * a ~16px tap target in the browser's default blue; this is a real `role="switch"` control in
 * the brand palette with a ≥40px hit area (extended invisibly via a `before` pseudo-element so
 * the visible track stays compact). Keyboard: Tab to focus, Space/Enter to toggle.
 *
 * Presentational only — the parent owns the value and the persistence. Associate a visible
 * label by passing its element id as `aria-labelledby`.
 */
interface SwitchProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  /** Id of the visible label element describing what this switch controls. */
  "aria-labelledby"?: string;
}

export function Switch({
  checked,
  onChange,
  disabled = false,
  "aria-labelledby": ariaLabelledby,
}: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={ariaLabelledby}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full outline-none transition-colors before:absolute before:-inset-2 before:content-[''] focus-visible:ring-2 focus-visible:ring-brand/40 disabled:opacity-50 ${
        checked ? "bg-brand-darker" : "bg-border"
      }`}
    >
      <span
        aria-hidden
        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform ${
          checked ? "translate-x-[1.375rem]" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}
