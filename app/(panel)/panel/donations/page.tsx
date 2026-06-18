"use client";

/**
 * Personal donations summary (/panel/donations).
 *
 * The one centralized place where a signed-in user reviews everything they've given: their
 * recurring donations to schools (subscriptions, supporterType 'user') AND their one-off
 * project contributions (projectContributions) — two collections that until now could only
 * be seen scattered across the donate flow and each project's funding page. Read-only by
 * intent; the only write it offers is the recovery path shared with those flows — attaching
 * the payment proof to a still-pending row. The platform never touches the money; the SCHOOL
 * confirms each one.
 *
 * Amounts ARE shown here because this is the donor's OWN private view (the tier only blurs
 * the figure on PUBLIC surfaces — the donor wall — never to the donor about their own giving).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { DonorTierBadge } from "@/components/donors/DonorTierBadge";
import { ProjectContributionItem } from "@/components/projects/ProjectContributionItem";
import { SupporterContributionItem } from "@/components/subscriptions/SupporterContributionItem";
import { BackLink } from "@/components/ui/BackLink";
import { cardClass } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { HeartIcon } from "@/components/ui/icons";
import { StatChip } from "@/components/ui/StatChip";
import { userErrorMessage } from "@/lib/errors";
import {
  getContributionsByDonor,
  getDonorProfile,
  getSchoolsCached,
  getSubscriptionsByBusiness,
  getSubscriptionsByDonor,
  uploadContributionProof,
  uploadSubscriptionProof,
} from "@/lib/firestore";
import { formatColones } from "@/lib/format";
import type {
  DonorProfileDoc,
  ProjectContributionDoc,
  SchoolDoc,
  SubscriptionDoc,
} from "@/types";

const TITLE = "Mis donaciones";

export default function DonationsPage() {
  const { user } = useAuth();

  const [schools, setSchools] = useState<SchoolDoc[]>([]);
  const [donations, setDonations] = useState<SubscriptionDoc[]>([]);
  const [contributions, setContributions] = useState<ProjectContributionDoc[]>([]);
  // Support given THROUGH the businesses this user manages (supporterType 'business') — a
  // separate identity from the personal donations above, so it lives in its own section.
  const [businessDonations, setBusinessDonations] = useState<SubscriptionDoc[]>([]);
  const [profile, setProfile] = useState<DonorProfileDoc | null>(null);
  const [loaded, setLoaded] = useState(false);
  // A single in-flight proof upload at a time; the id (unique across the collections) doubles
  // as the "which row is busy" marker shared by every list.
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  // The businesses this user administers; their support subscriptions are fetched per id
  // (subscriptions are keyed by businessId, not by the managing user).
  const managedBusinessIds = useMemo(
    () =>
      (user?.managedPages ?? [])
        .filter((p) => p.type === "business")
        .map((p) => p.id),
    [user],
  );

  const reloadDonations = useCallback(() => {
    if (!user) return Promise.resolve();
    return getSubscriptionsByDonor(user.id).then(setDonations);
  }, [user]);

  const reloadContributions = useCallback(() => {
    if (!user) return Promise.resolve();
    return getContributionsByDonor(user.id).then(setContributions);
  }, [user]);

  const reloadBusinessDonations = useCallback(() => {
    if (managedBusinessIds.length === 0) return Promise.resolve();
    return Promise.all(managedBusinessIds.map(getSubscriptionsByBusiness)).then(
      (lists) => setBusinessDonations(lists.flat()),
    );
  }, [managedBusinessIds]);

  // Index schools by id so each row resolves its boardContact (for the "remind the school"
  // nudge) without a per-row scan.
  const schoolById = useMemo(
    () => new Map(schools.map((s) => [s.id, s])),
    [schools],
  );

  useEffect(() => {
    if (!user) return;
    // Drop a stale result if the account switches (or the component unmounts) before the reads
    // resolve, so the previous user's donations never flash into the new session.
    let cancelled = false;
    Promise.all([
      getSchoolsCached(),
      getSubscriptionsByDonor(user.id),
      getContributionsByDonor(user.id),
      getDonorProfile(user.id),
      Promise.all(managedBusinessIds.map(getSubscriptionsByBusiness)).then((lists) =>
        lists.flat(),
      ),
    ])
      .then(([s, d, c, p, bd]) => {
        if (cancelled) return;
        setSchools(s);
        setDonations(d);
        setContributions(c);
        setProfile(p);
        setBusinessDonations(bd);
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [user, managedBusinessIds]);

  // Totals for the summary band: confirmed school donations sum to colones (always CRC);
  // project contributions span currencies, so they're surfaced as a count, not a sum.
  const summary = useMemo(() => {
    const confirmedDonations = donations.filter((d) => d.status === "confirmed");
    const pendingDonations = donations.filter((d) => d.status === "pending");
    const pendingContributions = contributions.filter((c) => c.status === "pending");
    return {
      donatedToSchools: confirmedDonations.reduce((sum, d) => sum + (d.amount ?? 0), 0),
      confirmedContributions: contributions.filter((c) => c.status === "confirmed").length,
      pendingCount: pendingDonations.length + pendingContributions.length,
    };
  }, [donations, contributions]);

  // Group the businesses' support by business so each managed page gets its own labeled
  // sub-list (a user may administer several). businessName is denormalized on each sub.
  const businessGroups = useMemo(() => {
    const groups = new Map<string, { name: string; subs: SubscriptionDoc[] }>();
    for (const sub of businessDonations) {
      const key = sub.businessId ?? "";
      const group = groups.get(key) ?? {
        name: sub.businessName ?? "Mi comercio",
        subs: [],
      };
      group.subs.push(sub);
      groups.set(key, group);
    }
    return [...groups.values()];
  }, [businessDonations]);

  if (!user || !loaded) {
    return <DonationsSkeleton />;
  }

  const onUploadDonationProof = async (subId: string, file: File) => {
    setUploadingId(subId);
    setListError(null);
    try {
      await uploadSubscriptionProof(subId, file);
      await reloadDonations();
    } catch (err) {
      setListError(userErrorMessage(err, "No se pudo subir el comprobante."));
    } finally {
      setUploadingId(null);
    }
  };

  const onUploadContributionProof = async (contribId: string, file: File) => {
    setUploadingId(contribId);
    setListError(null);
    try {
      await uploadContributionProof(contribId, file);
      await reloadContributions();
    } catch (err) {
      setListError(userErrorMessage(err, "No se pudo subir el comprobante."));
    } finally {
      setUploadingId(null);
    }
  };

  const onUploadBusinessProof = async (subId: string, file: File) => {
    setUploadingId(subId);
    setListError(null);
    try {
      await uploadSubscriptionProof(subId, file);
      await reloadBusinessDonations();
    } catch (err) {
      setListError(userErrorMessage(err, "No se pudo subir el comprobante."));
    } finally {
      setUploadingId(null);
    }
  };

  // Personal giving (donor identity) vs. support through managed businesses (business
  // identity): the summary band describes the former; both gate the non-empty page.
  const hasPersonal = donations.length > 0 || contributions.length > 0;
  const hasAny = hasPersonal || businessDonations.length > 0;

  return (
    <main>
      <h1 className="text-3xl font-semibold tracking-tight text-foreground">{TITLE}</h1>
      <p className="mt-1 text-sm text-muted">
        Todo lo que aportaste, en un solo lugar: tus donaciones a escuelas y tus
        aportes a proyectos.
      </p>

      {!hasAny ? (
        <EmptyState
          className="mt-10"
          icon={<HeartIcon className="h-7 w-7" />}
          title="Todavía no registraste ninguna donación"
          description="Cuando apoyés a una escuela o aportes a un proyecto, vas a ver acá el resumen y el estado de cada aporte."
          cta={{ label: "Donar a una escuela", href: "/panel/donate" }}
        />
      ) : (
        <>
          {/* Summary band: the donor's own figures (private view) + recognition tier. Shown
              only when there's personal giving — support given through managed businesses is
              a different identity and gets its own section below. */}
          {hasPersonal && (
          <div className={`mt-6 flex flex-wrap items-center gap-2 text-sm ${cardClass("inset")}`}>
            {profile?.tier && <DonorTierBadge tier={profile.tier} />}
            {summary.donatedToSchools > 0 && (
              <StatChip tone="success">
                {formatColones(summary.donatedToSchools)} donados a escuelas
              </StatChip>
            )}
            {summary.confirmedContributions > 0 && (
              <StatChip tone="brand">
                {summary.confirmedContributions === 1
                  ? "1 aporte a proyectos confirmado"
                  : `${summary.confirmedContributions} aportes a proyectos confirmados`}
              </StatChip>
            )}
            {summary.pendingCount > 0 && (
              <StatChip tone="warning">
                {summary.pendingCount === 1
                  ? "1 pendiente de confirmación"
                  : `${summary.pendingCount} pendientes de confirmación`}
              </StatChip>
            )}
            {profile?.firstConfirmedAt && (
              <span className="text-muted">
                Donante desde {profile.firstConfirmedAt.toDate().getFullYear()}
              </span>
            )}
          </div>
          )}

          {listError && (
            <p role="alert" className="mt-4 text-sm text-error">
              {listError}
            </p>
          )}

          {donations.length > 0 && (
            <section className="mt-10">
              <h2 className="text-lg font-semibold tracking-tight text-foreground">
                Donaciones a escuelas
              </h2>
              <ul className="mt-4 flex flex-col gap-3">
                {donations.map((d) => (
                  <SupporterContributionItem
                    key={d.id}
                    subscription={d}
                    supporterName={user.name}
                    boardContact={schoolById.get(d.schoolId)?.boardContact}
                    uploadingId={uploadingId}
                    onUploadProof={onUploadDonationProof}
                  />
                ))}
              </ul>
            </section>
          )}

          {contributions.length > 0 && (
            <section className="mt-10">
              <h2 className="text-lg font-semibold tracking-tight text-foreground">
                Aportes a proyectos
              </h2>
              <ul className="mt-4 flex flex-col gap-3">
                {contributions.map((c) => (
                  <ProjectContributionItem
                    key={c.id}
                    contribution={c}
                    donorName={user.name}
                    boardContact={schoolById.get(c.schoolId)?.boardContact}
                    uploadingId={uploadingId}
                    onUploadProof={onUploadContributionProof}
                  />
                ))}
              </ul>
            </section>
          )}

          {businessDonations.length > 0 && (
            <section className="mt-10">
              <h2 className="text-lg font-semibold tracking-tight text-foreground">
                Apoyo de mis comercios
              </h2>
              {businessGroups.map((group, i) => (
                <div key={i} className={i === 0 ? "mt-4" : "mt-6"}>
                  {/* Label each business only when there's more than one — a single managed
                      business needs no disambiguating heading. */}
                  {businessGroups.length > 1 && (
                    <h3 className="text-sm font-medium text-muted">{group.name}</h3>
                  )}
                  <ul className="mt-2 flex flex-col gap-3">
                    {group.subs.map((s) => (
                      <SupporterContributionItem
                        key={s.id}
                        subscription={s}
                        supporterName={group.name}
                        boardContact={schoolById.get(s.schoolId)?.boardContact}
                        uploadingId={uploadingId}
                        onUploadProof={onUploadBusinessProof}
                      />
                    ))}
                  </ul>
                </div>
              ))}
            </section>
          )}
        </>
      )}

      <p className="mt-10 text-sm">
        <BackLink href="/panel">Volver al panel</BackLink>
      </p>
    </main>
  );
}

/**
 * Loading shell. Renders the SAME static header (title + intro) the loaded page does, so
 * navigating here paints the heading instantly in its final position and only the content
 * below fades in — no blank flash ("parpadeo") during the Firestore reads.
 */
function DonationsSkeleton() {
  return (
    <main>
      <h1 className="text-3xl font-semibold tracking-tight text-foreground">{TITLE}</h1>
      <p className="mt-1 text-sm text-muted">
        Todo lo que aportaste, en un solo lugar: tus donaciones a escuelas y tus
        aportes a proyectos.
      </p>
      <div className="mt-6 space-y-3" aria-hidden="true">
        <div className="h-12 animate-pulse rounded-2xl bg-surface ring-1 ring-black/5" />
        <div className="h-20 animate-pulse rounded-2xl bg-surface ring-1 ring-black/5" />
        <div className="h-20 animate-pulse rounded-2xl bg-surface ring-1 ring-black/5" />
      </div>
      <p className="sr-only" role="status">
        Cargando…
      </p>
    </main>
  );
}
