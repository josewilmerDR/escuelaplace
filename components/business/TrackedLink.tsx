"use client";

import { trackBusinessEvent } from "@/lib/track";
import type { ContactChannel } from "@/types";

/**
 * Anchor that reports its click just before navigation takes the user away (the beacon
 * in trackBusinessEvent survives the unload). Client island: the parent ContactButtons
 * stays a server component and only these leaf anchors ship JS.
 */
export function TrackedLink({
  businessId,
  channel,
  href,
  external,
  className,
  children,
}: {
  businessId: string;
  channel: ContactChannel;
  href: string;
  /** Opens in a new tab. False for links the OS handles in place (tel:), which must
   * not get target="_blank". */
  external: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target={external ? "_blank" : undefined}
      // nofollow ugc: merchant-controlled URLs — don't let the directory be used as a
      // link-scheme vehicle.
      rel={external ? "noopener noreferrer nofollow ugc" : undefined}
      className={className}
      onClick={() => trackBusinessEvent(businessId, channel)}
    >
      {children}
    </a>
  );
}
