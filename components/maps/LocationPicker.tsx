"use client";

/**
 * Reusable Google Maps location picker. A Places Autocomplete search box + a draggable
 * marker on a map; both feed lat/lng back via onChange. Used by the page-creation forms
 * so users don't type coordinates by hand. Optionally reverse-geocodes the pin into
 * administrative areas (onAddress) so forms can prefill provincia/cantón/distrito.
 *
 * Requires NEXT_PUBLIC_GOOGLE_MAPS_API_KEY (Maps JavaScript API + Places API enabled;
 * Geocoding API for onAddress). Without a key, renders a notice and a manual lat/lng
 * fallback so the form still works.
 */
import { memo, useEffect, useRef, useState } from "react";
import {
  APIProvider,
  Map,
  // TODO: migrate to AdvancedMarker once a real Map ID exists in Google Cloud Console
  // (AdvancedMarker requires one; DEMO_MAP_ID is development-only). Marker is
  // deprecated but Google keeps it functional — today it only logs a console warning.
  Marker,
  useMap,
  useMapsLibrary,
} from "@vis.gl/react-google-maps";

export interface LatLng {
  lat: number;
  lng: number;
}

/**
 * Administrative areas reverse-geocoded from the pin, as country-agnostic levels
 * (general → specific): admin1 = province/state/department, admin2 = canton/
 * municipality, admin3 = district/community/colonia. See types/firestore.ts.
 */
export interface AdminAreaGuess {
  admin1?: string;
  admin2?: string;
  admin3?: string;
  /** ISO 3166-1 alpha-2 country code (e.g. "CR"). */
  country?: string;
  /** Human-readable address of the most specific geocoder result. */
  formattedAddress?: string;
}

interface Props {
  value: LatLng | null;
  onChange: (value: LatLng) => void;
  /**
   * Best-effort administrative areas for the picked point, reported after each pin
   * move. Treat it as an editable suggestion: geocoding can fail (API not enabled,
   * offline) or return partial data, in which case the fields stay manual.
   */
  onAddress?: (guess: AdminAreaGuess) => void;
}

// Costa Rica, used as the initial view until a location is chosen.
const CR_CENTER: LatLng = { lat: 9.7489, lng: -83.7534 };
const CR_ZOOM = 7;
const PICKED_ZOOM = 16;

/**
 * Memoized: the forms that host this re-render on every keystroke of every field, and
 * without memo each keystroke re-renders the whole map tree. Callers keep `onChange`/
 * `onAddress` stable with useCallback so the memo actually holds.
 */
export const LocationPicker = memo(function LocationPicker({
  value,
  onChange,
  onAddress,
}: Props) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    return <ManualFallback value={value} onChange={onChange} />;
  }

  return (
    <APIProvider apiKey={apiKey}>
      <PickerInner value={value} onChange={onChange} onAddress={onAddress} />
    </APIProvider>
  );
});

function PickerInner({ value, onChange, onAddress }: Props) {
  useReverseGeocode(value, onAddress);
  return (
    <div className="flex flex-col gap-2">
      <PlacesSearch onSelect={onChange} />
      {/* Map framed as a calm-depth card: soft hairline ring, no hard border. */}
      <div className="h-64 w-full overflow-hidden rounded-2xl ring-1 ring-black/5">
        <Map
          defaultCenter={value ?? CR_CENTER}
          defaultZoom={value ? PICKED_ZOOM : CR_ZOOM}
          // "cooperative": one finger scrolls the page, two pan the map — "greedy"
          // turned the map into a scroll trap in the middle of a long mobile form.
          gestureHandling="cooperative"
          disableDefaultUI={false}
          onClick={(e) => {
            const ll = e.detail.latLng;
            if (ll) onChange({ lat: ll.lat, lng: ll.lng });
          }}
        >
          {value && (
            <Marker
              position={value}
              draggable
              onDragEnd={(e) => {
                const ll = e.latLng;
                if (ll) onChange({ lat: ll.lat(), lng: ll.lng() });
              }}
            />
          )}
          <Recenter value={value} />
        </Map>
      </div>
      <p className="text-xs text-muted">
        {value
          ? `Ubicación: ${value.lat.toFixed(5)}, ${value.lng.toFixed(5)} — arrastrá el pin o tocá el mapa para ajustar.`
          : "Buscá la dirección o tocá el mapa para colocar el pin."}
      </p>
    </div>
  );
}

/**
 * Reverse-geocodes the pin into administrative areas and reports them via onAddress.
 * One Geocoding request per pin move (onChange fires on click/drag-end/search, never
 * continuously). Failures are swallowed: the suggestion simply doesn't arrive and the
 * form fields stay manual.
 */
