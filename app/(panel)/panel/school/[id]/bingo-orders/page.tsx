import { redirect } from "next/navigation";

/**
 * Legacy route — the bingo-order confirmation queue folded into the unified "Actividad" inbox
 * (/panel/school/[id]/activity). Kept as a server redirect so old links/bookmarks land on the
 * matching filter instead of 404-ing.
 */
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/panel/school/${id}/activity?filter=bingo_order`);
}
