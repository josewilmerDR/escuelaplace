"use client";

/**
 * Edit one school tool (/panel/school/[id]/tools/[toolId]).
 *
 * The board edits the tool's type, title, description, cover, optional activity window, an
 * optional call-to-action link, and its visibility (active/hidden). The cover uploads on save
 * (Storage), like the projects edit page. PURELY INFORMATIONAL — the CTA is a link the school
 * controls (scheme-checked on write); the platform never processes money.
 */
import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { SchoolPanelNav } from "@/components/school/SchoolPanelNav";
import {
  RaffleConfigFields,
  emptyRaffleForm,
  raffleFormFromConfig,
  toRaffleInput,
  type RaffleFormValue,
} from "@/components/tools/RaffleConfigFields";
import {
  RaffleNumberGrid,
  RaffleNumberLegend,
} from "@/components/tools/RaffleNumberGrid";
import { ToolTypePicker } from "@/components/tools/ToolTypePicker";
import { BackLink } from "@/components/ui/BackLink";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Field } from "@/components/ui/Field";
import { FormError } from "@/components/ui/FormError";
import { ImagePicker } from "@/components/ui/ImagePicker";
import { SavedIndicator } from "@/components/ui/SavedIndicator";
import { userErrorMessage } from "@/lib/errors";
import { clearValidationMessage, spanishRequiredMessage } from "@/lib/forms";
import { CARD_COVER_ASPECT, CARD_COVER_SIZES } from "@/lib/layout";
import { useUnsavedChangesGuard } from "@/lib/unsaved-changes";
import { safeExternalUrl } from "@/lib/url";
import {
  deleteTool,
  getRaffleOrdersByTool,
  getSchoolById,
  getToolById,
  raffleNumberStates,
  toolDateFromInput,
  toolDateInputValue,
  updateTool,
  uploadToolCover,
} from "@/lib/firestore";
import {
  TOOL_CTA_LABEL_MAX,
  TOOL_DESCRIPTION_MAX,
  TOOL_TITLE_MAX,
  type RaffleOrderDoc,
  type SchoolDoc,
  type ToolDoc,
  type ToolStatus,
  type ToolType,
} from "@/types";

type LoadState = "loading" | "error" | "loaded";

const LOADING_TEXT = "Cargando herramienta…";

function Heading({ subtitle }: { subtitle?: string }) {
  return (
    <header>
      <h1 className="text-3xl font-semibold tracking-tight text-foreground">
        Editar herramienta
      </h1>
      <p className="mt-1 text-sm text-muted">{subtitle || " "}</p>
    </header>
  );
}