function useReverseGeocode(
  value: LatLng | null,
  onAddress?: (guess: AdminAreaGuess) => void,
) {
  const geocoding = useMapsLibrary("geocoding");
  const onAddressRef = useRef(onAddress);
  useEffect(() => {
    onAddressRef.current = onAddress;
  }, [onAddress]);

  useEffect(() => {
    if (!geocoding || !value || !onAddressRef.current) return;
    let cancelled = false;
    new geocoding.Geocoder()
      .geocode({ location: value })
      .then(({ results }) => {
        if (cancelled) return;
        // Scan every result: the most specific one often lacks the higher levels.
        const find = (type: string) => {
          for (const result of results) {
            const match = result.address_components.find((c) =>
              c.types.includes(type),
            );
            if (match) return match;
          }
          return undefined;
        };
        const get = (type: string) => find(type)?.long_name;
        // Per-level fallbacks: not every country fills every administrative level
        // (e.g. MX often has locality instead of level_2, colonias as sublocality).
        const admin2 = get("administrative_area_level_2") ?? get("locality");
        const admin3 =
          get("administrative_area_level_3") ??
          get("sublocality_level_1") ??
          get("sublocality");
        onAddressRef.current?.({
          admin1: get("administrative_area_level_1"),
          admin2,
          // Don't echo the same name twice when the fallbacks collide.
          admin3: admin3 === admin2 ? undefined : admin3,
          country: find("country")?.short_name,
          formattedAddress: results[0]?.formatted_address,
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [geocoding, value]);
}

/** Pans/zooms the map to the picked location whenever it changes. */
function Recenter({ value }: { value: LatLng | null }) {
  const map = useMap();
  useEffect(() => {
    if (map && value) {
      map.panTo(value);
      map.setZoom(PICKED_ZOOM);
    }
  }, [map, value]);
  return null;
}

/** Places Autocomplete bound to a text input; reports the chosen coordinates. */
function PlacesSearch({ onSelect }: { onSelect: (value: LatLng) => void }) {
  const places = useMapsLibrary("places");
  const inputRef = useRef<HTMLInputElement>(null);
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    if (!places || !inputRef.current) return;
    const autocomplete = new places.Autocomplete(inputRef.current, {
      fields: ["geometry"],
    });
    const listener = autocomplete.addListener("place_changed", () => {
      const loc = autocomplete.getPlace().geometry?.location;
      if (loc) onSelectRef.current({ lat: loc.lat(), lng: loc.lng() });
    });
    return () => {
      listener.remove();
      google.maps.event.clearInstanceListeners(autocomplete);
      // The widget appends its suggestion dropdown (.pac-container) to document.body
      // and never removes it — without this, every form mount leaks one. Only one
      // Autocomplete exists at a time in this app, so removing them all is safe.
      document.querySelectorAll(".pac-container").forEach((el) => el.remove());
    };
  }, [places]);

  return (
    <input
      ref={inputRef}
      type="text"
      aria-label="Buscar dirección o lugar"
      placeholder="Buscar dirección o lugar…"
      className="input"
      // Enter here means "pick the highlighted suggestion" (the Autocomplete widget
      // handles it on its own keydown listener), never "submit the surrounding form" —
      // without this, typing an address and hitting Enter submitted a half-filled form.
      onKeyDown={(e) => {
        if (e.key === "Enter") e.preventDefault();
      }}
    />
  );
}

/** Manual lat/lng inputs, used when no Maps API key is configured. */
function ManualFallback({ value, onChange }: Props) {
  // The env detail is for developers, not for the owner filling the form.
  useEffect(() => {
    console.warn(
      "LocationPicker: NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is not set; rendering the manual lat/lng fallback.",
    );
  }, []);

  // Local text state so clearing a field mid-edit doesn't snap the pin to 0
  // (Number("") is 0 — it silently sent the location to the Gulf of Guinea).
  // Only a complete, parseable pair propagates to the form.
  const [lat, setLat] = useState(value ? String(value.lat) : "");
  const [lng, setLng] = useState(value ? String(value.lng) : "");

  const propagate = (latText: string, lngText: string) => {
    const nextLat = Number(latText);
    const nextLng = Number(lngText);
    if (
      latText.trim() !== "" &&
      lngText.trim() !== "" &&
      !Number.isNaN(nextLat) &&
      !Number.isNaN(nextLng)
    ) {
      onChange({ lat: nextLat, lng: nextLng });
    }
  };

  return (
    <div>
      <p className="mb-2 rounded-xl bg-warning-tint p-3 text-xs text-warning ring-1 ring-warning/10">
        El mapa no está disponible en este momento. Ingresá las coordenadas
        manualmente.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Latitud</span>
          <input
            type="number"
            step="any"
            value={lat}
            onChange={(e) => {
              setLat(e.target.value);
              propagate(e.target.value, lng);
            }}
            className="input"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Longitud</span>
          <input
            type="number"
            step="any"
            value={lng}
            onChange={(e) => {
              setLng(e.target.value);
              propagate(lat, e.target.value);
            }}
            className="input"
          />
        </label>
      </div>
    </div>
  );
}
