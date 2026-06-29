# Encender el voto libre del reinado (App Check) — runbook

El voto libre de **"simpatía"** (`castPageantApplause` → `candidate.voteFree`) es lo único de
escuelaplace que depende de **App Check**: es un voto **sin cuenta** que pesa (topado y no
vinculante) en la corona, así que necesita un muro anti-bots. Todo el código ya está en `main`
(rebanada 4); este documento es el setup **de una sola vez** que lo enciende en producción.

Mientras este setup no esté hecho, la capa de simpatía queda **dormida por diseño**:
`getAppCheckToken()` ([lib/firebase.ts](../lib/firebase.ts)) devuelve `null` sin el site key, el
llamador reporta `unavailable`, y se recomienda dejar `freeVotingEnabled` apagado por reinado.

> Proyecto: **escuelaplace** · región de funciones: **us-central1** · dominio: **escuelaplace.com**

---

## ⚠️ Regla de oro (no romper el catálogo)

**NO actives el *enforcement* de App Check en Firestore, Storage ni Authentication.**

Las páginas públicas se renderizan en el **servidor** leyendo Firestore con el **SDK de cliente**
(SSR/ISR). App Check vive en el **navegador** (reCAPTCHA): en el servidor **no hay token**. Si
prendés enforcement en Firestore, **toda lectura SSR del catálogo anónimo falla**.

No hace falta: **`castPageantApplause` verifica el token de App Check él mismo**
(`getAppCheck().verifyToken(...)` en [functions/src/index.ts](../functions/src/index.ts)) y rechaza
con 401 si falta o es inválido. Así obtenés el muro anti-bots **solo** para el aplauso, **sin** tocar
el enforcement de ningún servicio. En la consola de App Check dejá los servicios en **"Unenforced"**.

Inicializar App Check en el cliente ([lib/firebase.ts](../lib/firebase.ts)) solo **adjunta** tokens a
las llamadas del navegador; no fuerza nada (el enforcement es por-servicio, del lado servidor) y en
SSR ni se inicializa (`typeof window === "undefined"` → no-op). Es seguro.

---

## Pasos (una sola vez)

### 1. Crear una clave **reCAPTCHA v3**

En <https://www.google.com/recaptcha/admin> → **+** (crear):

- Tipo: **reCAPTCHA v3** (puntaje). *No* "Enterprise" (el cliente usa `ReCaptchaV3Provider`).
- Dominios: `escuelaplace.com`, `www.escuelaplace.com`, y `localhost` (para probar local).
- Guardá la **CLAVE DEL SITIO** (site key, pública) y la **CLAVE SECRETA** (secret, va a la consola).

### 2. Registrar el app web en **App Check**

Firebase console → **App Check** → pestaña **Apps** → elegí el app **Web** → **Register**:

- Proveedor: **reCAPTCHA v3** → pegá la **clave SECRETA** del paso 1.
- **El SITE key del cliente (`NEXT_PUBLIC_APPCHECK_RECAPTCHA_SITE_KEY`) y la SECRET key que pegás acá
  deben ser del MISMO par de reCAPTCHA v3.** Si no coinciden (o registraste Enterprise/v2), el
  intercambio del token falla con **400** y el aplauso reporta "no disponible" (ver Troubleshooting).
- TTL del token: el default (1 h) está bien.

> **El enforcement NO está acá.** Registrar el app (pestaña **Apps**) **no** activa nada. El
> *enforcement* vive en otra zona, la pestaña **APIs** (o "Productos"), **uno por producto** (Cloud
> Firestore, Cloud Storage, Authentication…), y **por defecto cada uno está en "No aplicado"
> (Unenforced)**. O sea: "dejarlos en Unenforced" = **no entres a esa pestaña a darles "Aplicar"**.
> No hay nada que setear; el default ya es el correcto.
>
> Verificación opcional: pestaña **APIs** → Cloud Firestore / Cloud Storage / Authentication deben
> decir **"No aplicado"**. Si alguno dijera "Aplicado", volvelo a "No aplicado" (un Firestore
> *Aplicado* rompe el SSR del catálogo — ver la regla de oro).

> App Check no tiene "enforcement" propio para funciones `onRequest`: la verificación la hace el
> código de `castPageantApplause` (verifica el token él mismo). Con el app registrado, sus tokens ya
> validan — por eso el aplauso queda protegido **sin** tocar el enforcement de ningún producto.