export default function EditToolPage() {
  const { id, toolId } = useParams<{ id: string; toolId: string }>();
  const { user } = useAuth();
  const router = useRouter();
  const justCreated = useSearchParams().get("created") === "1";

  const [school, setSchool] = useState<SchoolDoc | null>(null);
  const [tool, setTool] = useState<ToolDoc | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");

  // Editable fields
  const [type, setType] = useState<ToolType>("other");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<ToolStatus>("active");
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [ctaLabel, setCtaLabel] = useState("");
  const [ctaUrl, setCtaUrl] = useState("");
  const [raffleForm, setRaffleForm] = useState<RaffleFormValue>(emptyRaffleForm);
  // Raffle orders, only for the read-only grid preview shown to the board.
  const [orders, setOrders] = useState<RaffleOrderDoc[]>([]);

  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useUnsavedChangesGuard(dirty);

  const load = useCallback(() => {
    Promise.all([
      getSchoolById(id),
      getToolById(id, toolId),
      getRaffleOrdersByTool(toolId).catch(() => []),
    ])
      .then(([s, t, o]) => {
        setSchool(s);
        setTool(t);
        setOrders(o);
        if (t) {
          setType(t.type);
          setTitle(t.title);
          setDescription(t.description);
          setStatus(t.status);
          setStartsAt(toolDateInputValue(t.startsAt));
          setEndsAt(toolDateInputValue(t.endsAt));
          setCtaLabel(t.cta?.label ?? "");
          setCtaUrl(t.cta?.url ?? "");
          if (t.raffle) setRaffleForm(raffleFormFromConfig(t.raffle));
        }
        setLoadState("loaded");
      })
      .catch(() => setLoadState("error"));
  }, [id, toolId]);

  useEffect(load, [load]);

  const retry = () => {
    setLoadState("loading");
    load();
  };

  if (loadState === "loading") {
    return (
      <main>
        <Heading />
        <div
          className="mt-8 h-64 animate-pulse rounded-2xl bg-surface ring-1 ring-black/5"
          aria-hidden="true"
        />
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
          No pudimos cargar la herramienta. Revisá tu conexión e intentá de nuevo.
        </p>
        <button type="button" onClick={retry} className="btn btn-outline mt-3">
          Reintentar
        </button>
      </main>
    );
  }

  if (!school || !tool) {
    return (
      <main>
        <Heading />
        <p className="mt-4 text-sm text-muted">
          {!school ? "Escuela no encontrada." : "Herramienta no encontrada."}
        </p>
        <p className="mt-6 text-sm">
          <BackLink href={`/panel/school/${id}/tools`}>
            Volver a herramientas
          </BackLink>
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

  const onSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError("Ingresá el título de la herramienta.");
      return;
    }
    // The CTA is all-or-nothing: a label without a link (or vice versa) is incomplete, and a
    // link must be a safe http(s) URL — caught here so the board gets a clear message instead
    // of a silently dropped button.
    const label = ctaLabel.trim();
    const url = ctaUrl.trim();
    if ((label && !url) || (!label && url)) {
      setError(
        "El botón necesita tanto un texto como un enlace; completá ambos o dejá los dos en blanco.",
      );
      return;
    }
    if (url && !safeExternalUrl(url)) {
      setError("El enlace del botón debe empezar con http:// o https://");
      return;
    }
    const start = toolDateFromInput(startsAt);
    const end = toolDateFromInput(endsAt);
    if (start && end && end < start) {
      setError("La fecha de fin no puede ser anterior a la de inicio.");
      return;
    }
    // A raffle carries its own config — validate it (only when the tool is a raffle).
    const raffleResult = type === "raffle" ? toRaffleInput(raffleForm) : null;
    if (raffleResult && !raffleResult.ok) {
      setError(raffleResult.error);
      return;
    }
    const raffle = raffleResult?.ok ? raffleResult.input : undefined;

    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      let coverUrl: string | undefined;
      if (coverFile) {
        coverUrl = await uploadToolCover(id, toolId, coverFile);
      }
      const cta = label && url ? { label, url } : null;
      await updateTool(id, toolId, {
        type,
        title: trimmedTitle,
        description: description.trim(),
        status,
        ...(coverUrl ? { coverUrl } : {}),
        startsAt: start,
        endsAt: end,
        cta,
        ...(raffle ? { raffle } : {}),
      });
      setTool((prev) =>
        prev
          ? {
              ...prev,
              type,
              title: trimmedTitle,
              description: description.trim(),
              status,
              ...(coverUrl ? { coverUrl } : {}),
            }
          : prev,
      );
      setCoverFile(null);
      setSaved(true);
      setDirty(false);
    } catch (err) {
      setError(userErrorMessage(err, "No se pudieron guardar los cambios."));
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async () => {
    setError(null);
    setDeleting(true);
    try {
      await deleteTool(id, toolId);
      router.push(`/panel/school/${id}/tools`);
    } catch (err) {
      setError(userErrorMessage(err, "No se pudo eliminar la herramienta."));
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  return (
    <main>
      <Heading subtitle={school.name} />

      <SchoolPanelNav schoolId={id} current="tools" />

      {justCreated && (
        <p className="mt-6 rounded-xl bg-success-tint p-3 text-sm text-success ring-1 ring-success/10">
          Herramienta creada. Agregale una portada, fechas y un botón si querés, y
          guardá los cambios.
        </p>
      )}

      <form
        onSubmit={onSave}
        onChange={() => setDirty(true)}
        onInvalidCapture={spanishRequiredMessage}
        onInputCapture={clearValidationMessage}
        className="mt-8 flex flex-col gap-4"
      >
        <div>
          <p className="text-sm font-medium text-foreground">
            Tipo de herramienta
          </p>
          <p className="mb-3 mt-0.5 text-xs text-muted">
            Elegí qué tipo de actividad es.
          </p>
          <ToolTypePicker
            value={type}
            onChange={(t) => {
              setType(t);
              setDirty(true);
            }}
          />
        </div>

        <Field label="Título">
          <input
            type="text"
            required
            maxLength={TOOL_TITLE_MAX}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="input"
          />
        </Field>

        <Field label="Descripción">
          <textarea
            rows={4}
            maxLength={TOOL_DESCRIPTION_MAX}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="input"
            placeholder="Contá de qué se trata la actividad."
          />
        </Field>

        {type === "raffle" && (
          <div className="rounded-2xl bg-surface p-4 ring-1 ring-black/5">
            <p className="mb-3 text-sm font-semibold text-foreground">
              Configuración de la rifa
            </p>
            <RaffleConfigFields value={raffleForm} onChange={setRaffleForm} />
          </div>
        )}

        {/* Existing cover preview (the picker only previews a NEW file). */}
        {tool.coverUrl && !coverFile && (
          <div>
            <p className="mb-1.5 text-sm font-medium text-foreground">
              Portada actual
            </p>
            <span
              className={`relative block w-full overflow-hidden rounded-xl bg-surface ring-1 ring-black/5 ${CARD_COVER_ASPECT}`}
            >
              <Image
                src={tool.coverUrl}
                alt=""
                fill
                sizes={CARD_COVER_SIZES}
                className="object-cover"
              />
            </span>
          </div>
        )}
        <ImagePicker
          label={tool.coverUrl ? "Reemplazar portada" : "Portada"}
          hint="Imagen horizontal. Opcional."
          variant="cover"
          value={coverFile}
          onChange={(f) => {
            setCoverFile(f);
            setDirty(true);
          }}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Desde (opcional)">
            <input
              type="date"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              className="input"
            />
          </Field>
          <Field label="Hasta (opcional)">
            <input
              type="date"
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
              className="input"
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Texto del botón (opcional)">
            <input
              type="text"
              maxLength={TOOL_CTA_LABEL_MAX}
              value={ctaLabel}
              onChange={(e) => setCtaLabel(e.target.value)}
              className="input"
              placeholder="Ej.: Escribinos por WhatsApp"
            />
          </Field>
          <Field label="Enlace del botón (opcional)">
            <input
              type="url"
              value={ctaUrl}
              onChange={(e) => setCtaUrl(e.target.value)}
              className="input"
              placeholder="https://…"
            />
          </Field>
        </div>

        <Field label="Visibilidad">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as ToolStatus)}
            className="input"
          >
            <option value="active">Visible en la página de la escuela</option>
            <option value="inactive">Oculta</option>
          </select>
        </Field>

        <FormError message={error} />

        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={saving} className="btn btn-primary">
            {saving ? "Guardando…" : "Guardar cambios"}
          </button>
          <SavedIndicator show={saved} onHide={() => setSaved(false)} />
          <Link href={`/school/${id}/tool/${toolId}`} className="btn btn-outline">
            Ver público
          </Link>
        </div>
      </form>

      {type === "raffle" && tool.raffle && (
        <section className="mt-10">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold tracking-tight text-foreground">
              Números
            </h2>
            <Link
              href={`/panel/school/${id}/raffle-orders`}
              className="text-sm font-medium text-brand-darker hover:underline"
            >
              Confirmar compras
            </Link>
          </div>
          <p className="mt-1 text-sm text-muted">
            Estado actual de los números (vista previa). Los compradores los eligen
            desde la página pública; confirmá cada pago en “Rifas”.
          </p>
          <div className="mt-4">
            <RaffleNumberGrid
              count={tool.raffle.numberCount}
              states={raffleNumberStates(orders, tool.raffle.numberCount)}
            />
            <RaffleNumberLegend />
          </div>
        </section>
      )}

      {/* Risk zone: deleting a tool is irreversible. */}
      <section className="mt-12 border-t border-border pt-6">
        <h2 className="text-sm font-semibold tracking-tight text-foreground">
          Eliminar herramienta
        </h2>
        <p className="mt-1 text-sm text-muted">
          Se quita de la página de la escuela y no se puede deshacer.
        </p>
        <button
          type="button"
          onClick={() => setConfirmDelete(true)}
          className="btn btn-destructive mt-3"
        >
          Eliminar herramienta
        </button>
      </section>

      <ConfirmDialog
        open={confirmDelete}
        title="Eliminar herramienta"
        tone="destructive"
        confirmLabel="Eliminar"
        cancelLabel="Cancelar"
        busy={deleting}
        busyLabel="Eliminando…"
        onConfirm={onDelete}
        onCancel={() => setConfirmDelete(false)}
      >
        <p>
          Vas a eliminar «{tool.title}». No se puede deshacer.
        </p>
      </ConfirmDialog>

      <p className="mt-8 text-sm">
        <BackLink href={`/panel/school/${id}/tools`}>
          Volver a herramientas
        </BackLink>
      </p>
    </main>
  );
}
