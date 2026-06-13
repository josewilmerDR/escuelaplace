"use client";

/**
 * Submit-error line for the panel forms: announced to screen readers (role="alert")
 * and scrolled into view — on long forms the message renders near the submit button,
 * which can sit outside the viewport when validation fails on an upper field. The
 * message keys the element so a different error re-mounts and re-scrolls.
 */
export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p
      key={message}
      role="alert"
      ref={(el) => el?.scrollIntoView({ block: "nearest", behavior: "smooth" })}
      className="text-sm font-medium text-error"
    >
      {message}
    </p>
  );
}
