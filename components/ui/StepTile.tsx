import type { ReactNode } from "react";
import { IconTile } from "./IconTile";

/**
 * Numbered icon tile for the home "how it works" stepper: an IconTile with a small brand
 * number badge. The opaque `bg-surface` lets the connector line behind the row (see the
 * <ol> on the home) show only in the gaps between tiles. Shared by the static steps and the
 * interactive community step so the two never drift.
 */
export function StepTile({
  step,
  children,
}: {
  step: number;
  children: ReactNode;
}) {
  return (
    <span className="relative shrink-0">
      <IconTile size="sm" className="bg-surface sm:h-12 sm:w-12">
        {children}
      </IconTile>
      <span
        aria-hidden
        className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-brand text-[11px] font-semibold text-white ring-2 ring-surface"
      >
        {step}
      </span>
    </span>
  );
}
