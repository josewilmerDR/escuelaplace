/**
 * Costa Rican administrative geography helpers.
 *
 * The seven provinces are a closed set, so forms offer a select instead of free text
 * (which produced "SJ"/"san jose"/"San José" variants in the same field). Cantons and
 * districts are far too many to hardcode — those arrive reverse-geocoded from the map
 * pin (see LocationPicker's onAddress) as an editable suggestion.
 */
import { normalize } from "@/lib/search";

export const CR_PROVINCES = [
  "San José",
  "Alajuela",
  "Cartago",
  "Heredia",
  "Guanacaste",
  "Puntarenas",
  "Limón",
] as const;

/**
 * Map a geocoder's province naming ("Provincia de San José", "San José Province") to
 * the canonical name, or undefined when it isn't a CR province.
 */
export function matchProvince(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const needle = normalize(raw);
  return CR_PROVINCES.find((p) => needle.includes(normalize(p)));
}
