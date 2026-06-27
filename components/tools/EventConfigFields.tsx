"use client";

/**
 * The event-specific text inputs, shared by the create and edit forms (like BingoConfigFields):
 * WHEN (date + time), WHERE (a place + an optional map link) and the WhatsApp number for the
 * public "Preguntar" button. Controlled — the parent owns an EventFormValue. Conversion to/from
 * the stored EventConfig lives here. The gallery (photos + video) is NOT configured here; it's
 * added on the edit page via the shared media card (it needs a persisted tool, like every other
 * tool kind's media).
 */
import { Field } from "@/components/ui/Field";
import { toolDateTimeFromInput, toolDateTimeInputValue } from "@/lib/firestore";
import { safeExternalUrl } from "@/lib/url";
import { EVENT_PLACE_MAX, type EventConfig } from "@/types";
import type { EventConfigInput } from "@/lib/firestore";

/** Form-shaped event config (all strings, as the inputs hold them). */
export interface EventFormValue {
  /** "YYYY-MM-DDTHH:mm" (datetime-local). */
  date: string;
  place: string;
  mapUrl: string;
  contactPhone: string;
}

export function emptyEventForm(): EventFormValue {
  return { date: "", place: "", mapUrl: "", contactPhone: "" };
}

/** Hydrate the form from a stored config (edit page). */
export function eventFormFromConfig(event: EventConfig): EventFormValue {
  return {
    date: toolDateTimeInputValue(event.date),
    place: event.place ?? "",
    mapUrl: event.mapUrl ?? "",
    contactPhone: event.contactPhone ?? "",
  };
}

/**
 * Validate + convert the form to a data-layer EventConfigInput (without media — the caller merges
 * the already-persisted gallery). Returns a Spanish error when invalid: the date is required (an
 * event without a date isn't useful) and a map link, when given, must be a safe http(s) URL.
 */
export function toEventInput(
  value: EventFormValue,
): { ok: true; input: EventConfigInput } | { ok: false; error: string } {
  const date = toolDateTimeFromInput(value.date);
  if (!date) {
    return { ok: false, error: "Indica la fecha y hora del evento." };
  }
  const place = value.place.trim();
  const mapUrl = value.mapUrl.trim();
  if (mapUrl && !safeExternalUrl(mapUrl)) {
    return {
      ok: false,
      error: "El enlace del mapa debe empezar con http:// o https://",
    };
  }
  return {
    ok: true,
    input: {
      date,
      ...(place ? { place } : {}),
      ...(mapUrl ? { mapUrl } : {}),
    },
  };
}

export function EventConfigFields({
  value,
  onChange,
}: {
  value: EventFormValue;
  onChange: (v: EventFormValue) => void;
}) {
  const set = (patch: Partial<EventFormValue>) => onChange({ ...value, ...patch });

  return (
    <div className="flex flex-col gap-4">
      <Field label="Fecha y hora del evento">
        <input
          type="datetime-local"
          value={value.date}
          onChange={(e) => set({ date: e.target.value })}
          className="input"
        />
      </Field>

      <Field label="Lugar (opcional)">
        <input
          type="text"
          maxLength={EVENT_PLACE_MAX}
          value={value.place}
          onChange={(e) => set({ place: e.target.value })}
          className="input"
          placeholder="Ej.: Gimnasio de la escuela"
        />
      </Field>

      <Field label="Enlace del mapa (opcional)">
        <input
          type="url"
          value={value.mapUrl}
          onChange={(e) => set({ mapUrl: e.target.value })}
          className="input"
          placeholder="https://maps.google.com/…"
        />
      </Field>
    </div>
  );
}
