"use client";

/**
 * Phone input with dialability feedback. WhatsApp is the platform's attribution
 * backbone, and buildWhatsAppUrl/buildPhoneUrl silently render NO button when the
 * stored number can't be normalized — so an undialable number must be caught here, at
 * typing time, not discovered later as a missing button on the public profile.
 *
 * Valid numbers show how they will be dialed right away (positive feedback); the error
 * only appears after blur so the user isn't scolded mid-typing.
 */
import { useState } from "react";
import { formatPhoneDisplay } from "@/lib/contact";

export function PhoneField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [touched, setTouched] = useState(false);
  const raw = value.trim();
  const display = raw ? formatPhoneDisplay(raw) : null;
  const showError = touched && raw !== "" && display === null;

  return (
    <div className="flex flex-col gap-1 text-sm">
      <label className="flex flex-col gap-1">
        <span className="font-medium">{label}</span>
        <input
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => setTouched(true)}
          placeholder="8888-8888"
          aria-invalid={showError || undefined}
          className="input"
        />
      </label>
      {showError ? (
        <p role="alert" className="text-xs text-red-600">
          No parece un número marcable. Usá 8888-8888, o con código de país si
          no es de Costa Rica.
        </p>
      ) : display ? (
        <p className="text-xs text-muted">Se va a marcar como {display}.</p>
      ) : null}
    </div>
  );
}
