"use client";

/**
 * Reusable Google Maps location picker. A Places Autocomplete search box + a draggable
 * marker on a map; both feed lat/lng back via onChange. Used by the page-creation forms
 * so users don't type coordinates by hand.
 *
 * Requires NEXT_PUBLIC_GOOGLE_MAPS_API_KEY (Maps JavaScript API + Places API enabled).
 * Without it, renders a notice and a manual lat/lng fallback so the form still works.
 */
import { useCallback, useEffect, useRef } from "react";
import {
  APIProvider,
  Map,
  Marker,
  useMap,
  useMapsLibrary,
} from "@vis.gl/react-google-maps";

export interface LatLng {
  lat: number;
  lng: number;
}

interface Props {
  value: LatLng | null;
  onChange: (value: LatLng) => void;
}

// Costa Rica, used as the initial view until a location is chosen.
const CR_CENTER: LatLng = { lat: 9.7489, lng: -83.7534 };
const CR_ZOOM = 7;
const PICKED_ZOOM = 16;

export function LocationPicker({ value, onChange }: Props) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    return <ManualFallback value={value} onChange={onChange} />;
  }

  return (
    <APIProvider apiKey={apiKey}>
      <PickerInner value={value} onChange={onChange} />
    </APIProvider>
  );
}

function PickerInner({ value, onChange }: Props) {
  return (
    <div className="flex flex-col gap-2">
      <PlacesSearch onSelect={onChange} />
      <div className="h-64 w-full overflow-hidden rounded-md border">
        <Map
          defaultCenter={value ?? CR_CENTER}
          defaultZoom={value ? PICKED_ZOOM : CR_ZOOM}
          gestureHandling="greedy"
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
      <p className="text-xs text-gray-500">
        {value
          ? `Ubicación: ${value.lat.toFixed(5)}, ${value.lng.toFixed(5)} — arrastrá el pin o tocá el mapa para ajustar.`
          : "Buscá la dirección o tocá el mapa para colocar el pin."}
      </p>
    </div>
  );
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
    return () => listener.remove();
  }, [places]);

  return (
    <input
      ref={inputRef}
      type="text"
      placeholder="Buscar dirección o lugar…"
      className="input"
    />
  );
}

/** Manual lat/lng inputs, used when no Maps API key is configured. */
function ManualFallback({ value, onChange }: Props) {
  const set = useCallback(
    (patch: Partial<LatLng>) =>
      onChange({
        lat: patch.lat ?? value?.lat ?? 0,
        lng: patch.lng ?? value?.lng ?? 0,
      }),
    [value, onChange],
  );

  return (
    <div>
      <p className="mb-2 text-xs text-amber-700">
        Mapa no disponible (falta NEXT_PUBLIC_GOOGLE_MAPS_API_KEY). Ingresá las
        coordenadas manualmente.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Latitud</span>
          <input
            type="number"
            step="any"
            value={value?.lat ?? ""}
            onChange={(e) => set({ lat: Number(e.target.value) })}
            className="input"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Longitud</span>
          <input
            type="number"
            step="any"
            value={value?.lng ?? ""}
            onChange={(e) => set({ lng: Number(e.target.value) })}
            className="input"
          />
        </label>
      </div>
    </div>
  );
}
