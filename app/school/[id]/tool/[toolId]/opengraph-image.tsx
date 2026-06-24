import { ImageResponse } from "next/og";
import { getToolById } from "@/lib/firestore";
import { toolTypeMeta } from "@/lib/tools/registry";

/**
 * Dynamic Open Graph card for a shared activity (/school/[id]/tool/[toolId]).
 *
 * This is what WhatsApp / Facebook / Telegram / iMessage render when someone pastes the
 * activity link — NOT the `navigator.share` text. The brief: let the image dominate, with
 * just a title and a small CTA. So we render the cover photo full-bleed, lay a dark gradient
 * over the bottom third, and stack the title + school + a "Apoya a la escuela" pill on top.
 * When the activity has no cover we fall back to a brand-tinted card with the kind's emoji so
 * the preview is always composed, never blank.
 *
 * Runs at request time via Satori (next/og): only flat inline styles work here — no Tailwind,
 * no external CSS, no React icon components. The kind mark is an emoji so it needs no SVG.
 */
export const runtime = "nodejs";
export const alt = "Actividad en escuelaplace";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Brand scale, mirrored from app/globals.css (Satori can't read CSS variables).
const BRAND_DARK = "#0284c7";
const BRAND_DARKER = "#0369a1";
const BRAND_TINT = "#e0f2fe";

// A simple emoji per kind for the no-cover fallback — Satori renders system emoji without an
// SVG component. Mirrors the labels in lib/tools/registry.ts.
const KIND_EMOJI: Record<string, string> = {
  raffle: "🎟️",
  bingo: "🔢",
  sale: "🛍️",
  service: "🧰",
  guided_tour: "📍",
  event: "📅",
  other: "✨",
};

interface Props {
  params: Promise<{ id: string; toolId: string }>;
}

export default async function Image({ params }: Props) {
  const { id, toolId } = await params;
  const tool = await getToolById(id, toolId).catch(() => null);

  const title = tool?.title ?? "Actividad escolar";
  const schoolName = tool?.schoolName ?? "";
  const kindLabel = tool ? toolTypeMeta(tool.type).label : "";
  const emoji = tool ? (KIND_EMOJI[tool.type] ?? KIND_EMOJI.other) : KIND_EMOJI.other;
  const coverUrl = tool?.coverUrl ?? null;

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: "100%",
          height: "100%",
          position: "relative",
          backgroundColor: BRAND_TINT,
          fontFamily: "sans-serif",
        }}
      >
        {coverUrl ? (
          // Full-bleed cover photo.
          <img
            src={coverUrl}
            alt=""
            width={size.width}
            height={size.height}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
            }}
          />
        ) : (
          // No cover: brand gradient + the kind emoji, centered.
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              backgroundImage: `linear-gradient(135deg, ${BRAND_DARK} 0%, ${BRAND_DARKER} 100%)`,
              fontSize: 260,
            }}
          >
            {emoji}
          </div>
        )}

        {/* Dark gradient over the lower half so the white text stays legible over any photo. */}
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            width: "100%",
            height: "70%",
            backgroundImage:
              "linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.55) 35%, rgba(0,0,0,0) 100%)",
          }}
        />

        {/* Text block + CTA pill, pinned to the bottom-left. */}
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            display: "flex",
            flexDirection: "column",
            padding: "56px 64px",
          }}
        >
          {kindLabel && (
            <div
              style={{
                display: "flex",
                alignSelf: "flex-start",
                backgroundColor: "rgba(255,255,255,0.92)",
                color: BRAND_DARKER,
                fontSize: 28,
                fontWeight: 600,
                padding: "8px 20px",
                borderRadius: 999,
                marginBottom: 20,
              }}
            >
              {kindLabel}
            </div>
          )}

          <div
            style={{
              display: "flex",
              color: "#ffffff",
              fontSize: 68,
              fontWeight: 700,
              lineHeight: 1.1,
              // Clamp to two lines so a long title can't push the CTA off the card.
              maxHeight: 150,
              overflow: "hidden",
            }}
          >
            {title}
          </div>

          {schoolName && (
            <div
              style={{
                display: "flex",
                color: "rgba(255,255,255,0.9)",
                fontSize: 34,
                marginTop: 16,
              }}
            >
              {schoolName}
            </div>
          )}

          <div
            style={{
              display: "flex",
              alignItems: "center",
              marginTop: 36,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                backgroundColor: "#ffffff",
                color: BRAND_DARKER,
                fontSize: 32,
                fontWeight: 700,
                padding: "16px 32px",
                borderRadius: 999,
              }}
            >
              Apoya a tu escuela →
            </div>
            <div
              style={{
                display: "flex",
                color: "rgba(255,255,255,0.85)",
                fontSize: 30,
                fontWeight: 600,
                marginLeft: 28,
              }}
            >
              escuelaplace
            </div>
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
