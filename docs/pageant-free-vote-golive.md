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
- TTL del token: el default (1 h) está bien.
- En la pestaña **APIs / Products**, dejá Firestore / Storage / Authentication en **Unenforced**
  (ver la regla de oro). No prendas enforcement en ninguno.

> App Check no tiene "enforcement" propio para funciones `onRequest`: la verificación la hace el
> código de `castPageantApplause`. Con el app registrado, sus tokens ya validan.

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

## Apagar / rollback

Apagá `freeVotingEnabled` en cada reinado (paso 7) → desaparece el botón y el eje simpatía deja de
pesar. Para cortarlo globalmente, borrá `NEXT_PUBLIC_APPCHECK_RECAPTCHA_SITE_KEY` (o el secreto) y
re-desplegá App Hosting: App Check vuelve a ser no-op y el aplauso reporta `unavailable`. La capa
económica y la coronación **no** dependen de nada de esto.
