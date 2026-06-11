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
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium">{label}</span>
      {children}
    </label>
  );
}
