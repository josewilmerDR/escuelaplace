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

## Convenciones de código

- **Idioma del código en inglés**: nombres de archivos, carpetas, variables,
  funciones, tipos y **comentarios** se escriben en **inglés**. El contenido de
  cara al usuario (UI, textos, copy) se mantiene en español.

## Actores y modelo de "páginas" (estilo Facebook — importante)

Una **cuenta de usuario** (login **solo con Google**) administra una o varias
**páginas**. Una página es un **comercio** o una **escuela**. El comprador nunca
se registra.

- **Persona (comprador)**: **SIN cuenta**. Navega todo el catálogo sin registrarse
  (estilo Amazon: ver comercios, escuelas, ofertas, info de la escuela). Su escuela
  elegida y ubicación viven en **localStorage, NUNCA en Firestore**. No crear colección
  ni Auth para compradores. La opción de registrarse aparece **solo** cuando quiere
  crear una página.
- **Usuario registrado**: cuenta con Auth (Google). Tras registrarse elige crear una
  **página de comercio** o de **escuela**. Una cuenta puede administrar **varias
  páginas** (`managedPages[]` en `users/{uid}`); el rol por página (`owner`/`editor`)
  vive ahí, no en el rol global (que solo distingue `admin`).
- **Comercio** (página): perfil público rico. Es el **contenido central**.
- **Escuela** (página): **autoadministrada**. Cualquier usuario puede crearla, pero
  nace **sin verificar** (`verificationStatus:'pending'`): el SINPE queda **oculto** y
  se muestra un **banner "datos sin verificar"** hasta que el **admin** la apruebe. Si
  el dueño edita un campo sensible (`name` o SINPE) tras estar verificada, vuelve a
  `'needs_reverification'` (SINPE oculto + banner) hasta nueva aprobación del admin.
  Esta mecánica de re-verificación aplica **solo a escuelas**, no a comercios.
- **Admin**: verifica páginas y datos sensibles. Único que escribe
  `verified`/`verificationStatus`.

## Decisiones de arquitectura (respetar)

1. **SEO crítico**: páginas públicas (comercios, escuelas, listados) se renderizan
   en **servidor (SSG/SSR)**, no client-side. Las lecturas se hacen en componentes
   de servidor vía `@/lib/firestore`.
2. **Denormalización deliberada**: ej. `schoolName` y `categoryNames` se copian
   dentro del doc del comercio para evitar lecturas extra al renderizar.
3. **Geo con geohash** calculado por geofire-common (guardar `location.geohash`
   además del `geopoint`). Las consultas de proximidad usan `geohashQueryBounds` +
   filtro por `distanceBetween`. La jerarquía administrativa es **agnóstica de
   país**: `admin1/admin2/admin3` (niveles del geocoder, general → específico:
   provincia/estado/departamento → cantón/municipio → distrito/comunidad) +
   `country` (ISO-2). Texto libre sugerido por reverse geocoding; nunca listas
   cerradas por país.
4. **Datos sensibles** (SINPE de la escuela) en subcolección privada
   `schools/{id}/private/data`, jamás en el doc público. **Escritura**: dueño de la
   escuela o admin. **Lectura**: dueño/admin siempre; además **cualquier usuario
   autenticado** (p.ej. un comercio que quiere suscribirse) pero **solo si la escuela
   está `verified`** — nunca anónimos. La capa de datos centraliza esto en
   `getVerifiedSchoolSinpe()` (devuelve null si no está verificada).
5. **Contadores con `increment()` atómico** (métricas, businessCount, etc.).
6. **Verificación de escuelas**: el dueño nunca escribe `verified`/`verificationStatus`
   (solo admin). Editar `name`/SINPE de una escuela verificada debe disparar
   `needs_reverification`.

## Modelo de datos (Firestore)

- `businesses/{id}`: name, slug, description, categories[], categoryNames[],
  location{geopoint, geohash, address, country, admin1, admin2, admin3}, schoolId,
  schoolName, contact{whatsapp, catalog, phone, email, web, instagram, facebook},
  discount{active, text, percentage}, logoUrl, coverUrl, photos[] (galería, máx 5),
  hours, status, verified,
  subscription{active, plan, validUntil}, ranking{score, totalDonated},
  metrics{views, interactions}, ownerId, editorIds[], createdAt, updatedAt
- `schools/{id}`: name, mepCode, description, thankYouMessage,
  location{geopoint, geohash, country, admin1, admin2, admin3}, photoUrl,
  boardContact{name, phone, email}, status, verified, verificationStatus
  ('pending'|'verified'|'needs_reverification'), metrics{supportingBusinesses},
  ownerId, editorIds[], createdAt, updatedAt
  - subcollection `private/data`: sinpe{number, accountHolder}
- `users/{uid}`: name, email, phone, role('user'|'admin'),
  managedPages[{type('business'|'school'), id, role('owner'|'editor')}], createdAt
- `categories/{id}`: name, icon, order, businessCount

Tipos en [`/types/firestore.ts`](types/firestore.ts).

## Estructura del proyecto

```
app/
  page.tsx                     # / (home) — SSR
  business/[slug]/page.tsx     # perfil público del comercio — SSR
  school/[id]/page.tsx         # página pública de la escuela — SSR
  category/[id]/page.tsx       # listado por categoría — SSR
  (panel)/                     # grupo de rutas privadas (URL: /panel/*)
    layout.tsx
    panel/page.tsx             # panel: lista las páginas del usuario (requiere Auth)
components/
  auth/                        # AuthProvider (contexto), useAuth, LoginButton, RequireAuth
lib/
  firebase.ts                  # init de app/firestore/auth/storage (singleton)
  auth/                        # login Google + creación de users/{uid} (ensureUserDoc)
  firestore/                   # capa de acceso a datos tipada
    businesses.ts  schools.ts  categories.ts  users.ts
    geo.ts  converters.ts  mutations.ts  index.ts
types/
  firestore.ts                 # tipos de todas las colecciones
firestore.rules                # reglas de seguridad
.env.local.example             # nombres de variables de entorno
```

## Capa de datos (`@/lib/firestore`)

- `getBusinessesBySchool(schoolId)` — ordenados por `ranking.score` desc, solo activos
- `getBusinessBySlug(slug)` / `getBusinessById(id)`
- `getBusinessesByCategory(categoryId)`
- `getSchoolById(id)` / `getSchools()`
- `getCategories()` / `getCategoryById(id)`
- `getNearbyBusinesses([lat, lng], radiusKm)` — proximidad por geohash
- `getPagesByUser(uid)` — páginas (`managedPages`) que administra el usuario, para el panel

## Reglas de seguridad (resumen)

- `businesses`, `schools`, `categories`: **lectura pública**.
- `businesses`: escritura del **dueño** (`ownerId`), **editores** (`editorIds`) o **admin**.
- `schools` (doc público): escritura del **dueño**/**editores** o **admin**, EXCEPTO
  `verified`/`verificationStatus` que son **solo admin**.
- `categories`: escritura solo **admin**.
- `schools/{id}/private/*` (SINPE): escritura del **dueño** o **admin**; lectura del
  dueño/admin, o de **cualquier usuario autenticado si la escuela está `verified`**.
- `users/{uid}`: solo el **propio** usuario (o admin).

## Comandos

```bash
npm run dev     # desarrollo
npm run build   # build de producción
npm run lint    # eslint
```
