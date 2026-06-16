# Per-Page / Per-Domain Security Audit Checklist — escuelaplace

> Plantilla reutilizable para la fase de revisión página-por-página. Spine: **OWASP ASVS L1→L2**.
> Marco y hallazgos de línea base: [`SECURITY-BASELINE.md`](./SECURITY-BASELINE.md).
>
> Correr sobre cada ruta: `business/[slug]`, `school/[id]`, `school/[id]/project/[pid]`, `search`,
> `category/[id]`, `categories`, `panel/*`, `panel/new/*`, `panel/donate`, `panel/fund`,
> `panel/business/[id]/{edit,metrics,subscribe}`, `panel/school/[id]/*`.
>
> Cada ítem es una aserción **SÍ/NO**. Marcar **PASS / FAIL / N/A** + evidencia (`file:line`).
> **Scoring:** cualquier FAIL en **D2 (AuthZ)** o **D5 (Privacy)** = ≥ high para esa página.
> D3/D8 FAILs = medium (agregan a los gaps sistémicos). D9/D11/D12 = nivel programa (trackear una vez, bloquear GA).

---

### D1 · Authentication (ASVS V2/V3)
- [ ] **AuthN-1** · Toda acción privilegiada exige identidad de Firebase Auth, nunca un uid/email del cliente vía query/cookie. → client components + callables (`recordWalkIn` usa `request.auth.uid`).
- [ ] **AuthN-2** · No se introduce superficie de password/recuperación (Google-only). → `lib/auth`, UI de sign-in.
- [ ] **AuthN-3** · El provisioning de primer login no puede setear `role:'admin'`. → `lib/auth/index.ts` `ensureUserDoc`.
- [ ] **AuthN-4** · SSR/server components NO bifurcan sobre un "isOwner" no autenticado. → `app/**/page.tsx`.

### D2 · Authorization (ASVS V4) — LA COLUMNA
- [ ] **AuthZ-1** · Cada colección que la página LEE es pública-intencional o correctamente owner/editor/admin-scoped (sin read demasiado amplio). → `firestore.rules` por colección.
- [ ] **AuthZ-2** · Cada colección que la página ESCRIBE es create/update/delete de mínimo privilegio, default-deny lo demás. → `firestore.rules`.
- [ ] **AuthZ-3** · Campos computados/denormalizados inmutables al cliente (`ranking`, `reviewStats`, `metrics`, `raised`, `contributorsCount`, `countsForRanking`, totales/tier de donante). → helpers `preserves*` + diff de `donorProfiles`.
- [ ] **AuthZ-4** · `verified`/`verificationStatus` admin-only, no auto-elevables. → `grantsVerification`.
- [ ] **AuthZ-4b** · ⚠️ El **downgrade** a `needs_reverification` por cambio de `name`/métodos de pago está forzado **en reglas** (no solo en el helper cliente). → `firestore.rules` schools update + `private/`.
- [ ] **AuthZ-5** · Identidad de soporte/aporte congelada post-create; el supporter no puede auto-confirmar. → `keepsSupporterIdentity`, `changesConfirmation`.
- [ ] **AuthZ-6** · `role`/admin NO es campo auto-escribible (custom claim o congelado en reglas). → `firestore.rules` `users/{uid}`, `isAdmin()`.
- [ ] **AuthZ-6b** · ⚠️ `ownerId` congelado y `editorIds` validado (shape/length) en updates no-admin — un editor no puede reescribir `ownerId` ni acuñar editores arbitrarios. → `firestore.rules` businesses/schools update.
- [ ] **AuthZ-7** · Las rutas de Storage que la página lee/escribe resuelven ownership vía Firestore (NO solo `isSignedIn()`); proofs no públicos. → `storage.rules`.
- [ ] **AuthZ-8** · Las queries de collection-group tienen regla recursive-wildcard explícita. → `firestore.rules` `/{path=**}/projects`.

### D3 · Input Validation & Data Integrity (ASVS V5)
- [ ] **VAL-1** · Cada string escribible por el cliente tiene guard de TIPO + LARGO **en las reglas** (no solo el form). → `firestore.rules` vs `*_MAX` en `types/firestore.ts`.
- [ ] **VAL-2** · Cada array escribible (photos, tags, categories, stages, quoteUrls) tiene guard de max-length en reglas.
- [ ] **VAL-3** · Cada número acotado (`units<=SUBSCRIPTION_UNITS_MAX`, `cost<=PROJECT_STAGE_COST_MAX`, `amount==units*UNIT_CRC`).
- [ ] **VAL-4** · Campos enum (`status`, `currency`, `supporterType`, `type`) restringidos al set permitido.
- [ ] **VAL-5** · `status` forzado en create (business `'draft'`, support `'pending'`); solo escuela/admin lo avanza.
- [ ] **VAL-6** · `keys().hasOnly([...permitidos])` rechaza campos inyectados/desconocidos.
- [ ] **VAL-7** · Inputs de ID/slug validados server-side donde se usan en query/path. → `track.ts` `BUSINESS_ID` regex, `slugify`.

### D4 · Output Encoding / XSS (ASVS V5.3)
- [ ] **XSS-1** · Sin `dangerouslySetInnerHTML` sobre UGC salvo JSON-LD escapado (`.replace(/</g,'<')`). → `app/**/page.tsx`.
- [ ] **XSS-2** · Todo UGC renderiza por auto-escape de React.
- [ ] **XSS-3** · URLs controladas por usuario (`web`/`instagram`/`facebook`/`quoteUrls`/`photos`) validadas a `http(s)` + host esperado; no en sinks `javascript:`/`data:`. → `lib/contact.ts`, `ProjectStageItem`, `next.config.ts` `remotePatterns`.