> **Protección contra replay (automática).** El cliente manda un token **de un solo uso**
> (`getLimitedUseToken`) y la función lo verifica con `consume: true`, así un token **vale por un voto**
> y no se puede reutilizar para inflar la simpatía (hallazgo #N3). Esto se activa **solo** con
> registrar el app (paso 2 habilita la *Firebase App Check API*); no hay toggle extra. Si la API no
> estuviera habilitada, `verifyToken` falla y el aplauso responde **401** igual que con un token
> inválido — al verificar (sección *Verificar*) un 401 persistente apunta a esto.

### 3. Crear el secreto del site key

El `apphosting.yaml` ya referencia `NEXT_PUBLIC_APPCHECK_RECAPTCHA_SITE_KEY` como secreto. Creálo
con la **clave del sitio** (no la secreta) del paso 1:

```bash
firebase apphosting:secrets:set NEXT_PUBLIC_APPCHECK_RECAPTCHA_SITE_KEY
# pegá la SITE key cuando lo pida; concedé acceso al backend cuando el CLI pregunte
```

### 4. Confirmar la URL de la función

`apphosting.yaml` ya trae `NEXT_PUBLIC_CAST_APPLAUSE_URL` =
`https://us-central1-escuelaplace.cloudfunctions.net/castPageantApplause`. Verificá que coincide con
el deploy:

```bash
firebase functions:list   # buscá castPageantApplause y su URL/trigger
```

Si la región o el nombre difieren, ajustá el valor en `apphosting.yaml`.

### 5. Re-desplegar App Hosting

Los `NEXT_PUBLIC_*` se **incrustan en el bundle en BUILD**, así que hay que reconstruir. Desde un
checkout limpio de `main` (ver [apphosting-deploy](./DEPLOY.md) — el push a `main` **no** auto-despliega):

```bash
firebase deploy --only apphosting
```

### 6. (Solo dev local) token de depuración

En local no hay dominio reCAPTCHA real. Para probar el aplauso en `localhost`, usá un **debug token**
de App Check: en la consola de App Check → tu app → **Manage debug tokens** → agregá el token que la
app imprime en la consola del navegador la primera vez (con App Check inicializado). No es necesario
para producción.

### 7. Encender el voto libre por reinado

Recién ahora, en cada reinado donde lo quieras: panel → **Herramientas** → el reinado →
**Configuración del reinado** → activá **"voto libre / simpatía"** (`freeVotingEnabled`).

Esto hace dos cosas: muestra la barra de "Simpatía" + el botón **"Aplaudir"** en la ficha pública
([PageantCandidates](../components/tools/PageantCandidates.tsx)), y hace que el eje simpatía **pese**
en las posiciones sugeridas (`effectiveWeights` renormaliza la simpatía a 0 cuando está apagado — ver
[lib/firestore/pageant.ts](../lib/firestore/pageant.ts)). Por eso no lo prendas hasta que los pasos
1–5 estén hechos: un conteo no defendible no debe tocar una corona real.

---

## Verificar

1. Abrí un reinado con `freeVotingEnabled` activo en **escuelaplace.com** (no localhost).
2. Tocá **"Aplaudir"** en una candidata. Esperado: el botón pasa a "¡Gracias! Aplaudiste a …".
   - En la pestaña Red del navegador, `castPageantApplause` responde **204** (o **409** si ese
     dispositivo ya aplaudió). **401** = App Check no resuelve (revisá pasos 1–3 + dominios reCAPTCHA).
     **`unavailable`** en la UI = falta el site key o la URL (revisá pasos 3–5).
3. El conteo `voteFree` sube tras `onApplauseWritten` (la página pública es ISR, `revalidate=300`,
   así que la barra refleja el nuevo conteo en el próximo render, no al instante).

## Troubleshooting

**"El voto libre aún no está disponible"** + en la consola `POST …/exchangeRecaptchaV3Token … 400
(Bad Request)` y `@firebase/app-check: 400 error`.
El cliente sí inicializó y reCAPTCHA sí generó el token, pero **App Check rechazó el intercambio**.
El problema está en el **registro de App Check (consola)**, no en el código ni el deploy. Revisá, en
orden: (1) que el **SECRET** registrado en App Check sea el del **mismo par** que el SITE key del
cliente (abrí la clave con ese site key en el reCAPTCHA admin y copiá *su* secret); (2) que el
proveedor sea **reCAPTCHA v3**, no Enterprise/v2; (3) que `escuelaplace.com` + `www` estén en los
dominios de la clave. Tras corregir, **esperá ~1–2 min** (el SDK throttlea tras los 400:
`appCheck/initial-throttle`) y hacé **hard-reload**. No hace falta re-desplegar.

**"…no disponible"** pero **sin** ninguna llamada a `castPageantApplause` ni a App Check en la pestaña
Red. Falta `NEXT_PUBLIC_APPCHECK_RECAPTCHA_SITE_KEY` o `NEXT_PUBLIC_CAST_APPLAUSE_URL` en el bundle →
revisá el secreto (paso 3) y **re-desplegá App Hosting** (paso 5: los `NEXT_PUBLIC_*` se hornean en
BUILD).

**`castPageantApplause` responde 401** (con App Check ya resolviendo). El token no llegó o no validó:
confirmá que el app web esté **registrado** en App Check y que el token se adjunte (el llamador manda
el header `X-Firebase-AppCheck`).

**CSP report-only:** `Connecting to 'https://www.google.com/recaptcha/…' violates … connect-src …
The policy is report-only`. **No bloquea** (es observación). Aun así se agregó `https://www.google.com`
a `script-src`/`connect-src` en [next.config.ts](../next.config.ts) para que pare el ruido y reCAPTCHA
siga funcionando si algún día la CSP estricta pasa a *enforce*.

## Apagar / rollback

Apagá `freeVotingEnabled` en cada reinado (paso 7) → desaparece el botón y el eje simpatía deja de
pesar. Para cortarlo globalmente, borrá `NEXT_PUBLIC_APPCHECK_RECAPTCHA_SITE_KEY` (o el secreto) y
re-desplegá App Hosting: App Check vuelve a ser no-op y el aplauso reporta `unavailable`. La capa
económica y la coronación **no** dependen de nada de esto.
