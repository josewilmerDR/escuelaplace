# Security Baseline — escuelaplace

> Auditoría de línea base "production-grade", 2026-06-16. Boundary de seguridad = `firestore.rules` +
> `storage.rules` + Cloud Functions (no hay backend propio ni API routes; el SDK cliente habla
> directo con Firestore/Storage). La plataforma **no procesa pagos**: el perfil de impacto real es
> escalada de privilegios, exposición de PII, integridad de datos/abuso y costo/disponibilidad-como-DoS
> — nunca pérdida financiera directa.
>
> Marco de referencia: **OWASP ASVS L1→L2** como columna vertebral + Firebase Security Checklist +
> OWASP Top 10. El checklist reutilizable por página vive en [`AUDIT-CHECKLIST.md`](./AUDIT-CHECKLIST.md).

## 1. Postura general

**`solid-with-gaps`.** Para una app serverless de un solo desarrollador, la columna de autorización es
genuinamente sólida: verificación de escuela admin-only, campos computados congelados contra escrituras
del cliente (`preservesComputedFields` / `preservesProjectCounters` / `preservesRankingEligibility`),
identidad de la relación de soporte congelada tras crear, anti-auto-confirmación, gate de métodos de
pago tras `verified`, y `collectionGroup(projects)` autorizado explícitamente.

Pero hay **un patrón sistémico que se repite y es la raíz de los hallazgos más graves**: varios
invariantes críticos del servidor se aplican **solo en el código cliente**, no en las reglas. Las
reglas son la única frontera real, así que cualquiera de esos invariantes se evade con una sola
escritura cruda del SDK desde la consola del navegador. Tres dominios de control están **ausentes por
completo**: (1) validación de forma/tamaño de entrada en reglas, (2) capa anti-automatización (App
Check / rate-limiting / CORS), y (3) tests automatizados de reglas + CI.

## 2. Hallazgos priorizados

Severidad ya **corregida** tras la verificación adversarial (red-team) y el pase de completitud. Los
ítems marcados ⚠️ los destapó el crítico de completitud y la síntesis inicial los había subestimado.

| # | Severidad | Hallazgo | Clase | Fix |
|---|-----------|----------|-------|-----|
| 1 | 🔴 **Critical** | Cualquier usuario autenticado se auto-asigna `users/{uid}.role = 'admin'` | EoP | P0 |
| 2 ⚠️ | 🔴 **Critical-adj.** | Bypass de re-verificación: el dueño cambia métodos de pago/nombre y sigue `verified` | Tampering (integridad de pago) | P0 |
| 3 | 🟠 **High** | `donorName` + montos exactos legibles por cualquiera en `subscriptions`/`projectContributions` | Info Disclosure | P0 |
| 4 ⚠️ | 🟠 **High** | `editorIds`/`ownerId` auto-escribibles y sin validar → editor se convierte en owner / acuña co-admins | EoP | P1 |
| 5 | 🟠 **High** | Sin capa anti-automatización: no App Check + `trackInteraction` público sin throttle (cost/availability-DoS) | DoS | P1 |
| 6 | 🟡 **Medium** | Sin validación de forma/tipo/tamaño en reglas — todo `*_MAX` es solo UI, evadible | Tampering | P1 |
| 7 | 🟡 **Medium** | Escrituras a Storage de assets demasiado amplias (cualquier signed-in escribe en cualquier ruta) + sin límite de tamaño/tipo | Tampering/DoS | P1 |
| 8 | 🟡 **Medium** (raíz↑) | Sin tests de reglas y sin CI — toda la frontera puede regresar en silencio (auto-deploy de `main`) | Assurance | P1 |
| 9 | 🟡 **Medium** | Headers de seguridad ausentes (CSP, HSTS, frame-ancestors, nosniff…) | Misconfig | P1 |
| 10 | 🟡 **Medium** | Proofs (PII financiera) retenidos indefinidamente; sin policy/consentimiento/erasure | Privacy | P1/P2 |
| 11 ⚠️ | 🟡 **Medium** | Confirm/expire sin transacción ni state-machine guard + triggers sin `event.id` idempotency → doble-conteo | Integridad/race | P1 |
| 12 ⚠️ | 🟡 **Medium** | Admin global único, sin scoping/2FA; acciones de admin (verify/delete) **no** se auditan | IR / blast radius | P2 |
| 13 ⚠️ | 🟡 **Medium** | Scraping del catálogo libre = exfiltración del grafo completo SMB+escuelas+contacto (riesgo de negocio) | Info Disclosure | P2 |
| 14 | 🟡 **Medium** | Functions sin `maxInstances`/quota (default Gen2 ~1000) = denial-of-wallet | DoS/costo | P1 |
| 15 | 🟢 **Low** | `quoteUrls`/hrefs UGC sin validar esquema (`javascript:`/`data:`) | XSS | P2 |
| — | ✅ cerrado | `lib/view-as.ts` impersonation — **no es riesgo** (toggle client-only, no cambia identidad) | — | — |

