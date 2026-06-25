# Reinado escolar (`ToolType: 'pageant'`) — especificación

> Herramienta nueva de escuela. Nombre de producto: **"Reinado escolar"**. Nombre en
> código: **`pageant`** (todo el código, símbolos y rutas en inglés; solo el copy en
> pantalla va en español).
>
> Estado: **diseñada, no implementada.** Este documento es el blueprint a revisar antes
> de tocar código. Decisiones de producto ya tomadas por el dueño (2026-06-24); ver
> [§2](#2-decisiones-de-producto-tomadas).

## Tabla de contenido

1. [Objetivo y modelo conceptual](#1-objetivo-y-modelo-conceptual)
2. [Decisiones de producto tomadas](#2-decisiones-de-producto-tomadas)
3. [Líneas rojas y cómo se respetan](#3-líneas-rojas-y-cómo-se-respetan)
4. [Modelo de datos](#4-modelo-de-datos)
5. [La fórmula de la corona](#5-la-fórmula-de-la-corona)
6. [Cloud Functions](#6-cloud-functions)
7. [Reglas de seguridad (Firestore + Storage)](#7-reglas-de-seguridad-firestore--storage)
8. [Índices](#8-índices)
9. [Capa de datos (`lib/firestore/pageant.ts`)](#9-capa-de-datos-libfirestorepageantts)
10. [Rutas y componentes](#10-rutas-y-componentes)
11. [Checklist "add-a-kind" + lo genuinamente nuevo](#11-checklist-add-a-kind--lo-genuinamente-nuevo)
12. [App Check (prerrequisito de lanzamiento)](#12-app-check-prerrequisito-de-lanzamiento)
13. [Política y menores](#13-política-y-menores)
14. [Plan de implementación](#14-plan-de-implementación)
15. [Decisiones abiertas restantes](#15-decisiones-abiertas-restantes)
16. [Apéndice: símbolos reutilizados](#16-apéndice-símbolos-reutilizados)

---

## 1. Objetivo y modelo conceptual

Un **reinado escolar** es una actividad cultural con candidatas/os que la comunidad apoya,
para **generar comunidad** (alcance, participación) y **recaudar fondos** para la escuela.
La tensión de diseño: en un reinado tradicional **los votos se venden** (pagar por votar
*es* la recaudación). Eso obligaría a la plataforma a (a) **procesar dinero** —línea roja
absoluta— y (b) volver la corona **pay-to-win**, tóxico tratándose de menores.

**Solución: dos conteos independientes que nunca se suman, y una corona que es veredicto
humano de la escuela —no un número que calcula la plataforma.**

- **Simpatía (`voteFree`)** — capa de comunidad. Aplauso **libre, sin cuenta** (el votante
  anónimo solo deja huella en `localStorage`). Mantenido por una Cloud Function de reglas
  cerradas, al estilo de `trackInteraction`. **No vinculante** por sí solo: como sin
  identidad nunca es 100 % a prueba de bots, su influencia sobre la corona es limitada y
  configurable (ver [§5](#5-la-fórmula-de-la-corona)).
- **Apoyo (`voteSupport`)** — capa de recaudación. Reusa **tal cual** el riel informativo
  de órdenes (`lib/firestore/orders.ts`): el partidario inicia sesión, **le paga directo a
  la escuela** por los métodos que la escuela publica, sube comprobante a Storage, y **solo
  la escuela confirma**. Al confirmar, una CF recalcula el conteo de apoyo de la candidata,
  con el **mismo gate anti-fraude del ranking** (escuela `verified` + sin auto-trato).
- **Corona** — la escuela marca `winnerCandidateId` durante la **coronación en vivo**
  (consola del director, clonada del bingo en tiempo real). La plataforma muestra un
  **ranking sugerido** (fórmula ponderada, no vinculante); el jurado/desempate lo decide la
  escuela. La plataforma **nunca** declara ganadora automáticamente.

`pageant` es una herramienta **HEAVY** (ver la nota LIGHT-vs-HEAVY en
[lib/firestore/tools.ts](../lib/firestore/tools.ts)): tiene estado mutable por candidata/
votante, un flujo de orden, y una fase en vivo. Por eso NO vive en el doc de la herramienta:
obtiene subcolecciones y una colección top-level propias, con reglas y rutas llaveadas por
`{schoolId, toolId}` — exactamente como el bingo.

---

## 2. Decisiones de producto tomadas

| Decisión | Elección | Implicación |
|---|---|---|
| **¿Cómo se decide la corona?** | **MIXTA por fórmula** | `PageantConfig.crownFormula` con pesos `jury`/`support`/`sympathy`; la fórmula ordena un ranking **sugerido**, la escuela **ratifica** con `winnerCandidateId`. |
| **¿Destino de los fondos?** | **Configurable por reinado** | `PageantConfig.fundProjectId` opcional: si está → barra `ProjectProgress` real; si no → apoyo general a la escuela. |
| **¿Alcance de la construcción?** | **Todo de una** (económico + voto libre + coronación en vivo) | Mayor superficie; **App Check pasa a ser prerrequisito de lanzamiento** (ver [§12](#12-app-check-prerrequisito-de-lanzamiento)). |

---

## 3. Líneas rojas y cómo se respetan

1. **La plataforma nunca toca dinero.** El apoyo económico es el riel de órdenes intacto:
   orden forzada a `pending`, el partidario paga a la escuela por sus métodos publicados
   (`getVerifiedSchoolPaymentMethods`), comprobante en Storage, solo `proofUploaded:boolean`
   en el doc público, **solo la escuela confirma**. Cero checkout/escrow/payout. Los padrinos
   reusan `subscriptions`, que ya obedece esto.
2. **Señales computadas solo por CF.** `voteFree`, `voteSupport`, `supportCount`,
   `padrinoCount` son `(fn)`: forzadas a `0` en creación, congeladas en updates del cliente
   por helpers `preserves*()` y omitidas del set de creación. El ledger de aplausos es
   `allow write: if false` (solo Admin SDK).
3. **Los anónimos no se registran.** El aplauso libre va por una CF, con memoria de UX solo
   en `localStorage` (sin colección de votantes, sin Auth para votar). El "Apoyar" económico
   enruta por `/panel/*`, que dispara el login con Google.
4. **Gate de verificación.** Una escuela sin verificar puede **borradorear** un reinado, pero
   el "Apoyar/pagar" está gated por `verificationStatus == 'verified'` (`orderCreateGate`) y
   los métodos de pago quedan ocultos. Editar `name`/métodos de pago de la escuela la baja a
   `needs_reverification`.
5. **Integridad del ganador.** La plataforma nunca auto-corona; la escuela escribe
   `winnerCandidateId`. La fórmula es solo sugerencia. `onSchoolWritten` re-tallya al perder
   verificación, así un apoyo deja de contar retroactivamente.

---

## 4. Modelo de datos

Campos marcados **(fn)** los mantiene una Cloud Function; el cliente no los escribe.

### 4.1 `schools/{schoolId}/tools/{toolId}` con `type: 'pageant'`

El doc de la herramienta guarda solo la **config** (igual que el bingo), bajo el mapa
genérico `config`, leído tipado con `toolConfigOf(tool, 'pageant')`.

```ts
// types/firestore.ts
export interface PageantConfig {
  /** Criterios/valores del reinado (texto libre, mostrado en la página pública). */
  criteria?: string;
  /** Para qué se recaudan los fondos (texto libre). */
  cause?: string;
  /** Ventana de la votación (informativa + gate suave en UI; la CF también la valida). */
  opensAt?: Timestamp;
  closesAt?: Timestamp;
  /** Moneda del apoyo económico (reusa el enum existente). */
  currency: ProjectCurrency;
  /** Precio informativo por unidad de apoyo (NO es un cobro; acota la relación registrada). */
  pricePerSupportUnit: number;
  /** Capa de simpatía habilitada. Default false hasta que App Check esté probado en prod. */
  freeVotingEnabled: boolean;
  /** Pesos de la corona (enteros 0–100, suman 100). Ver §5. */
  crownFormula: PageantCrownFormula;
  /** Proyecto destino opcional: si está, el apoyo alimenta su barra ProjectProgress. */
  fundProjectId?: string;
}

export interface PageantCrownFormula {
  jury: number;      // peso del puntaje del jurado
  support: number;   // peso del apoyo económico confirmado
  sympathy: number;  // peso del aplauso libre
}

// Caps (mirror en firestore.rules):
export const PAGEANT_CANDIDATES_MAX = 40;
export const PAGEANT_CANDIDATE_NAME_MAX = 80;
export const PAGEANT_CANDIDATE_BIO_MAX = 600;
export const PAGEANT_CRITERIA_MAX = 600;
export const PAGEANT_CAUSE_MAX = 300;
export const PAGEANT_SUPPORT_UNITS_MAX = 1000; // anti-typo, espeja SUBSCRIPTION_UNITS_MAX
export const PAGEANT_JURY_SCORE_MAX = 100;
```

`'pageant'` se agrega al union `ToolType` y al array `TOOL_TYPES`, y `PageantConfig` al union
`ToolConfig`.

### 4.2 `schools/{schoolId}/tools/{toolId}/candidates/{candidateId}`

Roster de candidatas/os. Lectura pública; escritura solo escuela/admin (modelado en las
reglas de los `cards` del bingo).

```ts
export interface Candidate {
  name: string;
  bio: string;
  photoUrl?: string;        // subido con uploadToolStageAsset (path de assets del tool)
  order: number;            // orden de presentación
  juryScore: number;        // 0–100, ESCRITO POR LA ESCUELA (input humano, NO es (fn))
  voteFree: number;         // (fn) conteo de aplausos distinguibles
  voteSupport: number;      // (fn) suma de `units` de apoyo confirmado + elegible
  supportCount: number;     // (fn) partidarios confirmados distintos
  padrinoCount: number;     // (fn) padrinos recurrentes confirmados distintos
}
```

> **Nota:** `compositeScore` (el ranking sugerido) **no se almacena** — es un helper puro
> que el cliente calcula al renderizar a partir de `crownFormula` + las cuatro señales
> `(fn)`/`juryScore`. Así se evita un trigger sobre `candidates` cuando la escuela edita
> `juryScore`, y queda transparente. Ver [§5](#5-la-fórmula-de-la-corona).

### 4.3 `schools/{schoolId}/tools/{toolId}/applause/{ballotId}`

Ledger del voto libre. **Solo CF** (`allow read/write: if false`). Es el sustrato de dedup
del conteo `voteFree`; sin PII, sin dinero.

```ts
// ballotId = sha256(toolId + voterKey)   // un voto por dispositivo/pageant
interface PageantApplauseBallot {
  candidateId: string;
  voterKeyHash: string;   // hash del App Check token (+ ipHash grueso)
  ipHash: string;         // hash grueso para el rate-cap
  createdAt: Timestamp;
}
```

### 4.4 `schools/{schoolId}/tools/{toolId}/event/state`

Fase en vivo de la coronación. Lectura pública (`onSnapshot`), escritura escuela/admin.
Clonado de `BingoEventState`.

```ts
export type PageantPhase = 'registration' | 'voting' | 'gala' | 'closed';
export interface PageantEventState {
  phase: PageantPhase;
  revealed: boolean;              // si las posiciones ya se mostraron en la gala
  winnerCandidateId?: string;     // veredicto humano de la escuela
  runnerUpCandidateId?: string;
  startedAt?: Timestamp;
  updatedAt: Timestamp;
}
```

### 4.5 `pageantVotes/{id}` (top-level) + `pageantVotes/{id}/private/data`

La orden de apoyo económico. Reusa el riel `OrderCollection` **sin clonar nada sensible**:

```ts
// lib/firestore/pageant.ts
const PAGEANT_VOTES: OrderCollection = {
  name: 'pageantVotes',
  proofPrefix: 'pageant-vote-proofs',
};
```

```ts
// PÚBLICO (sin dinero) — pins en validPageantVoteCreate:
interface PageantVote {
  schoolId: string;
  schoolName: string;
  toolId: string;
  toolTitle: string;
  candidateId: string;
  candidateName: string;
  buyerId: string;        // == auth.uid (el partidario)
  units: number;          // entero 1..PAGEANT_SUPPORT_UNITS_MAX (conteo, NO cobro)
  currency: ProjectCurrency;
  status: 'pending' | 'confirmed';
  confirmedAt: Timestamp | null;
  confirmedBy?: string;
  proofUploaded?: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
// PRIVADO (pageantVotes/{id}/private/data) — el único lugar con nombre real + monto:
interface PageantVotePrivate { buyerName: string; amount: number; }
```

> **`voteSupport` suma `units` (público), no `amount` (privado).** El conteo de apoyo es un
> número de unidades, no una cifra de dinero. Por eso la CF de recálculo **no necesita leer
> el subdoc privado** — más simple que `recomputeProject`, que sí lee `cost`. El monto real
> nunca se agrega ni se muestra.
>
> **Sin `countsForTally` en la orden.** A diferencia de `subscriptions.countsForRanking`, el
> gate de elegibilidad (verified + sin auto-trato) se aplica **dentro** de la CF de recálculo
> al sumar, no como flag por-orden. Reduce superficie. (Se puede agregar después si la UI
> necesita mostrar "no cuenta" por orden.)

### 4.6 Colecciones reutilizadas (sin cambios de forma)

- **`subscriptions/{id}`** — padrinos: `supporterType: 'user'` + **opcionales** congelados
  `pageantToolId` + `candidateId`. Alimenta `donorProfiles` (tier) y `candidate.padrinoCount`.
  Sin nuevo camino de dinero recurrente.
- **`projectContributions/{id}`** — solo si `config.fundProjectId` está set, para aportes en
  especie (`type: 'in_kind'`) que avanzan el `raised (fn)` de ese proyecto.
- **`donorProfiles/{uid}`** — reconocimiento de padrinos (tier/totales), sin cambios.
- **`auditEvents/{id}`** — extender el union `type` con `'pageant_vote_confirmed'`; la CF
  anexa una fila no sensible por cada confirmación económica (conteo `units` +
  `selfDealt`/`confirmerIsSupporter`/`schoolVerified`, **nunca** monto ni comprobante).

---

## 5. La fórmula de la corona

La elección del dueño es **mixta por fórmula**. Diseño: la fórmula produce un **ranking
sugerido transparente**; **coronar sigue siendo un acto humano** (`winnerCandidateId`).

### 5.1 Helper puro (display-only)

```ts
// lib/firestore/pageant.ts  (helper puro, con *.test.ts al lado)
export interface PageantStanding {
  candidateId: string;
  composite: number;        // 0..100 (mayor = mejor posicionado)
  parts: { jury: number; support: number; sympathy: number }; // aporte ya ponderado
}

export function pageantStandings(
  config: PageantConfig,
  candidates: (Candidate & { id: string })[],
): PageantStanding[] {
  const w = effectiveWeights(config); // ver 5.2 — renormaliza si la simpatía está apagada
  const maxJury = Math.max(1, ...candidates.map((c) => c.juryScore ?? 0));
  const maxSupport = Math.max(1, ...candidates.map((c) => c.voteSupport ?? 0));
  const maxFree = Math.max(1, ...candidates.map((c) => c.voteFree ?? 0));
  return candidates
    .map((c) => {
      const jury = w.jury * ((c.juryScore ?? 0) / maxJury);
      const support = w.support * ((c.voteSupport ?? 0) / maxSupport);
      const sympathy = w.sympathy * ((c.voteFree ?? 0) / maxFree);
      return { candidateId: c.id, composite: jury + support + sympathy, parts: { jury, support, sympathy } };
    })
    .sort((a, b) => b.composite - a.composite);
}
```

- **Normalización: share-of-max** (cada eje relativo al líder de ese eje). Intuitivo para
  "quién va adelante". Alternativa: *share-of-total* (fracción de la suma) — más proporcional;
  es una de las [decisiones abiertas](#15-decisiones-abiertas-restantes).
- Cada peso entra como fracción (`/100`). El `composite` resultante queda en 0..100.
- **Transparente:** se muestra el desglose `parts` por candidata (por qué va donde va).

### 5.2 Pesos efectivos y la salvaguarda de la simpatía

```ts
function effectiveWeights(config: PageantConfig): PageantCrownFormula {
  const f = config.crownFormula;
  // Si el voto libre está apagado (p.ej. App Check aún no probado), su peso NO debe
  // distorsionar: se descarta el eje y se renormalizan jury+support a sumar 100.
  if (!config.freeVotingEnabled) {
    const rest = f.jury + f.support || 1;
    return { jury: (f.jury / rest) * 100, support: (f.support / rest) * 100, sympathy: 0 };
  }
  return f;
}
```

**Recomendaciones por defecto:** `jury 50 / support 30 / sympathy 20`, con la simpatía
**topada a ≤ 20** (no es a prueba de bots). Hasta que App Check esté activo y probado en
prod, ship con `freeVotingEnabled: false` → la fórmula ignora el eje simpatía. Así un número
no defendible **nunca** decide una corona real.

### 5.3 Coronar = veredicto humano

`pageantStandings()` solo **ordena la sugerencia**. En la gala, la escuela escribe
`winnerCandidateId` (y opcional `runnerUpCandidateId`) en `event/state`. La plataforma nunca
auto-corona — preserva la línea roja y la autoridad de jurado/desempate de la escuela.

---

## 6. Cloud Functions

Paquete `functions/` (Gen 2, Admin SDK). Patrón: **recompute-from-scratch + idempotente**.
Helpers existentes reutilizados: `principalsOf`, `intersects`, `confirmationSignals`,
`appendAuditOnce`, `auditIdOf` (ver [functions/src/index.ts](../functions/src/index.ts)).
La lógica pura del reinado (pesos/fórmula, si llega a necesitarse en runtime) va en
`functions/src/pageant.ts`, espejo sin dependencias de `lib/firestore/pageant.ts`, con un
`*.test.ts` que protege el drift (como ranking/donors).

1. **`castPageantApplause`** — `onRequest` (`cors: true` + **App Check**), clon de
   `trackInteraction` en `functions/src/track.ts`. Valida `{schoolId, toolId, candidateId}`
   existentes + pageant activo (`event/state.phase == 'voting'`) + escuela `verified`; deriva
   `voterKey` (App Check token + `ipHash` grueso); aplica un **rate-cap por ip/token**;
   `.create()` del ballot idempotente `applause/{sha256(toolId+voterKey)}` (tragando el gRPC
   `6 ALREADY_EXISTS` → re-tap = no-op). Único camino para un visitante sin cuenta.

2. **`onApplauseWritten`** — `onDocumentWritten('schools/{schoolId}/tools/{toolId}/applause/{ballotId}')`.
   Une `candidateId` de before/after y recalcula `candidate.voteFree = COUNT(applause where
   candidateId == X)` (aggregation query → idempotente bajo redelivery at-least-once).

3. **`onPageantVoteWritten`** — `onDocumentWritten('pageantVotes/{id}')`, clon de
   `onProjectContributionWritten`. Une `candidateId` de before/after; recalcula
   `candidate.voteSupport = Σ units` y `supportCount = partidarios confirmados distintos`
   sobre órdenes **`confirmed` + elegibles**, aplicando el gate `verified` + skip de
   auto-trato (`buyerId ∈ principalsOf(school)`). En una confirmación real
   (`confirmedAt` recién seteado), anexa una fila `'pageant_vote_confirmed'` a `auditEvents`
   vía `appendAuditOnce(auditIdOf(event.id))` + `confirmationSignals(...)`.

4. **Extender `onSubscriptionWritten`** — cuando una `subscription` confirmada lleva
   `pageantToolId` + `candidateId`, recalcular además `candidate.padrinoCount` (padrinos
   confirmados distintos). El recálculo existente de `donorProfile`/escuela no cambia.

5. **Extender `onSchoolWritten`** — su fan-out actual por cambio de verificación/principals
   debe **también** re-tallyar las candidatas del reinado de esa escuela (la re-verificación
   voltea la elegibilidad del apoyo **sin** una escritura de orden), espejando el fan-out del
   business-ranking.

> **Sin job programado nuevo.** Las fases del reinado las maneja la escuela en `event/state`;
> nada decae por tiempo automáticamente (evita acoplar "la plataforma decide el resultado").
>
> **Costo del `voteFree` por COUNT.** Cada aplauso dispara una aggregation COUNT por
> candidata. Para un reinado muy popular esto es un hot-path aceptable pero observable;
> optimización futura (contador distribuido) queda diferida y anotada aquí, no en el MVP.

---

## 7. Reglas de seguridad (Firestore + Storage)

Helpers existentes reutilizados (ver [firestore.rules](../firestore.rules)): `isAdmin`,
`isOwnerOrEditor`, `schoolData`, `changedKeys`, `orderCreateGate`, `confirmsOrderFromPending`,
`orderUpdateActor`, `validOrderUpdateFields`, `orderPrivateCan{Read,Create,Update,Delete}`.

### 7.1 Enum del tipo en `tools`

Agregar `'pageant'` al enum `type` **en los dos lugares** (`validToolCreate` **y**
`validToolUpdate` — están listados dos veces porque las reglas no importan TS), en sync con
`ToolType` + `TOOL_TYPES` + el META del registry. La config es genérica (`config is map`), así
que no requiere más cambios para la parte de config.

### 7.2 `candidates` (modelado en los `cards` del bingo)

```
match /schools/{schoolId}/tools/{toolId}/candidates/{candidateId} {
  allow read: if true;
  allow create: if isAdmin() ||
    (isOwnerOrEditor(schoolData(schoolId)) &&
     request.resource.data.voteFree == 0 &&
     request.resource.data.voteSupport == 0 &&
     request.resource.data.supportCount == 0 &&
     request.resource.data.padrinoCount == 0 &&
     request.resource.data.name.size() <= 80 &&
     request.resource.data.bio.size() <= 600 &&
     request.resource.data.juryScore >= 0 &&
     request.resource.data.juryScore <= 100);
  allow update: if isAdmin() ||
    (isOwnerOrEditor(schoolData(schoolId)) && preservesPageantTallies());
  allow delete: if isAdmin() || isOwnerOrEditor(schoolData(schoolId));
}

// Las cuatro señales (fn) quedan congeladas para el cliente; juryScore SÍ es editable.
function preservesPageantTallies() {
  return !request.resource.data.diff(resource.data).affectedKeys()
    .hasAny(['voteFree', 'voteSupport', 'supportCount', 'padrinoCount']);
}
```

### 7.3 `applause` (solo CF)

```
match /schools/{schoolId}/tools/{toolId}/applause/{ballotId} {
  allow read: if false;   // el público lee candidate.voteFree, no el ledger
  allow write: if false;  // escrito por castPageantApplause con Admin SDK
}
```

### 7.4 `event/state` (reusa la forma de la regla del evento del bingo)

```
match /schools/{schoolId}/tools/{toolId}/event/{doc} {
  allow read: if true;
  allow write: if isAdmin() || isOwnerOrEditor(schoolData(schoolId));
}
```

### 7.5 `pageantVotes` (clon del bloque `raffleOrders`)

```
match /pageantVotes/{id} {
  allow read: if true;
  allow create: if isAdmin() || (orderCreateGate() && validPageantVoteCreate());
  allow update: if isAdmin() || (
    keepsPageantVoteIdentity() && validOrderUpdateFields() &&
    confirmsOrderFromPending() && orderUpdateActor(changesOrderConfirmation())
  );
  allow delete: if isAdmin() ||
    (isSignedIn() && resource.data.buyerId == request.auth.uid);

  match /private/{doc} {
    allow read:   if orderPrivateCanRead(pageantVoteData(id));
    allow create: if orderPrivateCanCreate(pageantVoteData(id));
    allow update: if orderPrivateCanUpdate(pageantVoteData(id));
    allow delete: if orderPrivateCanDelete(pageantVoteData(id));
  }
}

function keepsPageantVoteIdentity() {
  return !request.resource.data.diff(resource.data).affectedKeys().hasAny(
    ['schoolId', 'toolId', 'candidateId', 'buyerId', 'units', 'currency']);
}
// Pin del set público; OMITE buyerName/amount (viven en private/data).
function validPageantVoteCreate() {
  return request.resource.data.keys().hasOnly([
      'schoolId', 'schoolName', 'toolId', 'toolTitle', 'candidateId', 'candidateName',
      'buyerId', 'units', 'currency', 'status', 'confirmedAt', 'createdAt', 'updatedAt']) &&
    request.resource.data.currency in ['CRC', 'USD', 'NIO', 'MXN', 'EUR'] &&
    request.resource.data.toolTitle is string &&
    request.resource.data.toolTitle.size() <= 120 &&
    request.resource.data.units is int &&
    request.resource.data.units >= 1 &&
    request.resource.data.units <= 1000;
}
// pageantVoteData(id): get(/databases/.../pageantVotes/$(id)).data  (espeja raffleOrderData)
```

### 7.6 `subscriptions` (padrinos)

Permitir `pageantToolId` + `candidateId` **opcionales solo en create**, congelados en update
extendiendo `keepsSupporterIdentity()`.

### 7.7 `auditEvents`

**Sin cambio de reglas** (`allow write: if false`, lectura solo admin). Solo se extiende el
union `type` en TS.

### 7.8 `storage.rules`

```
match /pageant-vote-proofs/{voteId}/{allPaths=**} {
  // reusa canReadOrderProof / canWriteOrderProof / canDeleteOrderProof,
  // pasando el único order() get propio (la orden pageantVotes/{voteId}).
}
```

Las **fotos de candidata** viajan por el bloque de assets de tool ya existente
`schools/{schoolId}/tools/{toolId}/**` (image/video, gated por dueño de escuela) — sin lógica
nueva.

---

## 8. Índices

`getOrdersByTool` (`where toolId ==`) y `getOrdersBySchool` (`where schoolId ==`) son
igualdades de **un solo campo** → auto-indexadas, igual que `raffleOrders` (que no tiene
índice compuesto). La CF de recálculo trae todas las órdenes de un `toolId` y agrupa por
`candidateId` en memoria (como `recomputeProject`). **No se espera índice compuesto nuevo**;
verificar al implementar si se agrega algún `orderBy`.

---

## 9. Capa de datos (`lib/firestore/pageant.ts`)

Punto de entrada único vía el barrel `@/lib/firestore`. Un archivo de dominio con **reads +
writes**, re-exportado desde [lib/firestore/index.ts](../lib/firestore/index.ts).

**Reads:**
- `getCandidates(schoolId, toolId)` — roster ordenado (`order` asc), con React `cache()`.
- `subscribePageantEventState(schoolId, toolId, cb)` — `onSnapshot` del `event/state`
  (clonado de `subscribeBingoEventState`).
- `getOrdersByTool(PAGEANT_VOTES, toolId)` / `getOrdersBySchool(PAGEANT_VOTES, schoolId)` —
  reusados del riel.

**Writes:**
- Candidatas: `createCandidate` / `updateCandidate` / `setCandidateJuryScore` / `deleteCandidate`.
- Reinado config: vía `createTool`/`updateTool` con `PageantConfigInput` + `buildPageantConfig`
  (nuevo `case` en `buildToolConfig`).
- Apoyo económico: wrappers delgados sobre `createOrder`/`uploadOrderProof`/`confirmOrder`
  con `PAGEANT_VOTES`.
- Coronación: `startPageantPhase` / `setPageantWinner` / `closePageant` (clonados de
  `bingo-event.ts`, escritura escuela/admin).

**Helpers puros:** `pageantStandings`, `effectiveWeights` (con `pageant.test.ts`).

**Revalidación:** agregar `revalidatePageant(schoolId, toolId)` a
[lib/revalidate.ts](../lib/revalidate.ts) (clon de `revalidateProject`, con `.catch(() => {})`),
llamado tras escrituras de roster/config/fase para publicación inmediata sobre el ISR.

---

## 10. Rutas y componentes

### 10.1 Público (SSR + ISR `revalidate = 300`)
- **Detalle:** `app/school/[id]/tool/[toolId]/page.tsx` ya existe con `TOOL_DETAIL_RENDERERS`.
  Registrar un renderer async **`ReinadoDetail`** que envuelve su cuerpo en `<ToolDetailShell>`
  (cover, título, JSON-LD). Muestra fichas de candidata, las **dos barras de conteo**
  (simpatía vs apoyo, sin cifras de dinero), un **island de leaderboard en vivo**
  (`subscribePageantEventState` + standings), botón **"Aplaudir"** (libre) y CTA **"Apoyar"**;
  más `ProjectProgress` si `fundProjectId` está set.
- **Feed:** aparece como card de publicación en la sección "Principal" de la página de la
  escuela, junto a `ProjectCard`/`ToolCard` (vía el registry).
- **OG image:** `app/school/[id]/tool/[toolId]/opengraph-image.tsx` gana una entrada
  `KIND_EMOJI` para `'pageant'` (👑).

### 10.2 Panel (privado, requiere Auth)
- **Hub de tools** `app/(panel)/panel/school/[id]/tools/{,manage/[type],new,[toolId]}/page.tsx`
  ya itera el registry — el META row hace aparecer "Reinado" con su conteo. Los forms
  `new`/`[toolId]` ganan estado/JSX de `PageantConfig` + un **editor de roster de candidatas**
  (clon del patrón `StagesEditor`).
- **Flujo de apoyo (comprador):** nueva ruta `app/(panel)/panel/pageant-support/page.tsx`
  llaveada por `{schoolId, toolId, candidateId}` (clon de `panel/fund`): elige `units`, ve los
  métodos de pago publicados (`getVerifiedSchoolPaymentMethods`), `createOrder` →
  `uploadOrderProof`.
- **Consola de coronación (director):** nueva ruta
  `app/(panel)/panel/school/[id]/pageant-live/page.tsx` (clon de la `bingo-live`): fases,
  reveal de posiciones, set de `winnerCandidateId`.
- **Confirmaciones:** se pliegan al inbox de órdenes del board existente
  (`getOrdersBySchool`), donde ya se confirman rifa/venta/bingo — **sin** página de cola nueva.

### 10.3 Componentes nuevos (`components/pageant/`)
`ReinadoDetail`, `PageantLeaderboard` (solo conteos; reusa `ProjectProgress`/`StatChip`/`Badge`),
`PageantCandidateCard`, `PageantApplauseButton` (anónimo; llama `castPageantApplause` +
`localStorage`), `PageantSupportCTA`, `PageantLivePublic` (island `onSnapshot`),
`PageantManageBar` (clon de `ToolManageBar`, null para visitantes),
`PatronTierBadge` (clon de `DonorTierBadge`).

---

## 11. Checklist "add-a-kind" + lo genuinamente nuevo

El registry **no es un seam de plugins**: agregar un kind se cablea a mano por estos archivos
(de la nota en [lib/tools/registry.ts](../lib/tools/registry.ts)). Para `pageant` (HEAVY) hay
además un subsistema encima.

**Los 7 toques del kind:**
1. `types/firestore.ts` — `'pageant'` en `ToolType` + `TOOL_TYPES`; `PageantConfig` en el
   union `ToolConfig`; tipos `Candidate`/`PageantVote`/`PageantEventState` + caps `PAGEANT_*`.
2. `lib/firestore/tools.ts` — `PageantConfigInput` + `buildPageantConfig` + `case 'pageant'`
   en `buildToolConfig`; slot en `CreateToolInput` **y** `ToolPatch`; el kind en
   `ToolConfigByType` (de `toolConfigOf`); rama en `toolContactPhone` si lleva contacto.
3. `lib/tools/registry.ts` — el META row (label "Reinado", plural "Reinados", hint, icono 👑,
   `inactiveNotice`); `toolBuyLabel`/`toolBuyHref` → "Apoyar a una candidata".
4. `firestore.rules` — `'pageant'` en el enum `type` (×2: create + update).
5. `app/school/[id]/tool/[toolId]/page.tsx` — `ReinadoDetail` en `TOOL_DETAIL_RENDERERS`.
6. `app/(panel)/panel/school/[id]/tools/{new,[toolId]}/page.tsx` — estado/validación/JSX por
   kind en create **y** edit (incluye el editor de roster).
7. `app/school/[id]/tool/[toolId]/opengraph-image.tsx` — entrada `KIND_EMOJI`.

**Subsistema HEAVY genuinamente nuevo:** subcolecciones `candidates` + `applause` + `event`;
colección top-level `pageantVotes` + subdoc privado; las CFs `castPageantApplause` /
`onApplauseWritten` / `onPageantVoteWritten` (+ extensiones a `onSubscriptionWritten` y
`onSchoolWritten`); los bloques de `firestore.rules` (candidates/applause/pageantVotes) + el
bloque de `storage.rules` (`pageant-vote-proofs`); `lib/firestore/pageant.ts` (+ test) y
`functions/src/pageant.ts` (espejo + test); las rutas `pageant-support` y `pageant-live`; los
componentes `components/pageant/*`; `revalidatePageant`.

---

## 12. App Check (prerrequisito de lanzamiento)

Al elegir "todo de una" **y** que la simpatía pese en la corona, el voto libre deja de ser
cosmético. **App Check debe estar activo y probado en producción antes del lanzamiento del
voto libre** (reCAPTCHA v3/Enterprise para web). El ledger de aplausos es `if false` (solo la
CF escribe) y la CF exige App Check, así que sin App Check no hay forma confiable de frenar
votación masiva con scripts.

Arranque seguro mientras App Check no esté probado: `freeVotingEnabled: false` por reinado →
`effectiveWeights` pone `sympathy: 0` y renormaliza, de modo que **un número no defendible
nunca toca una corona real**. La capa económica y la coronación **no** dependen de App Check y
pueden ir completas desde el día 1.

---

## 13. Política y menores

El reinado involucra **menores** y competencia emotiva. Más allá del código:
- Campo obligatorio **"reglas del reinado"** redactado por la escuela (texto libre).
- Encuadre visible **"este reinado lo administra la escuela"** en la página pública.
- La plataforma es **el escenario, nunca el jurado**: nunca auto-corona, nunca muestra cifras
  de dinero, nunca expone comprobantes.

---

## 14. Plan de implementación

Decisión del dueño: **todo de una**. Se organiza en rebanadas verticales que se mergean
juntas (o como PRs apilados en orden), no como fases diferidas:

1. **Tipos + wiring del kind** — `types/firestore.ts`, `tools.ts` (`buildPageantConfig`),
   `registry.ts`, enum en `firestore.rules`. Base de todo, bajo riesgo. Sin colecciones aún.
2. **Roster + config del reinado** — subcolección `candidates` + reglas; editor de roster y
   form de `PageantConfig` en el panel; `ReinadoDetail` público con fichas (sin tallies aún).
3. **Capa económica** — `pageantVotes` (riel `OrderCollection`) + reglas + `storage.rules`;
   `onPageantVoteWritten` + gate verified/auto-trato + fila de auditoría; ruta
   `pageant-support`; confirmación en el inbox del board; barra de conteo de apoyo; opción
   `fundProjectId` con `ProjectProgress`.
4. **Capa de simpatía** — `castPageantApplause` + ledger `applause` + `onApplauseWritten` +
   `PageantApplauseButton` + memoria `localStorage`. **Gated por App Check**; `freeVotingEnabled`
   default OFF hasta probarlo.
5. **Coronación en vivo** — `event/state` + `subscribePageantEventState` island +
   `pageant-live` (clon de bingo-live) + `winnerCandidateId` + banner hall-of-fame
   "Reina/Rey {año}".
6. **Padrinos + reconocimiento** — `pageantToolId`/`candidateId` en `subscriptions` +
   `padrinoCount` en `onSubscriptionWritten` + `PatronTierBadge` + muro de donantes.

**Prerrequisito transversal:** habilitar y verificar **App Check** en prod (bloquea que la
rebanada 4 sea confiable).

---

## 15. Decisiones abiertas restantes

1. **Normalización de la fórmula:** *share-of-max* (recomendado, intuitivo para ranking) vs
   *share-of-total* (más proporcional). Afecta cómo se siente el tablero.
2. **Pesos por defecto + tope de simpatía:** propuesto `jury 50 / support 30 / sympathy 20`,
   simpatía ≤ 20. ¿Se fija un máximo duro para `sympathy` en la UI?
3. **Precio unitario del apoyo:** ¿reusar `SUBSCRIPTION_UNIT_CRC` (₡5000) o un
   `pricePerSupportUnit` propio por reinado? (Solo acota la relación registrada, no es cobro.)
4. **Visibilidad de partidarios:** ¿aparecen por nombre en algún lado público (muro de
   donantes opt-in) o todo el apoyo se muestra solo como conteos? Default: el modelo opt-in
   `isPublic` existente.
5. **`fundProjectId` y "candidatura sin proyecto":** cuando no hay proyecto, el apoyo es
   "general a la escuela" sin barra de meta. Confirmar que está bien no tener barra en ese caso.

---

## 16. Apéndice: símbolos reutilizados

| Símbolo | Archivo | Para qué en `pageant` |
|---|---|---|
| `OrderCollection`, `createOrder`, `uploadOrderProof`, `confirmOrder`, `getOrdersBy{Tool,School}`, `mergeOrderPrivateFields` | `lib/firestore/orders.ts` | El riel económico de `pageantVotes`, **sin clonar nada sensible**. |
| `orderCreateGate`, `validOrderUpdateFields`, `orderUpdateActor`, `confirmsOrderFromPending`, `orderPrivateCan*` | `firestore.rules` | Reglas de `pageantVotes` (espejo de `raffleOrders`). |
| `createTool`, `updateTool`, `setToolStatus`, `newToolId`, `toolConfigOf`, `buildToolConfig`, `uploadToolStageAsset` | `lib/firestore/tools.ts` | Config + media del reinado y sus candidatas. |
| `subscribeBingoEventState`, `startBingoEvent`, `confirmBingoWinner` (patrón) | `lib/firestore/bingo-event.ts` | `event/state` + coronación en vivo. |
| `principalsOf`, `intersects`, `confirmationSignals`, `appendAuditOnce`, `auditIdOf`, `recomputeProject` (patrón) | `functions/src/index.ts` | Gate anti-fraude + auditoría + recálculo de tallies. |
| `createDonation`, `getSchoolDonorWall`, `donorTierForUnits`, `donorProfiles` | `lib/firestore/donors.ts` | Padrinos + reconocimiento por tier. |
| `getVerifiedSchoolPaymentMethods` | `lib/firestore/schools.ts` | Panel "cómo pagar tu apoyo". |
| `ToolDetailShell`, `TOOL_DETAIL_RENDERERS`, `toolTypeMeta`, `ProjectProgress`, `DonorTierBadge` | varios | Chrome público + UI de barras/badges. |
| `revalidateProject` (patrón) | `lib/revalidate.ts` | `revalidatePageant` para publicación inmediata. |
| `SUBSCRIPTION_UNITS_MAX`, `ProjectCurrency` | `types/firestore.ts` | Caps + enum de moneda. |
```
