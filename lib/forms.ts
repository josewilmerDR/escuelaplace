/**
 * Spanish copy for native form validation. The browser renders its default messages in
 * the BROWSER's language ("Please fill out this field"), clashing with the all-Spanish
 * UI; these handlers override the most common failure (required fields) while keeping
 * the native focus/anchoring behavior. Wire BOTH on the <form>: onInvalidCapture sets
 * the message, onInputCapture clears it so the control can revalidate once filled.
 */
import type { FormEvent } from "react";

export function spanishRequiredMessage(e: FormEvent): void {
  const el = e.target as HTMLInputElement;
  if (el.validity?.valueMissing) {
    el.setCustomValidity("Completá este campo.");
  }
}

export function clearValidationMessage(e: FormEvent): void {
  (e.target as HTMLInputElement).setCustomValidity?.("");
}