### Los dos invariantes "solo cliente" que importan más (P0)

**#1 — Escalada a admin.** `isAdmin()` deriva de `users/{uid}.role` ([firestore.rules:32-34](../../firestore.rules#L32-L34))
y la regla de `users/{uid}` no restringe `role` en create/update ([firestore.rules:56-60](../../firestore.rules#L56-L60)).
No hay custom claims en ningún lado (grep confirmado), así que ese campo es el **único** ancla de
confianza de admin. Un `updateDoc(doc(db,'users',miUid), {role:'admin'})` desde la consola desbloquea:
verificar escuelas (exponer métodos de pago), confirmar cualquier suscripción/aporte, borrar reseñas,
escribir categorías y leer todo `auditEvents`. **Sin logging del cambio de rol → indetectable.**

**#2 — Bypass de re-verificación.** Decisión de arquitectura #6: editar `name` o métodos de pago de
una escuela `verified` debe bajarla a `needs_reverification`. Pero ese downgrade vive **solo** en
[`updateSchoolProfile`](../../lib/firestore/schools.ts#L205-L214) y
[`updateSchoolPaymentMethods`](../../lib/firestore/schools.ts#L296-L302). Las reglas solo bloquean
*subir* a verified (`grantsVerification`); no hay regla que *fuerce* la bajada. Un atacante con escuela
ya aprobada hace `setDoc(doc(db,'schools',id,'private','data'), {paymentMethods:[{label,value: su-SINPE}]})`
y su número queda publicado bajo el gate `verified` sin re-revisión. Defeats el propósito entero de la
verificación admin sobre el **único dato sensible** de la plataforma.

> **Raíz común de #1, #2, #4 (y por qué #8 sube de prioridad):** los cuatro son "invariante crítico
> aplicado en cliente, no en reglas". Una sola suite de tests deny-case de reglas los atraparía a todos.

## 3. Modelo de amenazas (STRIDE)

| Amenaza | STRIDE | Actor | Activo | Mitigación actual | Residual |
|---------|--------|-------|--------|-------------------|----------|
| Auto-elevación a admin vía `role` propio | EoP | Cualquier usuario Google | Autoridad admin completa | Cliente pone `'user'`; reglas no lo exigen → **sin mitigar** | 🔴 critical |
| Swap de SINPE en escuela verificada | Tampering | Dueño de escuela | Integridad del dato de pago | Downgrade solo en helper cliente → **sin mitigar** | 🔴 critical |
| Scrape directo de `subscriptions`/`projectContributions` | Info Disclosure | Visitante anónimo | Identidad + montos de donantes | Solo disciplina de render; data layer abierto (`read: if true`) | 🟠 high |
| Bot floods `trackInteraction` / crea docs pending / scrapea | DoS (costo+disp.) | Cliente scripteado | Disponibilidad (maxInstances:2) + facturación | Validación de input; sin App Check / rate-limit / cap | 🟠 high |
| Editor reescribe `ownerId` a sí mismo / acuña editores | EoP | Editor de página | Control de la página + key anti-self-dealing | `preserves*` no congela `ownerId`/`editorIds` → **sin mitigar** | 🟠 high |
| Owner spoofea denormalizados / sube payload gigante | Tampering | Owner / script | Integridad del catálogo + costo de render | Campos computados congelados; forma/tamaño no | 🟡 medium |
| Signed-in sobrescribe assets de competidor / sube archivos | Tampering/DoS | Cualquier usuario Google | Assets de marca + costo Storage | Proofs sí gated; assets no (solo `isSignedIn()`) | 🟡 medium |
| Owner/editor malicioso cosecha histórico de proofs (PII bancaria) | Info Disclosure | Owner/editor comprometido | PII financiera | Boundary de lectura ok; retención ilimitada + sin log de acceso | 🟡 medium |
| Refactor de reglas tira un guard en silencio → prod | Tampering (regresión) | Mantenedor (accidental) | Toda la autorización | Code review; sin tests de reglas ni CI gate | 🟡 medium |
| PII de junta publicada sin consentimiento; sin erasure | Info Disclosure / compliance | Creador de página | PII + Ley 8968 / GDPR | Quitable vía form; sin consentimiento/policy/erasure | 🟡 medium |
| Clickjacking / blast-radius de futuro XSS sobre SSR+login | Tampering/EoP | Atacante con iframe / sink futuro | Sesión del owner logueado | Solo auto-escape de React; sin CSP/frame-ancestors/HSTS | 🟢 low |

## 4. Marco de seguridad (taxonomía de dominios)

Adaptado a una app **serverless Firebase + SSR sin backend propio**. Para cada dominio: principio,
controles que el código debe garantizar, referencia ASVS y estado actual.

| Dominio | Principio | Estado | ASVS |
|---------|-----------|--------|------|
| **D1 · AuthN** | Identidad = token de Firebase Auth, nunca un uid del cliente. Sin manejo de credenciales propio. | 🟢 strong | V2/V3 |
| **D2 · AuthZ (la columna)** | Las reglas SON el tier de autorización: cada acceso explícitamente permitido, default-deny, mínimo privilegio. El ancla de admin debe ser **inforjable** (custom claim, no campo auto-escribible). | 🔴 weak | V4 / A01 |
| **D3 · Validación e integridad** | Toda escritura no confiable acotada en TIPO, FORMA y TAMAÑO **en las reglas**. El form no es un control. | 🔴 absent | V5 / A04 |
| **D4 · Protección de datos & privacidad** | El dato sensible se expone solo a identidades autorizadas y se minimiza en superficies públicas; el control de privacidad vive en el **data layer**, no solo en el render. | 🔴 weak | V8 / Ley 8968 / GDPR |
| **D5 · Secretos & config** | Nada secreto en bundle/git; entornos aislados; afordances dev fuera de prod. `NEXT_PUBLIC_*` es público por diseño. | 🟡 adequate | Firebase Checklist / V14 |
| **D6 · Abuso, rate-limiting & cost-DoS** | Actores anónimos y autenticados no pueden disparar trabajo/costo ilimitado; el tráfico se ata a la app real (App Check). | 🔴 weak | V11 / App Check |
| **D7 · Logging & monitoreo** | Eventos relevantes registrados inmutablemente y revisables, sin datos sensibles. **Falta:** auditar acciones de **admin**. | 🟡 adequate | V7 |
| **D8 · Hardening HTTP (headers/CSP)** | Headers de defensa en profundidad reducen blast-radius de XSS/clickjacking en SSR con UGC. | 🔴 absent | V14.4 / A05 |
| **D9 · Cadena de suministro & build** | Dependencias y pipeline no introducen ni filtran vulnerabilidades; gate de `npm audit`. | 🔴 weak | V10 / A06 |
| **D10 · Respuesta a incidentes & recuperación** | El equipo puede detectar, contener y recuperarse. Trail append-only es buena base; faltan backups documentados y runbooks. | 🔴 weak | NIST CSF / V1.11 |

## 5. Roadmap priorizado

**P0 — antes de lanzar público / acumular datos reales (todos cierran un invariante "solo-cliente"):**

> **Estado (2026-06-16):** P0-a, P0-b, P0-c **implementados**; pendiente deploy en el orden de
> [ADMIN-BOOTSTRAP.md](./ADMIN-BOOTSTRAP.md). **P0-d Etapa 1 (deanonimización) IMPLEMENTADA** y
> verificada con el harness de reglas; **Etapa 2 (ocultar montos exactos) pendiente** — ver §5b.

- ✅ **P0-a** · Restringir `role` en `users/{uid}`: create exige `role == 'user'`; update no-admin exige `role` sin cambios. Admin migrado a **custom claim** (`request.auth.token.admin`); `isAdmin()` transicional (claim OR campo, sin lockout) en `firestore.rules` **y** `storage.rules`. → `firestore.rules` (`isAdmin`, `users/{uid}`), `storage.rules` (`isAdmin`). *(cierra #1)*
- ✅ **P0-b** · Callables admin-only `grantAdminRole`/`revokeAdminRole` (Admin SDK: claim + espejo `role` + revoke refresh tokens + `adminEvents`) + script de bootstrap del primer admin. → `functions/src/admin.ts`, `functions/scripts/set-admin.mjs`, regla `adminEvents`, [ADMIN-BOOTSTRAP.md](./ADMIN-BOOTSTRAP.md). *(habilita #1; base para auditar admin, #12)*
- ✅ **P0-c** · Downgrade de re-verificación **forzado en reglas**: renombrar una escuela `verified` exige bajarla a `needs_reverification` (`renamePreservesVerification()`); escribir métodos de pago queda bloqueado mientras la escuela esté `verified` (debe bajarse primero). Cliente `updateSchoolPaymentMethods` reordenado. → `firestore.rules` (school update + `private/` write), `lib/firestore/schools.ts`. *(cierra #2)*
- 🟢 **P0-d Etapa 1** · **Deanonimización cerrada — IMPLEMENTADO.** `donorName` movido del doc público de los registros personales (`subscriptions` con `supporterType:'user'` y todo `projectContributions`) a una subcolección privada `private/data`, legible solo por el donante/escuela/admin (verificado por harness). Un scraper anónimo ya **no** puede leer el nombre real de un donante opt-out. El nombre se vuelve a fusionar **client-side** para el panel de la escuela (que sí está autorizado), sin tocar el feed/wall/métricas SSR. → `firestore.rules` (subcols `private/`), `lib/firestore/{donors,projects,subscriptions}.ts`, `functions/src/index.ts` (audit lee de `private/`), `types/firestore.ts`, `test/rules/firestore.rules.test.ts`. *(cierra el núcleo de #3 — deanonimización de opt-out)*
- 🔲 **P0-d Etapa 2** · **Ocultar montos exactos** (`amount`/`units` de registros personales). Pendiente: entrelazado con las reglas anti-fraude de inmutabilidad post-confirmación (`keepsCommitmentOnceConfirmed`/`keepsContributionIdentity` referencian `units`/`amount`); mover esos campos exige **reubicar el check anti-fraude** a la regla del subdoc privado y que las CF (`recomputeDonorProfile`/`recomputeProject`) los lean de `private/` (coste de N reads). Riesgo de integridad de ranking/tier → hacerlo con tests anti-fraude dedicados. **Residual actual:** los montos personales quedan visibles tarde a un `donorId` (uid) pseudónimo; para donantes opt-IN (perfil público) el monto exacto es cruzable vía su uid — cerrar en Etapa 2. *(cierra el resto de #3)*

### 5b · Diseño de P0-d (para la siguiente sesión enfocada)

**Por qué NO se lockearon las colecciones (decisión de diseño).** Investigación confirmó que
**ningún consumidor público SSR lee `donorName`/`amount`** — el feed usa `units` de suscripciones
de negocio, el donor wall usa `donorId`+`confirmedAt`+`donorProfiles` (gated por `isPublic`), y el
chip de métricas usa conteos+tiempos. El dato sensible solo lo consumen partes **autorizadas** (CF
con Admin SDK; paneles del dueño/escuela/donante). Lockear las colecciones rompería esas 3 consultas
anónimas (que consultan la colección aunque no usen los campos) y exigiría reescribir el donor wall a
un agregado + filtrar el feed por `supporterType` (+ índice) — todo SSR no verificable aquí. Por eso
se eligió **mover el campo sensible a una ubicación privada legible solo por los autorizados**, dejando
el doc público (que el feed/wall/métricas sí leen) intacto.

**Etapa 1 — IMPLEMENTADA (`donorName`).** Subcolección `private/data` en cada registro personal con
`{donorName}`; reglas `read: donante/escuela/admin`, `write: donante/admin` (helpers
`subscriptionData`/`contributionData`). Write paths (`createDonation`/`createContribution`) escriben
el nombre ahí, no en el doc público. Lecturas de panel (`getSubscriptionsBySchool`/
`getContributionsBySchool`) hacen un **merge best-effort solo en cliente** (`typeof window` gate): en
SSR anónimo se salta (el wall no lo necesita), en el panel el dueño autenticado sí lo trae. CF de
auditoría leen `donorName` de `private/` con Admin SDK. Verificado: 5 tests allow/deny en el harness.

**Etapa 2 — pendiente (`amount`/`units`).** El monto = `units × UNIT_CRC`, y `units`/`amount` están
referenciados por las reglas anti-fraude (`keepsCommitmentOnceConfirmed`, `keepsContributionIdentity`)
que impiden inflar la magnitud comprometida post-confirmación. Para ocultar montos hay que mover
`units`/`amount` (de registros personales) a `private/` **y reubicar ese check anti-fraude** a la regla
del subdoc privado, además de que `recomputeDonorProfile`/`recomputeProject` (CF) los lean de `private/`
(coste de N reads/recompute). Es la parte riesgosa (integridad de ranking/tier) — hacerla con tests
anti-fraude dedicados. Pairear con **minimizar el DTO público** del negocio (quitar `contact.phone/email`
y geopoint exacto) para cortar el scraping de inteligencia competitiva (#13).

**P1 — endurecer antes de escalar:**

- **P1-a** · **App Check** (reCAPTCHA Enterprise web) enforced en Firestore/Storage/Functions; consumir el token en `trackInteraction` y rechazar POSTs sin token; CORS al origen de producción. *(palanca de mayor apalancamiento; cierra #5 y gran parte de #7/#13)*
- **P1-b** · **Validación de forma en reglas** por colección: `keys().hasOnly([...])`, type guards, caps de string/array espejando `*_MAX`, membership de enum, bounds numéricos (`units<=SUBSCRIPTION_UNITS_MAX`, `amount==units*UNIT_CRC`, `cost<=PROJECT_STAGE_COST_MAX`); forzar `status:'draft'` en create de business. **Incluir** en este batch: congelar `ownerId` (`keepsOwner()`) y validar shape/length de `editorIds` en updates no-admin. *(cierra #6 y #4)*
- **P1-c** · Gate de escrituras de assets en Storage (`businesses/{id}/**`, `schools/{id}/**`) por owner/editor del doc padre (espejar el patrón `firestore.get()` de los proofs) + `request.resource.size < cap` y `contentType` matcher en TODAS las reglas de write. *(cierra #7)*
- **P1-d** · Cap de `maxInstances`/`concurrency`/región vía `setGlobalOptions` en Functions + alerta de presupuesto + cuota dura. *(quick — cierra #14)*
- ✅ **P1-e** · **Harness de tests de reglas + CI** — IMPLEMENTADO. Suite `@firebase/rules-unit-testing` + Vitest contra el emulador: **69 tests verdes** (54 firestore + 15 storage), allow+deny por colección, con foco en los P0 (escalada de rol, re-verificación, custom-claim admin + fallback, self-confirm, immutabilidad de campos computados, gate de lectura de métodos de pago, proof ownership). CI en GitHub Actions (`lint` + `test` + `npm audit --audit-level=high` + suite de reglas) como merge gate. → `test/rules/*.rules.test.ts`, `vitest.rules.config.ts`, `firebase.emulator-test.json` (puertos aislados para correr junto al emulador de dev), `npm run test:rules`, `.github/workflows/ci.yml`. *(cierra #8 — atrapa #1/#2/#4 como regresión; **desbloquea la verificación de P0-d**)*
- **P1-f** · `headers()` en `next.config.ts`: CSP estricta (script-src self + orígenes Firebase/Google, JSON-LD por nonce/hash, `frame-ancestors 'none'`), HSTS, nosniff, Referrer-Policy, Permissions-Policy. Rollout en `Report-Only` primero. *(cierra #9)*
- **P1-g** · `/privacy` + `/terms` + consentimiento en onboarding ("esta información será pública") + gate de teléfono/email de junta tras verificación/consentimiento. *(must-fix legal — Ley 8968 / contexto de comunidades escolares con menores)*
- **P1-h** · Confirm transaccional con guard de transición `pending→confirmed` en reglas + `event.id` idempotency en `onSubscriptionWritten`/`onProjectContributionWritten`. *(cierra #11)*

**P2 — robustez y escala:**

- Borrar proofs en el éxito de `confirmSubscription`/`confirmContribution` (o GCS lifecycle TTL) + log de acceso a proofs. *(#10)*
- Chunk de `expireSubscriptionsDaily` a lotes ≤500 + alerta; recomputes de denorm incrementales y fan-out de `onSchoolWritten` chunked (Cloud Tasks). *(escala)*
- Acotar el donor-wall: top-N + conteo anónimo desde agregado en el doc de escuela; `fbLimit` en reads por escuela; flag denormalizado `hasActiveProject` en vez de scan de collection-group. *(escala)*
- Subir apphosting `maxInstances` (>2) y `minInstances>=1`; CDN/WAF delante de GETs públicos; donor-wall como client island para que las páginas de detalle sean ISR/edge-cacheables. *(escala — #13)*
- **Eventos de auditoría de acciones de admin** (verify/unverify, delete review, write category) + break-glass / control de 2 personas en verificación antes de GA. *(#12)*
- Función Admin-SDK de erasure/export de cuenta (cascada de reviews/subscriptions/proofs + scrub de denormalizados). *(#10 — Ley 8968 / GDPR)*
- Validar esquema de URL (`http(s)`) en write **y** render de `quoteUrls`/hrefs UGC. *(#15)*
- Codificar restricciones de API keys (Maps/Firebase) como IaC o assertion post-deploy; `npm audit fix` (postcss/protobufjs).

**P3 — pulido / GA:**

- Validar shape de `managedPages` y documentarlo como **no autoritativo**.
- Prompt para acortar display name público (default nombre, no el legal de Google); retry/idempotency en triggers.
- Documentar exports programados de Firestore, runbook de kill-switch de reglas, y procedimiento de revocación de sesión (`revokeRefreshTokens`).

## 6. Plan de escalabilidad (100k–1M usuarios)

El **data layer ya escala por diseño** (SSR con caches TTL `getSchoolsCached`/`getActiveBusinessesCached`
a 300s, queries acotadas `getSchools` max=500 / `getActiveBusinesses` max=200, `React.cache()` dedupe,
ISR `revalidate=300`, agregados denormalizados evitando N+1, funciones convergentes change-gated). Los
**gaps de control** se concentran justo donde la carga importa. Cuatro palancas convierten "funciona en
MVP" en "aguanta bajo ataque a 1M":

1. **App Check en todo (la palanca maestra).** Ata el tráfico a instancias atestiguadas de la app real;
   simultáneamente frena scraping, write-spam de bots, el flood de `trackInteraction` y el abuso de
   subida a Storage. Precondición de que cualquier otro rate-control tenga sentido (el config
   `NEXT_PUBLIC_*` está en el bundle por diseño).
2. **Custom claims para matar la amplificación de reads en reglas.** Mover admin a
   `request.auth.token.admin` es a la vez el fix P0 de seguridad **y** una ganancia de escala:
   `isAdmin()` hoy hace un `get(users/{uid})` facturado en **cada** evaluación de regla admin (y cada
   check de Storage); el claim viaja dentro del ID token ya verificado y elimina ese read, liberando uno
   de los 10 document-access por evaluación. Para los proofs (cadena de 2-3 `get()` por objeto),
   considerar denormalizar los uids autorizados o servir el proof vía función con signed-URL corta.
3. **Caps de instancias + cost guards.** Functions sin `maxInstances` (default Gen2 ~1000) y
   `apphosting.maxInstances:2` NO cubre el deployment de funciones → un flood es denial-of-wallet.
   `setGlobalOptions({maxInstances, concurrency, region, memory})` como freno + budget alert + cuota dura.
   Caps = breakers de circuito, no perillas de performance.
4. **CDN/WAF + ISR delante de GETs públicos.** Subir `maxInstances`(>2)/`minInstances`(≥1); front con
   Cloud CDN/Cloudflare (rate-limit per-IP + bot mitigation + edge cache); partir el fragmento
   personalizado del donor-wall en client island para que `school/[id]` y `business/[slug]` sean
   ISR/edge-cacheables — un share viral de WhatsApp pasa de evento de disponibilidad a cache hit.

Complementos: paginación/fan-out acotado en reads calientes (donor-wall, collection-group de proyectos),
chunking de batches + TTLs de retención que doblan como cost guards, y caps de input en reglas (frenan
strings multi-MB / arrays de 10k que amplifican en cada render SSR y cada fan-out de denorm).

**Secuencia:** App Check + custom claims + function caps + CDN se envían con el batch P0/P1; son los
cuatro que sostienen los controles bajo ataque a escala.

## 7. Próxima fase: evaluación dominio/página

Con este marco fijo, la revisión página-por-página corre el checklist de
[`AUDIT-CHECKLIST.md`](./AUDIT-CHECKLIST.md) sobre cada ruta (`business/[slug]`, `school/[id]`,
`project/[pid]`, `search`, `category/[id]`, `panel/*`, etc.). Cada ítem es una aserción SÍ/NO con
`PASS/FAIL/N/A` + evidencia `file:line`. Regla de scoring: cualquier FAIL en **D2 (AuthZ)** o
**D5 (Privacy)** es ≥ high para esa página; D3/D8 agregan a los gaps sistémicos; D11/D12 son a nivel
de programa (bloquean GA, se trackean una vez).
