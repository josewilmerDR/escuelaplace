import type { ReactNode } from "react";

/**
 * Labeled form field used by the panel forms. The label element wraps the control, so
 * clicking the text focuses the input without needing generated ids.
 */
export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="text-sm font-medium text-foreground">{label}</span>
      {children}
    </label>
  );
}
