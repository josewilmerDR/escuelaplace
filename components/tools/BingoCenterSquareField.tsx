"use client";

/**
 * Authoring UI for the classic 5×5 free-space "casilla central" — the deck-level (mazo) center
 * treatment. A selector (normal number / blank / text / logo) with a conditional text input or an
 * eager logo upload, plus a live preview built from the SAME BingoCenterCell the cartones render.
 *
 * Decoupled from storage: the caller passes `uploadImage`, so the same field works for any owner of
 * a center square (today the mazo creation form; the upload lands on the deck's Storage path). The
 * form value is all strings; toCenterSquare validates + converts it to the stored BingoCenterSquare.
 */
import { useRef, useState } from "react";
import Image from "next/image";
import { BingoCenterCell } from "@/components/tools/BingoCardGrid";
import { Field } from "@/components/ui/Field";
import { validateImageFile } from "@/components/ui/ImagePicker";
import { BINGO_CENTER_TEXT_MAX, type BingoCenterSquare } from "@/types";

/** Center-square form modes: 'normal' = traditional numbered center (no free space). */
export type BingoCenterMode = "normal" | BingoCenterSquare["type"];

/** Form-shaped center-square state (all strings, as the inputs hold them). */
export interface BingoCenterFormValue {
  type: BingoCenterMode;
  text: string;
  imageUrl: string;
}

export function emptyCenterForm(): BingoCenterFormValue {
  return { type: "normal", text: "", imageUrl: "" };
}

/** Hydrate the form from a stored BingoCenterSquare (or undefined = normal numbered center). */
export function centerFormFromSquare(
  center: BingoCenterSquare | undefined,
): BingoCenterFormValue {
  return {
    type: center?.type ?? "normal",
    text: center?.type === "text" ? (center.text ?? "") : "",
    imageUrl: center?.type === "image" ? (center.imageUrl ?? "") : "",
  };
}

/**
 * Validate + convert the center form into a BingoCenterSquare (or undefined for a numbered center).
 * Returns a Spanish error when 'text'/'image' is chosen without its content. `enabled` (the 5×5
 * gate) false → always undefined: there's no single middle cell to free off the classic grid.
 */
export function toCenterSquare(
  value: BingoCenterFormValue,
  enabled: boolean,
):
  | { ok: true; value: BingoCenterSquare | undefined }
  | { ok: false; error: string } {
  if (!enabled || value.type === "normal") return { ok: true, value: undefined };
  if (value.type === "text") {
    const text = value.text.trim().slice(0, BINGO_CENTER_TEXT_MAX);
    if (!text) {
      return {
        ok: false,
        error: "Escribe el texto de la casilla central o elige otra opción.",
      };
    }
    return { ok: true, value: { type: "text", text } };
  }
  if (value.type === "image") {
    if (!value.imageUrl) {
      return {
        ok: false,
        error: "Sube la imagen de la casilla central o elige otra opción.",
      };
    }
    return { ok: true, value: { type: "image", imageUrl: value.imageUrl } };
  }
  return { ok: true, value: { type: "blank" } };
}

/** The BingoCenterSquare the preview cell shows for the current form state (live, before save). */
function centerPreviewOf(value: BingoCenterFormValue): BingoCenterSquare {
  if (value.type === "text") return { type: "text", text: value.text.trim() };
  if (value.type === "image") return { type: "image", imageUrl: value.imageUrl };
  return { type: "blank" };
}

export function BingoCenterSquareField({
  value,
  onChange,
  uploadImage,
}: {
  value: BingoCenterFormValue;
  onChange: (v: BingoCenterFormValue) => void;
  /** Upload a picked logo and resolve its stored (public) URL. */
  uploadImage: (file: File) => Promise<string>;
}) {
  const set = (patch: Partial<BingoCenterFormValue>) =>
    onChange({ ...value, ...patch });

  return (
    <div>
      <p className="text-sm font-medium text-foreground">Casilla central (5×5)</p>
      <p className="mt-0.5 text-xs text-muted">
        En el bingo clásico, la casilla del centro es un espacio libre (se marca sola).
        Personalízala con el logo de la escuela, un texto, o déjala en blanco. Se aplica a
        TODOS los cartones de este mazo.
      </p>
      <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
        <div className="flex-1">
          <Field label="Centro del cartón">
            <select
              value={value.type}
              onChange={(e) => set({ type: e.target.value as BingoCenterMode })}
              className="input"
            >
              <option value="normal">Número normal (sin espacio libre)</option>
              <option value="blank">Libre — en blanco</option>
              <option value="text">Libre — con texto</option>
              <option value="image">Libre — con imagen (logo)</option>
            </select>
          </Field>
          {value.type === "text" && (
            <div className="mt-3">
              <Field label="Texto del centro">
                <input
                  type="text"
                  maxLength={BINGO_CENTER_TEXT_MAX}
                  value={value.text}
                  onChange={(e) => set({ text: e.target.value })}
                  className="input"
                  placeholder="Ej.: LIBRE"
                />
              </Field>
            </div>
          )}
          {value.type === "image" && (
            <div className="mt-3">
              <CenterImageField
                url={value.imageUrl}
                uploadImage={uploadImage}
                onChange={(url) => set({ imageUrl: url })}
              />
            </div>
          )}
          {value.type !== "normal" && (
            <p className="mt-2 text-xs text-muted">
              El centro no llevará número: cuenta como marcado para todos los patrones que
              pasan por ahí.
            </p>
          )}
        </div>
        {value.type !== "normal" && (
          <div className="shrink-0">
            <p className="mb-1 text-xs text-muted">Vista previa</p>
            <div className="w-16">
              <BingoCenterCell centerSquare={centerPreviewOf(value)} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * The center logo input: picks an image, uploads it immediately via `uploadImage` and reports back
 * the download URL — the same eager-upload pattern as tour/service media. Replacing leaves the old
 * blob orphaned (harmless).
 */
function CenterImageField({
  url,
  uploadImage,
  onChange,
}: {
  url: string;
  uploadImage: (file: File) => Promise<string>;
  onChange: (url: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const validationError = validateImageFile(file);
    if (validationError) {
      setError(validationError);
      e.target.value = "";
      return;
    }
    setError(null);
    setUploading(true);
    try {
      const uploaded = await uploadImage(file);
      onChange(uploaded);
    } catch {
      setError("No se pudo subir la imagen. Intenta de nuevo.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="flex flex-col gap-1.5 text-sm">
      <span className="text-sm font-medium text-foreground">Imagen del centro</span>
      <div className="mt-1 flex items-center gap-3">
        <span className="relative grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-md bg-white ring-1 ring-black/10">
          {url ? (
            <Image src={url} alt="" fill sizes="64px" className="object-contain p-1" />
          ) : (
            <span className="text-[10px] text-muted">Sin imagen</span>
          )}
        </span>
        <label className="btn btn-outline cursor-pointer has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand">
          {uploading ? "Subiendo…" : url ? "Cambiar imagen" : "Subir imagen"}
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="sr-only"
            aria-label="Imagen de la casilla central"
            onChange={onFile}
          />
        </label>
        {url && !uploading && (
          <button
            type="button"
            onClick={() => onChange("")}
            className="text-sm font-medium text-muted underline-offset-2 transition-colors hover:text-error"
          >
            Quitar
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="text-xs font-medium text-error">
          {error}
        </p>
      )}
    </div>
  );
}
