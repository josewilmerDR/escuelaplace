# escuelaplace.com

## Propósito

**Directorio comunitario** (catálogo, **NO marketplace**) que conecta comercios
locales con escuelas en Costa Rica (internacionalización después).

Los comercios pagan una **suscripción recurrente directo a la Junta de Educación**
de la escuela vía SINPE Móvil o cuenta bancaria. **La plataforma NUNCA procesa ni
toca pagos** — solo da visibilidad, insignia y ranking. Los compradores navegan el
catálogo **sin registrarse**.

> ⚠️ No implementar lógica de pagos. La plataforma no es intermediaria de dinero.

## Stack

- **Next.js (App Router) + TypeScript** — `next` 16, React 19
- **Tailwind CSS** v4
- **Firebase**: Firestore, Auth, Storage (SDK de cliente)
- **geofire-common** para consultas de proximidad (geohash)

### Notas de entorno

- La config de Firebase va en `.env.local` (ver `.env.local.example`), variables
  `NEXT_PUBLIC_*`. Nunca hardcodear.
- Red con TLS interceptado: si `npm`/`npx` fallan con `UNABLE_TO_VERIFY_LEAF_SIGNATURE`,
  exportar el almacén de CA de Windows a un PEM y setear
  `NODE_EXTRA_CA_CERTS` apuntando a él (no desactivar `strict-ssl`).

## Tres actores (tratamiento asimétrico — importante)

- **Comercio**: cuenta con Auth + perfil público rico. Es el **contenido central**.
- **Escuela**: página pública, **SIN cuenta autoadministrada** al inicio (la gestiona
  el admin). Datos sensibles (SINPE) en subcolección privada.
- **Persona (comprador)**: **SIN cuenta**. Su escuela elegida y ubicación viven en
  **localStorage, NUNCA en Firestore**. No crear colección ni Auth para compradores.

## Decisiones de arquitectura (respetar)

1. **SEO crítico**: páginas públicas (comercios, escuelas, listados) se renderizan
   en **servidor (SSG/SSR)**, no client-side. Las lecturas se hacen en componentes
   de servidor vía `@/lib/firestore`.
2. **Denormalización deliberada**: ej. `escuelaNombre` y `categoriasNombres` se copian
   dentro del doc del comercio para evitar lecturas extra al renderizar.
3. **Geo con geohash** calculado por geofire-common (guardar `ubicacion.geohash`
   además del `geopoint`). Las consultas de proximidad usan `geohashQueryBounds` +
   filtro por `distanceBetween`.
4. **Datos sensibles** (SINPE de la escuela) en subcolección privada
   `escuelas/{id}/privado/datos`, jamás en el doc público. Solo admin lee/escribe.
5. **Contadores con `increment()` atómico** (métricas, comerciosCount, etc.).

## Modelo de datos (Firestore)

- `comercios/{id}`: nombre, slug, descripcion, categorias[], categoriasNombres[],
  ubicacion{geopoint, geohash, direccion, provincia, canton, distrito}, escuelaId,
  escuelaNombre, contacto{whatsapp, telefono, email, web, instagram, facebook},
  descuento{activo, texto, porcentaje}, logoUrl, fotos[], horario, estado, verificado,
  suscripcion{activa, plan, vigenteHasta}, ranking{score, totalDonado},
  metricas{vistas, interacciones}, ownerId, createdAt, updatedAt
- `escuelas/{id}`: nombre, codigoMEP, descripcion, mensajeAgradecimiento,
  ubicacion{geopoint, geohash, provincia, canton, distrito}, fotoUrl,
  juntaContacto{nombre, telefono, email}, estado, verificada,
  metricas{comerciosApoyan}, createdAt, updatedAt
  - subcolección `privado/datos`: sinpe{numero, nombreTitular}
- `usuarios/{uid}`: nombre, email, telefono, rol('comercio'|'junta'|'admin'),
  comercioIds[], escuelaId, createdAt
- `categorias/{id}`: nombre, icono, orden, comerciosCount

Tipos en [`/types/firestore.ts`](types/firestore.ts).

## Estructura del proyecto

```
app/
  page.tsx                     # / (home) — SSR
  comercio/[slug]/page.tsx     # perfil público del comercio — SSR
  escuela/[id]/page.tsx        # página pública de la escuela — SSR
  categoria/[id]/page.tsx      # listado por categoría — SSR
  (panel)/                     # grupo de rutas privadas (URL: /panel/*)
    layout.tsx
    panel/page.tsx             # panel del comercio (requiere Auth)
lib/
  firebase.ts                  # init de app/firestore/auth/storage (singleton)
  firestore/                   # capa de acceso a datos tipada (lecturas)
    comercios.ts  escuelas.ts  categorias.ts  geo.ts  converters.ts  index.ts
types/
  firestore.ts                 # tipos de todas las colecciones
firestore.rules                # reglas de seguridad
.env.local.example             # nombres de variables de entorno
```

## Capa de datos (`@/lib/firestore`)

- `getComerciosPorEscuela(escuelaId)` — ordenados por `ranking.score` desc, solo activos
- `getComercioPorSlug(slug)` / `getComercioPorId(id)`
- `getComerciosPorCategoria(categoriaId)`
- `getEscuelaPorId(id)` / `getEscuelas()`
- `getCategorias()` / `getCategoriaPorId(id)`
- `getComerciosCercanos([lat, lng], radioKm)` — proximidad por geohash

## Reglas de seguridad (resumen)

- `comercios`, `escuelas`, `categorias`: **lectura pública**.
- `comercios`: escritura solo del **dueño** (`ownerId`) o **admin**.
- `escuelas` (doc público) y `categorias`: escritura solo **admin**.
- `escuelas/{id}/privado/*` (SINPE): lectura/escritura **solo admin**.
- `usuarios/{uid}`: solo el **propio** usuario (o admin).

## Comandos

```bash
npm run dev     # desarrollo
npm run build   # build de producción
npm run lint    # eslint
```
