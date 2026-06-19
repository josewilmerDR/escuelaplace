"use client";

/**
 * Tool ("Herramientas") management for a school (/panel/school/[id]/tools).
 *
 * The board lists its tools (rifas, ventas, bingos, servicios, visitas guiadas…) and creates
 * new ones. A tool is a lightweight activity that doesn't warrant its own tab — it shows as a
 * card on the school's public "Principal" page. The cover, dates and call-to-action link are
 * added on the per-tool edit page after creation (mirrors the projects flow). PURELY
 * INFORMATIONAL — the platform never processes money.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { SchoolPanelNav } from "@/components/school/SchoolPanelNav";
import { ToolTypeBadge } from "@/components/tools/ToolTypeBadge";
import { ToolTypePicker } from "@/components/tools/ToolTypePicker";
import { Badge } from "@/components/ui/Badge";
import { BackLink } from "@/components/ui/BackLink";
import { cardClass } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field } from "@/components/ui/Field";
import { FormError } from "@/components/ui/FormError";
import { WrenchIcon } from "@/components/ui/icons";
import { userErrorMessage } from "@/lib/errors";
import { clearValidationMessage, spanishRequiredMessage } from "@/lib/forms";
import { CARD_COVER_ASPECT, CARD_COVER_SIZES } from "@/lib/layout";
import { TOOL_TYPE_LIST } from "@/lib/tools/registry";
import { createTool, getSchoolById, getToolsBySchool } from "@/lib/firestore";
import {
  TOOL_DESCRIPTION_MAX,
  TOOL_TITLE_MAX,
  type SchoolDoc,
  type ToolDoc,
  type ToolType,
} from "@/types";

/** Lifecycle of the school + tools fetch the page depends on. */
type LoadState = "loading" | "error" | "loaded";

const LOADING_TEXT = "Cargando herramientas…";

/** Quiet, low-emphasis card action (the public link beside the lead "Editar"). */
const CHIP_ACTION =
  "inline-flex min-h-10 items-center rounded-lg px-3 py-2 text-sm font-medium text-muted transition-colors hover:bg-surface hover:text-foreground";

/** Page heading, rendered identically in every state so the title never shifts. */
function Heading({ subtitle }: { subtitle?: string }) {
  return (
    <header>
      <h1 className="text-3xl font-semibold tracking-tight text-foreground">
        Herramientas
      </h1>
      <p className="mt-1 text-sm text-muted">{subtitle || " "}</p>
    </header>
  );
}

/** One tool row, shared by the Activas and Ocultas sections. */
function ToolRow({ schoolId, tool }: { schoolId: string; tool: ToolDoc }) {
  return (
    <li className={`${cardClass("elevated", false)} overflow-hidden`}>
      {tool.coverUrl && (
        <span className={`relative block w-full bg-surface ${CARD_COVER_ASPECT}`}>
          <Image
            src={tool.coverUrl}
            alt=""
            fill
            sizes={CARD_COVER_SIZES}
            className="object-cover"
          />
        </span>
      )}
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-semibold tracking-tight text-foreground">
              {tool.title}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <ToolTypeBadge type={tool.type} />
            {tool.status === "inactive" && <Badge tone="neutral">Oculta</Badge>}
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-1 border-t border-border pt-4 text-sm">
          <Link
            href={`/panel/school/${schoolId}/tools/${tool.id}`}
            className="btn btn-primary mr-1"
          >
            Editar
          </Link>
          <Link href={`/school/${schoolId}/tool/${tool.id}`} className={CHIP_ACTION}>
            Ver público
          </Link>
        </div>
      </div>
    </li>
  );
}

