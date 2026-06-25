# escuelaplace.com

## Propósito

**Directorio comunitario** (catálogo, **NO marketplace**) que conecta comercios
locales con escuelas en Costa Rica (internacionalización después).

Los comercios pagan una **suscripción recurrente directo a la escuela** (a su junta,
comité o asociación) por los **métodos de pago que la propia escuela publica** —
lista `label:value` agnóstica de país: cuenta bancaria, billetera local (SINPE
Móvil, Modo, Bizum…), PayPal, etc. Esa información es **solo informativa** para el
donante. **La plataforma NUNCA procesa, certifica ni
toca pagos** — solo da visibilidad, insignia y ranking. Los compradores navegan el
catálogo **sin registrarse**.

> ⚠️ No implementar lógica de pagos. La plataforma no es intermediaria de dinero.

## Stack

- **Next.js (App Router) + TypeScript** — `next` 16, React 19
- **Tailwind CSS** v4
- **Firebase**: Firestore, Auth, Storage (SDK de cliente)
- **Cloud Functions (Gen 2)** en [`functions/`](functions/) — paquete aparte (su propio
  `package.json`), con privilegios de Admin para mantener señales denormalizadas que el
  cliente no puede escribir (ranking, contadores, tiers de donante). Ver
  [Cloud Functions](#cloud-functions-functions).
- **geofire-common** para consultas de proximidad (geohash)
- **Vitest** para tests unitarios (helpers puros: ranking, search, métricas, contacto).
  Co-locados como `*.test.ts` junto al código.

### Notas de entorno

- La config de Firebase va en `.env.local` (ver `.env.local.example`), variables
  `NEXT_PUBLIC_*`. Nunca hardcodear.
- Red con TLS interceptado: si `npm`/`npx` fallan con `UNABLE_TO_VERIFY_LEAF_SIGNATURE`,
  exportar el almacén de CA de Windows a un PEM y setear
  `NODE_EXTRA_CA_CERTS` apuntando a él (no desactivar `strict-ssl`).

## Convenciones de código

- **Todo el código en inglés.** Nombres de archivos, carpetas, **segmentos de ruta**
  (`app/search`, no `app/buscar`), variables, funciones, tipos y **comentarios** van en
  **inglés**, sin excepción.
- **Solo el texto visible en pantalla va en español** (labels, títulos, copy, `placeholder`,
  `aria-label`, mensajes). El idioma activo hoy es español; de ahí que la UI sea en español,
  pero eso **no** alcanza al código. Ej.: la ruta es `/search` pero el botón dice "Buscar".
- **Excepción: slugs generados por el usuario** (no son código). La URL pública del comercio
  es el nombre que el dueño eligió, sin restricción de idioma:
  `/business/el-comercio-de-aurora` o `/business/johns-restaurant`.

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
  nace **sin verificar** (`verificationStatus:'pending'`): los métodos de pago quedan
  **ocultos** y se muestra un **banner "datos sin verificar"** hasta que el **admin**
  la apruebe. Si el dueño edita un campo sensible (`name` o métodos de pago) tras
  estar verificada, vuelve a `'needs_reverification'` (métodos de pago ocultos +
  banner) hasta nueva aprobación del admin.
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
4. **Datos sensibles** (métodos de pago de la escuela) en subcolección privada
   `schools/{id}/private/data`, jamás en el doc público. Modelo `label:value`
   agnóstico de país (`paymentMethods[]`; los docs legacy traen `sinpe` y se
   normalizan con `paymentMethodsOf()`). **Escritura**: dueño de la
   escuela o admin. **Lectura**: dueño/admin siempre; además **cualquier usuario
   autenticado** (p.ej. un comercio que quiere suscribirse) pero **solo si la escuela
   está `verified`** — nunca anónimos. La capa de datos centraliza esto en
   `getVerifiedSchoolPaymentMethods()` (devuelve null si no está verificada).
5. **Señales computadas mantenidas por Cloud Functions, nunca por el cliente.** El
   ranking del comercio (`ranking.score`, `ranking.totalDonated`), su agregado de reseñas
   (`reviewStats`), los contadores de la escuela (`metrics.supportingBusinesses`,
   `uniqueSupporters`), el progreso del proyecto (`raised`, `contributorsCount`) y el tier
   del donante (`donorProfiles`) se recalculan con el Admin SDK al confirmarse el hecho que
   los alimenta. Las reglas **rechazan** cualquier escritura del cliente a esos campos, así
   nadie infla su propio ranking/barra/tier. La capa de datos solo los **lee**.
6. **Verificación de escuelas**: el dueño nunca escribe `verified`/`verificationStatus`
   (solo admin). Editar `name`/métodos de pago de una escuela verificada debe disparar
   `needs_reverification`.
7. **El "soporte" es una relación de primera clase, no un pago.** Un comercio que apoya a
   una escuela y un donante personal son el **mismo** documento `subscriptions/{id}`
   (`supporterType: 'business' | 'user'`); el aporte único a un proyecto es
   `projectContributions/{id}`. El documento guarda **solo** el flag `proofUploaded` — el
   comprobante real vive en Storage (gated por `storage.rules`), nunca en el doc público.
   La escuela confirma; la plataforma nunca toca el dinero. El día que se decida mediar
   pagos, el flujo de dinero se monta encima de este mismo esquema.

## Modelo de datos (Firestore)

Campos marcados **(fn)** los mantiene una Cloud Function; el cliente no los escribe.

- `businesses/{id}`: name, slug, description, categories[], categoryNames[],
  location{geopoint, geohash, address, country, admin1, admin2, admin3}, schoolId,
  schoolName, contact{whatsapp, catalog, phone, email, web, instagram, facebook},
  discount{active, text, percentage}, logoUrl, coverUrl, photos[] (galería, máx 5),
  hours, status('draft'|'pending'|'active'|'suspended'), verified,
  subscription{active, plan, validUntil}, **ranking{score, totalDonated} (fn)**,
  metrics{views, interactions}, **reviewStats{count, average} (fn)**,
  ownerId, editorIds[], createdAt, updatedAt
  - subcollection `reviews/{userId}` (id = uid del autor → una reseña por persona):
    authorId, authorName, rating(1–5), text, createdAt, updatedAt
  - subcollection `metricsDaily/{YYYY-MM-DD}`: contadores diarios del embudo, privados
    del dueño; escritos **solo** por la función `trackInteraction`
- `schools/{id}`: name, description, thankYouMessage,
  location{geopoint, geohash, country, admin1, admin2, admin3}, photoUrl,
  coverUrl, photos[] (galería, máx 5),
  boardContact{name, phone, email}, status('pending'|'active'|'inactive'), verified,
  verificationStatus('pending'|'verified'|'needs_reverification'),
  **metrics{supportingBusinesses, uniqueSupporters} (fn)**,
  ownerId, editorIds[], createdAt, updatedAt
  - subcollection `private/data`: paymentMethods[{label, value}] (legacy:
    sinpe{number, accountHolder}, normalizado al leer con `paymentMethodsOf()`)
  - subcollection `projects/{projectId}`: schoolId, schoolName, title, description,
    currency('CRC'|'USD'|'NIO'|'MXN'|'EUR'), status('active'|'completed'|'cancelled'),
    stages[{title, justification, cost, photos[], quoteUrls[]}] (meta = suma de costos),
    coverUrl, **raised (fn)**, **contributorsCount (fn)**, ownerId, createdAt, updatedAt
- `subscriptions/{id}`: relación de soporte (comercio→escuela **o** donante→escuela).
  supporterType('business'|'user'), businessId/businessName **o** donorId/donorName,
  schoolId, schoolName, units (entero × `SUBSCRIPTION_UNIT_CRC`), amount, status
  ('pending'|'confirmed'|'expiring'|'expired'), confirmedAt, firstConfirmedAt, expiresAt,
  confirmedBy, proofUploaded, **countsForRanking (fn)** (elegibilidad anti-fraude: escuela
  verificada y sin auto-trato; el cliente filtra por él), createdAt, updatedAt
- `projectContributions/{id}`: aporte único a un proyecto. schoolId, schoolName, projectId,
  projectTitle, type('money'|'in_kind'), donorId, donorName, amount (in-kind = valor
  asignado), currency, description?, stageIndex?, stageTitle?,
  status('pending'|'confirmed'), confirmedAt, confirmedBy, proofUploaded, createdAt, updatedAt
- `donorProfiles/{uid}`: reconocimiento público del donante (id = uid). displayName,
  isPublic (opt-in), **totalUnits (fn)**, **tier('bronze'|'silver'|'gold'|'platinum') (fn)**,
  **schoolsSupported (fn)**, **projectsSupported (fn)**, **firstConfirmedAt (fn)**,
  **lastConfirmedAt (fn)**, createdAt, updatedAt
- `users/{uid}`: name, email, phone, role('user'|'admin'),
  managedPages[{type('business'|'school'), id, role('owner'|'editor')}], createdAt
- `categories/{id}`: name, icon, order, **businessCount (fn)**
- `auditEvents/{id}` **(fn, append-only, lectura solo admin)**: rastro no sensible de cada
  confirmación (de suscripción **o** de aporte a proyecto) para revisión de fraude + feature
  store de la futura IA. type('subscription_confirmed'|'project_contribution_confirmed'),
  subscriptionId/contributionId, projectId/projectTitle/contributionType (aportes),
  supporterType, businessId/donorId, schoolId, schoolName, supporterName (denormalizados para
  la UI de admin), units (conteo, **nunca** monto; solo suscripciones), confirmedBy,
  confirmedAt, schoolVerified, selfDealt, confirmerIsSupporter, createdAt. Sin comprobante ni
  cifras de dinero. Lo revisa el admin en `/panel/admin`.

Tipos (y los `*_MAX`/`SUBSCRIPTION_*` constantes) en
[`/types/firestore.ts`](types/firestore.ts).

## Estructura del proyecto

```
app/
  page.tsx                       # / (home) — SSR
  layout.tsx  globals.css  not-found.tsx
  search/page.tsx                # /search — búsqueda (SSR + filtrado en cliente)
  categories/page.tsx            # /categories — índice de categorías
  category/[id]/page.tsx         # listado por categoría — SSR
  business/[slug]/page.tsx       # perfil público del comercio — SSR (+ loading.tsx)
  school/[id]/page.tsx           # página pública de la escuela — SSR
  school/[id]/project/[pid]/page.tsx   # detalle público de un proyecto — SSR
  (panel)/                       # grupo de rutas privadas (URL: /panel/*, requiere Auth)
    layout.tsx
    panel/page.tsx               # lista las páginas (managedPages) del usuario
    panel/new/{,business,school}/page.tsx   # onboarding: crear comercio o escuela
    panel/donate/page.tsx        # donación personal a una escuela
    panel/fund/page.tsx          # financiar (aportar a) un proyecto
    panel/business/[id]/{edit,metrics,subscribe}/page.tsx
    panel/school/[id]/{edit,projects,projects/[pid],project-contributions,subscriptions}/page.tsx
components/                      # agrupados por dominio (client components)
  auth/        # AuthProvider (contexto), useAuth, LoginButton, RequireAuth
  business/    # BusinessCard, ContactButtons, Gallery/Photo, ManageBar, SupportBadge, Track*
  buyer/       # CommunityPicker (escuela/ubicación del comprador → localStorage)
  donors/      # DonorTierBadge          reviews/   # ReviewForm, Stars, OwnReviewMark
  feed/        # RankedFeed              school/    # PaymentMethods{Editor,Info}, SchoolManageBar
  layout/      # SiteHeader              search/    # SearchBar
  maps/        # LocationPicker          subscriptions/ # SubscriptionStatusBadge
  projects/    # ProjectCard, ProjectProgress, ProjectStatusBadge, StagesEditor
  ui/          # Combobox, Field, FormError, ImagePicker, PhoneField
lib/
  firebase.ts                    # init de app/firestore/auth/storage (singleton)
  auth/                          # login Google + creación de users/{uid} (ensureUserDoc)
  buyer/preferences.ts           # estado del comprador en localStorage (sin Firestore)
  firestore/                     # capa de datos tipada — un archivo por dominio,
    businesses.ts  schools.ts  categories.ts  subscriptions.ts  projects.ts
    donors.ts  reviews.ts  metrics.ts  ranking.ts  feed.ts  users.ts
    geo.ts  converters.ts  serialize.ts  index.ts   # cada dominio expone READS + WRITES
  contact.ts  format.ts  forms.ts  location.ts  metrics.ts  search.ts  track.ts ...
                                 # helpers puros de UI/dominio (varios con *.test.ts al lado)
functions/                       # Cloud Functions Gen 2 (paquete aparte, su package.json)
  src/index.ts  src/ranking.ts  src/donors.ts  src/track.ts
types/
  firestore.ts                   # tipos + constantes de todas las colecciones
scripts/seed.mjs                 # carga datos de ejemplo (npm run seed)
docs/DEPLOY.md                   # guía de despliegue
firestore.rules  storage.rules  firestore.indexes.json   # seguridad e índices
firebase.json  .firebaserc  apphosting.yaml              # config Firebase / App Hosting
vitest.config.ts  eslint.config.mjs  next.config.ts  .env.local.example
```

## Capa de datos (`@/lib/firestore`)

**Punto de entrada único**: importar siempre desde `@/lib/firestore` (el barrel
[`index.ts`](lib/firestore/index.ts)), nunca desde un subarchivo. Cada archivo de dominio
contiene **tanto sus lecturas (SSR/SSG) como sus escrituras** (mutaciones del panel); los
helpers de escritura compartidos viven en `geo.ts` (`toLocation`, `LocationInput`) y
`users.ts` (`linkPageToUser`).

- **businesses.ts** — `getBusinessesBySchool` (orden `ranking.score` desc, solo activos),
  `getBusinessBySlug` / `getBusinessById`, `getBusinessesByCategory`, `getActiveBusinesses`;
  writes: `slugify`, `createBusinessPage`, `updateBusinessProfile`, `setBusinessStatus`,
  galería.
- **schools.ts** — `getSchoolById`, `getSchools` / `getSchoolsCached`,
  `getVerifiedSchoolPaymentMethods` (null si no está verificada), `paymentMethodsOf`;
  writes: `createSchoolPage`, `updateSchoolProfile`, `updateSchoolPaymentMethods`, galería.
- **subscriptions.ts** — reads por comercio/escuela/donante + cola de pendientes;
  writes: `createSubscription`, `uploadSubscriptionProof`, `confirmSubscription`,
  `expireSubscription`.
- **projects.ts** — `getProjectsBySchool`, `getProjectById`, contribuciones, `projectGoal`,
  `projectProgress`; writes: CRUD de proyectos + `createContribution`/`confirmContribution`.
- **donors.ts** — tiers (`donorTierForUnits`), `getDonorProfile`, `getSchoolDonorWall`;
  writes: `createDonation`, `ensureDonorProfile`, `updateDonorRecognition`.
- **reviews.ts** — `getReviewsByBusiness`, `getMyReview`, `upsertReview`, `deleteReview`.
- **audit.ts** — `getRecentAuditEvents`, `getAuditEventsBySchool` (solo lectura, solo admin;
  el rastro de auditoría lo escribe la Cloud Function).
- **categories.ts** — `getCategories` / `getCategoryById`.
- **geo.ts** — `getNearbyBusinesses` / `getNearbySchoolIds` (proximidad por geohash) +
  `toLocation`/`LocationInput`.
- **feed.ts** / **ranking.ts** — re-ranking del feed por comunidad del comprador y los
  helpers puros del score (espejados en `functions/src/ranking.ts`).
- **metrics.ts** — métricas diarias del comercio; **users.ts** — `getPagesByUser`,
  `getUserById`, `linkPageToUser`.

## Cloud Functions (`functions/`)

Paquete aparte (Gen 2, Admin SDK) que mantiene las señales que el cliente no puede escribir
(ver decisión de arquitectura #5). El Admin SDK **omite** las reglas de Firestore.

- `onSubscriptionWritten` — al crear/editar/borrar una suscripción recalcula el
  `ranking.score`/`totalDonated` del comercio, los contadores de la escuela y —si es
  donación personal— el `donorProfiles` del donante. El ranking del comercio aplica un
  **gate anti-fraude**: una suscripción solo cuenta si la escuela está `verified` **y** no
  comparte dueño/editor con el comercio (auto-trato) — así nadie se autoconfirma soporte
  para ganar visibilidad gratis. En cada confirmación además anexa un evento no sensible a
  `auditEvents` (quién/cuándo + señales de colusión) para revisión de fraude y la IA futura.
- `onSchoolWritten` — cuando cambia `verificationStatus` o los administradores de una
  escuela (ambos alimentan ese gate), recalcula el ranking de **todos** los comercios que la
  apoyan **y el `voteSupport` de las candidaturas de los reinados de esa escuela** (mismo gate);
  esos cambios no tocan ninguna suscripción ni `pageantVote`, así que ni `onSubscriptionWritten`
  ni `onPageantVoteWritten` se dispararían. Ignora el resto de las ediciones de la escuela.
- `onProjectContributionWritten` — recalcula `raised`/`contributorsCount` del proyecto y
  `projectsSupported` del donante; en cada confirmación anexa un evento a `auditEvents`
  (igual que las suscripciones).
- `onPageantVoteWritten` — al confirmarse un apoyo económico (`pageantVotes`) recalcula el
  `voteSupport`/`supportCount` de la candidata del reinado, aplicando el mismo gate anti-fraude
  (escuela verificada + sin auto-trato: el partidario no administra la escuela). En cada
  confirmación anexa un evento `pageant_vote_confirmed` a `auditEvents`. `units` es un conteo,
  nunca dinero.
- `castPageantApplause` (`onRequest`) — el voto libre de "simpatía" del visitante **sin cuenta**
  para una candidata (la única vía, porque el ledger `applause` está cerrado al cliente). Exige
  **App Check** (el muro anti-bots de un voto que pesa en la corona), revalida el gate en servidor
  (escuela verificada + reinado activo con `freeVotingEnabled` + candidata existente + ventana) y
  escribe un ballot idempotente `applause/{sha256(toolId+voterKey)}` — un voto por dispositivo/
  reinado. El eje simpatía es no vinculante y topado, y `freeVotingEnabled` queda **apagado** hasta
  probar App Check en prod.
- `onApplauseWritten` — recalcula `candidate.voteFree = COUNT(applause de esa candidata)` por
  agregación (idempotente bajo redelivery). El ledger no cascada.
- `onReviewWritten` — recalcula `reviewStats` del comercio (y su ranking).
- `onBusinessWritten` — recalcula el `businessCount` (comercios activos) de cada categoría a
  la que pertenece el comercio, al crear/editar/borrar/cambiar status. El cliente escribe el
  `categories[]` del comercio pero no puede mantener el agregado de la categoría; usa una
  count-query del lado servidor y omite la escritura si ya está al día. `categories` no tiene
  trigger, así que no cascada.
- `expireSubscriptionsDaily` — job programado (03:00): vence las suscripciones lapsas
  (`expired`) y marca las próximas a vencer (`expiring`); esas escrituras vuelven a
  disparar `onSubscriptionWritten`.
- `trackInteraction` / `recordWalkIn` (`./track`) — contadores del embudo
  (`businesses/{id}/metricsDaily`) que el comprador anónimo no puede escribir directo.

Los pesos del ranking y los umbrales de tier se **duplican** en `functions/src`
(`ranking.ts`, `donors.ts`) como copia sin dependencias para el runtime de funciones;
mantenerlos en sync con `lib/firestore/ranking.ts` y `donors.ts`.

## Reglas de seguridad (resumen)

- `businesses`, `schools`, `categories`, `subscriptions`, `projectContributions`,
  `schools/{id}/projects`, `businesses/{id}/reviews`: **lectura pública** (catálogo SSR).
- `businesses`: escritura del **dueño** (`ownerId`), **editores** (`editorIds`) o **admin**;
  un update no-admin debe **dejar intactos** `ranking` y `reviewStats` (los mantiene la fn).
- `schools` (doc público): escritura del **dueño**/**editores** o **admin**, EXCEPTO
  `verified`/`verificationStatus` que son **solo admin**.
- `categories`: escritura solo **admin**.
- `schools/{id}/private/*` (métodos de pago): escritura del **dueño** o **admin**; lectura del
  dueño/admin, o de **cualquier usuario autenticado si la escuela está `verified`**.
- `schools/{id}/projects/*`: crear/editar/borrar dueño/editores o admin; un update no-admin
  debe dejar `raised`/`contributorsCount` intactos.
- `subscriptions`: crea el **lado que apoya** (comercio o el propio donante), forzado a
  `pending`; **solo la escuela destino** (o admin) confirma/vence; nadie puede reescribir
  quién apoya a quién ni subir `units`/`amount` tras confirmar, ni tocar `countsForRanking`
  (lo mantiene la fn).
- `projectContributions`: crea el **contribuyente**, forzado a `pending` y **solo si la
  escuela está `verified`**; solo la escuela/admin confirma.
- `donorProfiles/{uid}`: lectura del propio donante/admin, o de cualquiera si `isPublic`;
  el donante crea con todos los computados en cero y solo edita `displayName`/`isPublic`
  (tier/totales los pone la fn).
- `businesses/{id}/reviews/{userId}`: escritura del propio usuario (rating 1–5, texto ≤600),
  **no** puede reseñar su propio comercio; admin puede borrar (moderación).
- `businesses/{id}/metricsDaily/*`: lectura dueño/admin; escritura **solo** vía función.
- `auditEvents/*`: lectura **solo admin**; escritura **prohibida** al cliente (solo la fn).
- `users/{uid}`: solo el **propio** usuario (o admin).

## Comandos

```bash
npm run dev     # desarrollo
npm run build   # build de producción
npm run lint    # eslint
npm test        # vitest (helpers puros) — usa `npm run test:watch` en desarrollo
npm run seed    # carga datos de ejemplo en Firestore (scripts/seed.mjs)
```
