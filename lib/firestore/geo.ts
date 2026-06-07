/**
 * Consultas de proximidad sobre `comercios` usando geohash (geofire-common).
 *
 * Firestore no soporta consultas geoespaciales nativas, así que se usa el patrón de
 * geohash: se calculan los rangos de geohash que cubren el radio pedido, se hace una
 * query por cada rango (`orderBy('ubicacion.geohash')` + startAt/endAt) y luego se
 * filtran los falsos positivos por distancia real con `distanceBetween`.
 *
 * Requisito: cada comercio debe guardar `ubicacion.geohash` calculado con
 * `geohashForLocation([lat, lng])` al escribir el documento.
 */
import {
  collection,
  endAt,
  getDocs,
  orderBy,
  query,
  startAt,
} from "firebase/firestore";
import {
  distanceBetween,
  geohashQueryBounds,
  type Geopoint,
} from "geofire-common";
import { db } from "@/lib/firebase";
import type { Comercio, ComercioDoc } from "@/types";
import { snapToList } from "./converters";

const COMERCIOS = "comercios";

export interface ComercioCercano extends ComercioDoc {
  /** Distancia al centro de búsqueda, en kilómetros. */
  distanciaKm: number;
}

/**
 * Comercios dentro de `radioKm` de un punto, ordenados por distancia ascendente.
 *
 * @param center [lat, lng]
 * @param radioKm radio de búsqueda en kilómetros (default 5km)
 */
export async function getComerciosCercanos(
  center: Geopoint,
  radioKm = 5,
): Promise<ComercioCercano[]> {
  const radiusM = radioKm * 1000;
  const bounds = geohashQueryBounds(center, radiusM);

  const snaps = await Promise.all(
    bounds.map((b) =>
      getDocs(
        query(
          collection(db, COMERCIOS),
          orderBy("ubicacion.geohash"),
          startAt(b[0]),
          endAt(b[1]),
        ),
      ),
    ),
  );

  const resultados: ComercioCercano[] = [];
  for (const snap of snaps) {
    for (const c of snapToList<Comercio>(snap)) {
      const gp = c.ubicacion?.geopoint;
      if (!gp) continue;
      const distKm = distanceBetween([gp.latitude, gp.longitude], center);
      if (distKm * 1000 <= radiusM) {
        resultados.push({ ...c, distanciaKm: distKm });
      }
    }
  }

  return resultados.sort((a, b) => a.distanciaKm - b.distanciaKm);
}