export default function SchoolToolsPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const router = useRouter();

  const [school, setSchool] = useState<SchoolDoc | null>(null);
  const [tools, setTools] = useState<ToolDoc[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");

  // Create-form state
  const [type, setType] = useState<ToolType>(TOOL_TYPE_LIST[0].key);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    Promise.all([getSchoolById(id), getToolsBySchool(id)])
      .then(([s, t]) => {
        setSchool(s);
        setTools(t);
        setLoadState("loaded");
      })
      .catch(() => setLoadState("error"));
  }, [id]);

  useEffect(load, [load]);

  const activeTools = useMemo(
    () => tools.filter((t) => t.status === "active"),
    [tools],
  );
  const hiddenTools = useMemo(
    () => tools.filter((t) => t.status !== "active"),
    [tools],
  );

  const retry = () => {
    setLoadState("loading");
    load();
  };

  if (loadState === "loading") {
    return (
      <main>
        <Heading />
        <ul className="mt-8 flex flex-col gap-4" aria-hidden="true">
          <li className="h-28 animate-pulse rounded-2xl bg-surface ring-1 ring-black/5" />
          <li className="h-28 animate-pulse rounded-2xl bg-surface ring-1 ring-black/5" />
        </ul>
        <p className="sr-only" role="status">
          {LOADING_TEXT}
        </p>
      </main>
    );
  }

  if (loadState === "error") {
    return (
      <main>
        <Heading />
        <p role="alert" className="mt-4 text-sm text-error">
          No pudimos cargar las herramientas. Revisá tu conexión e intentá de
          nuevo.
        </p>
        <button type="button" onClick={retry} className="btn btn-outline mt-3">
          Reintentar
        </button>
      </main>
    );
  }

  if (!school) {
    return (
      <main>
        <Heading />
        <p className="mt-4 text-sm text-muted">Escuela no encontrada.</p>
        <p className="mt-6 text-sm">
          <BackLink href="/panel">Volver al panel</BackLink>
        </p>
      </main>
    );
  }

  const isManager =
    user != null &&
    (school.ownerId === user.id ||
      school.editorIds?.includes(user.id) ||
      user.role === "admin");

  if (!isManager) {
    return (
      <main>
        <Heading subtitle={school.name} />
        <p className="mt-4 text-sm text-muted">No administrás esta escuela.</p>
        <p className="mt-6 text-sm">
          <BackLink href="/panel">Volver al panel</BackLink>
        </p>
      </main>
    );
  }

  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError("Ingresá el título de la herramienta.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const newId = await createTool(id, school.name, user.id, {
        type,
        title: trimmedTitle,
        description: description.trim(),
      });
      // Straight to the edit page (with ?created=1) so the board can add the cover, dates and
      // the call-to-action link.
      router.push(`/panel/school/${id}/tools/${newId}?created=1`);
    } catch (err) {
      setError(userErrorMessage(err, "No se pudo crear la herramienta."));
      setSaving(false);
    }
  };

  return (
    <main>
      <Heading subtitle={school.name} />

      <SchoolPanelNav schoolId={id} current="tools" />

      <p className="mt-6 text-sm text-muted">
        Las herramientas son actividades puntuales de la escuela (rifas, ventas,
        bingos, servicios, visitas guiadas…). Cada una aparece como tarjeta en la
        pestaña “Principal” de la escuela. escuelaplace solo da visibilidad: nunca
        procesa pagos.
      </p>

      <section className="mt-8">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">
          Activas ({activeTools.length})
        </h2>
        {tools.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              icon={<WrenchIcon className="h-7 w-7" />}
              title="Todavía no creaste ninguna herramienta"
              description="Creá tu primera actividad con el formulario de abajo: elegí su tipo, ponele un título y una descripción."
            />
          </div>
        ) : activeTools.length === 0 ? (
          <p className="mt-2 text-sm text-muted">No tenés herramientas activas.</p>
        ) : (
          <ul className="mt-4 flex flex-col gap-4">
            {activeTools.map((t) => (
              <ToolRow key={t.id} schoolId={id} tool={t} />
            ))}
          </ul>
        )}
      </section>

      {hiddenTools.length > 0 && (
        <section className="mt-10">
          <h2 className="text-lg font-semibold tracking-tight text-foreground">
            Ocultas
          </h2>
          <ul className="mt-4 flex flex-col gap-4">
            {hiddenTools.map((t) => (
              <ToolRow key={t.id} schoolId={id} tool={t} />
            ))}
          </ul>
        </section>
      )}

      <section className="mt-10">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">
          Crear una herramienta
        </h2>
        <form
          onSubmit={onCreate}
          onInvalidCapture={spanishRequiredMessage}
          onInputCapture={clearValidationMessage}
          className="mt-3 flex flex-col gap-4"
        >
          <div>
            <p className="text-sm font-medium text-foreground">
              Tipo de herramienta
            </p>
            <p className="mb-3 mt-0.5 text-xs text-muted">
              Elegí qué tipo de actividad vas a crear.
            </p>
            <ToolTypePicker value={type} onChange={setType} />
          </div>
          <Field label="Título">
            <input
              type="text"
              required
              maxLength={TOOL_TITLE_MAX}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="input"
              placeholder="Ej.: Rifa pro fondos para la gira"
            />
          </Field>
          <Field label="Descripción">
            <textarea
              rows={3}
              maxLength={TOOL_DESCRIPTION_MAX}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="input"
              placeholder="Contá de qué se trata la actividad."
            />
          </Field>

          <FormError message={error} />

          <button type="submit" disabled={saving} className="btn btn-primary">
            {saving ? "Creando…" : "Crear herramienta"}
          </button>
        </form>
      </section>

      <p className="mt-8 text-sm">
        <BackLink href="/panel">Volver al panel</BackLink>
      </p>
    </main>
  );
}
