import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DonorWall } from "@/components/donors/DonorWall";
import { DonorWallManagerHint } from "@/components/donors/DonorWallManagerHint";
import { getSchoolById, getSchoolDonorWall } from "@/lib/firestore";

/**
 * School profile "Agradecimientos" section at /school/[id]/thanks — the donor wall.
 * When the wall is empty the tab isn't shown, but a direct visit still gets the manager
 * hint (for the school's own team) instead of a dead page.
 */

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const school = await getSchoolById(id);
  return {
    title: school ? `Agradecimientos · ${school.name}` : "Escuela no encontrada",
  };
}

export default async function SchoolThanksPage({ params }: Props) {
  const { id } = await params;
  const school = await getSchoolById(id);
  if (!school) notFound();

  const wall = await getSchoolDonorWall(id).catch(() => ({
    recognized: [],
    anonymousCount: 0,
  }));
  const hasWall = wall.recognized.length > 0 || wall.anonymousCount > 0;

  return hasWall ? (
    <DonorWall school={school} wall={wall} />
  ) : (
    <DonorWallManagerHint
      schoolId={id}
      ownerId={school.ownerId}
      editorIds={school.editorIds}
    />
  );
}
