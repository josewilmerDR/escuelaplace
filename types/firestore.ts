/**
 * Tipos de las colecciones de Firestore para escuelaplace.com
 *
 * Convenciones:
 * - Timestamps tipados como `Timestamp` (firebase/firestore). En componentes de servidor
 *   se serializan a string/number antes de pasar a componentes de cliente.
 * - Denormalización deliberada: campos como `escuelaNombre` o `categoriasNombres` se copian
 *   dentro del documento para evitar lecturas extra al renderizar.
 * - La geo guarda `geopoint` (GeoPoint) + `geohash` (string calculado con geofire-common)
 *   para poder hacer consultas de proximidad por rango de geohash.
 * - Datos sensibles (SINPE de la escuela) NO viven en el doc público: van en la
 *   subcolección privada `escuelas/{id}/privado/datos` (ver `EscuelaPrivado`).
 */
import type { GeoPoint, Timestamp } from "firebase/firestore";

// ── Tipos compartidos ────────────────────────────────────────────────────────

export interface Ubicacion {
  geopoint: GeoPoint;
  geohash: string;
  direccion?: string;
  provincia: string;
  canton: string;
  distrito: string;
}

export interface ContactoComercio {
  whatsapp?: string;
  telefono?: string;
  email?: string;
  web?: string;
  instagram?: string;
  facebook?: string;
}

export interface Descuento {
  activo: boolean;
  texto: string;
  porcentaje?: number;
}

export interface Suscripcion {
  activa: boolean;
  plan: string;
  /** Fecha hasta la que la suscripción está vigente. */
  vigenteHasta: Timestamp | null;
}

export interface RankingComercio {
  /** Score calculado para ordenar comercios dentro de una escuela. */
  score: number;
  /** Monto total donado/aportado (informativo para el ranking). */
  totalDonado: number;
}

export interface MetricasComercio {
  vistas: number;
  interacciones: number;
}

export type EstadoComercio = "borrador" | "pendiente" | "activo" | "suspendido";
export type EstadoEscuela = "pendiente" | "activa" | "inactiva";

// ── comercios/{id} ───────────────────────────────────────────────────────────

export interface Comercio {
  nombre: string;
  slug: string;
  descripcion: string;
  categorias: string[]; // ids de categorias
  categoriasNombres: string[]; // denormalizado para render sin lecturas extra
  ubicacion: Ubicacion;
  escuelaId: string;
  escuelaNombre: string; // denormalizado
  contacto: ContactoComercio;
  descuento: Descuento;
  logoUrl?: string;
  fotos: string[];
  horario?: string;
  estado: EstadoComercio;
  verificado: boolean;
  suscripcion: Suscripcion;
  ranking: RankingComercio;
  metricas: MetricasComercio;
  ownerId: string; // uid del usuario dueño (rol 'comercio')
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** Comercio con su id de documento incluido (lo que devuelve la capa de datos). */
export type ComercioDoc = Comercio & { id: string };

// ── escuelas/{id} ────────────────────────────────────────────────────────────

export interface JuntaContacto {
  nombre: string;
  telefono?: string;
  email?: string;
}

export interface MetricasEscuela {
  comerciosApoyan: number;
}

export interface Escuela {
  nombre: string;
  codigoMEP: string;
  descripcion: string;
  mensajeAgradecimiento: string;
  ubicacion: Omit<Ubicacion, "direccion">;
  fotoUrl?: string;
  juntaContacto: JuntaContacto;
  estado: EstadoEscuela;
  verificada: boolean;
  metricas: MetricasEscuela;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type EscuelaDoc = Escuela & { id: string };

/**
 * Subcolección privada: escuelas/{id}/privado/datos
 * Datos sensibles. SOLO admin puede leer/escribir (ver firestore.rules).
 * JAMÁS se incluye en el documento público de la escuela.
 */
export interface EscuelaPrivado {
  sinpe: {
    numero: string;
    nombreTitular: string;
  };
}

// ── usuarios/{uid} ───────────────────────────────────────────────────────────

export type RolUsuario = "comercio" | "junta" | "admin";

export interface Usuario {
  nombre: string;
  email: string;
  telefono?: string;
  rol: RolUsuario;
  comercioIds: string[];
  escuelaId?: string;
  createdAt: Timestamp;
}

export type UsuarioDoc = Usuario & { id: string };

// ── categorias/{id} ──────────────────────────────────────────────────────────

export interface Categoria {
  nombre: string;
  icono: string;
  orden: number;
  comerciosCount: number;
}

export type CategoriaDoc = Categoria & { id: string };

// ── Estado del comprador (NO Firestore) ──────────────────────────────────────

/**
 * La "Persona" (comprador) NO tiene cuenta ni documento en Firestore.
 * Su escuela elegida y ubicación viven SOLO en localStorage. Este tipo documenta
 * la forma de esos datos del lado cliente.
 */
export interface PreferenciasComprador {
  escuelaId?: string;
  escuelaNombre?: string;
  ubicacion?: { lat: number; lng: number };
}