### D5 · Data Protection & Privacy (ASVS V8)
- [ ] **PRIV-1** · El DTO server→client (`serialize.ts`) NO lleva campo sensible — sin `donorName`, sin data de subdoc privado, sin uids internos más allá de lo necesario. → `lib/firestore/serialize.ts` + props.
- [ ] **PRIV-2** · Métodos de pago solo vía `getVerifiedSchoolPaymentMethods` (nunca el subdoc privado crudo) en cualquier render público. → `app/school/[id]/page.tsx`.
- [ ] **PRIV-3** · `donorName`/`amount` nunca renderizados públicamente AND nunca world-readable en el data layer (reads de `subscriptions`/`projectContributions` scoped). → `firestore.rules` reads.
- [ ] **PRIV-4** · Cualquier PII renderizada públicamente (`boardContact` name/phone/email) es revisada, consentida e idealmente gated tras verificación. → `app/school/[id]/page.tsx`.
- [ ] **PRIV-5** · Archivos proof accedidos on-demand vía reads gated de Storage, nunca embebidos en doc/URL público. → `getSubscriptionProofUrl`, `storage.rules`.

### D6 · Secrets & Config (Firebase checklist / ASVS V14)
- [ ] **CFG-1** · Ningún secreto no-público (sin prefijo `NEXT_PUBLIC_`) leído en un client component.
- [ ] **CFG-2** · Las llamadas de connect a emuladores son inalcanzables salvo `NEXT_PUBLIC_USE_EMULATORS==='true'`. → `lib/firebase.ts`.
- [ ] **CFG-3** · Todo host de imagen externa nuevo se añade deliberadamente a `remotePatterns`; `dangerouslyAllowLocalIP` queda dev-only. → `next.config.ts`.

### D7 · Logging & Monitoring (ASVS V7)
- [ ] **LOG-1** · Acciones relevantes (confirmaciones) anexan a `auditEvents` solo counts/booleans — sin dinero/proof. → `functions/src/index.ts`.
- [ ] **LOG-2** · Los logs de función no registran datos sensibles (contenido de proof, PII completa).
- [ ] **LOG-3** · `auditEvents` queda admin-only read / client-write-forbidden. → `firestore.rules`.
- [ ] **LOG-4** · ⚠️ Las acciones de **admin** (verify/unverify, delete review, write category) quedan auditadas. → `auditEvents`/`adminEvents`.

### D8 · Abuse / Rate-Limiting / Cost (Firebase checklist / ASVS V11)
- [ ] **ABU-1** · Todo endpoint público/unauth de write que la página llama (`trackInteraction`) está protegido por App Check + rate-limited + CORS por origen. → `functions/src/track.ts`.
- [ ] **ABU-2** · El acceso a Firestore/Storage desde la página está enforced por App Check. → `lib/firebase.ts` `initializeAppCheck`.
- [ ] **ABU-3** · Toda query acotada (`limit` + índice); no fan-out ilimitado con input controlado por atacante.
- [ ] **ABU-4** · Operaciones batch chunked bajo el cap de 500-writes. → `expireSubscriptionsDaily`.
- [ ] **ABU-5** · El costo de render SSR por request está acotado (reads cacheados/capped, sin loop N+1 de donantes por render).
- [ ] **ABU-6** · Las funciones tienen cap de `maxInstances`. → `setGlobalOptions`.

### D9 · HTTP Hardening (ASVS V14.4)
- [ ] **HDR-1** · La respuesta lleva CSP (nonce/hash para JSON-LD + orígenes Firebase/Maps permitidos). → `next.config.ts` `headers()`.
- [ ] **HDR-2** · `frame-ancestors` / `X-Frame-Options` seteados.
- [ ] **HDR-3** · `nosniff`, `Referrer-Policy`, HSTS, `Permissions-Policy` presentes.

### D10 · Supply-Chain (ASVS V10)
- [ ] **SUP-1** · Sin dependencia nueva sin pinear/auditar. → `package.json` / `functions/package.json`.
- [ ] **SUP-2** · Sin `strict-ssl=false` / workaround TLS inseguro en config commiteada. → `.npmrc`, env.

### D11 · Assurance / Testing (ASVS V1)
- [ ] **TST-1** · Cada patrón de acceso nuevo tiene test de regla allow-case AND deny-case. → suite `test/rules`.
- [ ] **TST-2** · Helpers puros de seguridad/negocio (gate de ranking, umbrales de tier, gating de pago) con tests unitarios incl. drift guards espejando las copias de `functions/src`.
- [ ] **TST-3** · El cambio pasa por CI (lint + test + suite de reglas + `npm audit`) antes de deploy. → `.github/workflows`.

### D12 · Incident Response (NIST Respond/Recover)
- [ ] **IR-1** · Existe path de admin para suspender/delistar las entidades que la página expone. → `setBusinessStatus`, status de escuela.
- [ ] **IR-2** · Los backups programados de Firestore cubren las colecciones que la página escribe.
- [ ] **IR-3** · Procedimiento de kill-switch / lockdown de reglas documentado. → `docs/`.
