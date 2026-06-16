# Admin role: model, migration & bootstrap

> Implementa el fix P0 de escalada de privilegios (RULES-1 en
> [SECURITY-BASELINE.md](./SECURITY-BASELINE.md)). Lee esto antes de la primera deploy de las
> reglas nuevas.

## Modelo

La autoridad de admin se ancla en un **custom claim inforjable** de Firebase Auth:
`request.auth.token.admin == true`. Solo el **Admin SDK** puede setearlo (las callables de
abajo o el script de bootstrap). El campo `users/{uid}.role` pasa a ser un **espejo no
autoritativo** para la UI de admin.

`isAdmin()` (en `firestore.rules` y `storage.rules`) durante la transición acepta **el claim
O el campo**:

```
isAdmin() = signedIn && (request.auth.token.admin == true || users/{uid}.role == 'admin')
```

- El claim se evalúa primero y **corta el circuito**, así un admin con claim no paga el `get()`
  del doc `users` (ganancia de escala, además de seguridad).
- El fallback al campo evita **lockout** de admins provisionados antes de la migración.
- El campo `role` ya **no es auto-escribible**: las reglas de `users/{uid}` congelan `role` para
  no-admins (create forzado a `'user'`, update no-admin exige `role` sin cambios). Por eso leer
  el campo en `isAdmin()` ya es seguro.

Cuando **todos** los admins tengan el claim, eliminá el fallback al campo en ambas reglas (y el
`get()` que cuesta) — queda solo `request.auth.token.admin == true`.

## Bootstrap del primer admin

No hay admin todavía que pueda llamar a `grantAdminRole`, así que el primero se crea fuera de
banda con el Admin SDK:

```bash
cd functions
# Credenciales: una de las dos
gcloud auth application-default login          # cuenta con acceso al proyecto
# o: export GOOGLE_APPLICATION_CREDENTIALS=/ruta/a/service-account.json

node scripts/set-admin.mjs tu-correo@gmail.com   # por email
# o por uid:
node scripts/set-admin.mjs <uid>
```

El usuario debe **cerrar sesión y volver a entrar** (o refrescar su ID token) para que el claim
tome efecto — el script revoca sus refresh tokens para forzarlo.

> Alternativa sin script: en la consola de Firebase/GCP no se pueden setear custom claims a mano;
> usá el script, `firebase functions:shell`, o un Cloud Function temporal. El script es lo más simple.

## Gestión de admins (después del primero)

Callables en [functions/src/admin.ts](../../functions/src/admin.ts), solo invocables por un admin
(con claim). Setean el claim, espejan `role`, revocan refresh tokens y registran la acción en
`adminEvents` (trail admin-only):

- `grantAdminRole({ uid })` — otorga admin.
- `revokeAdminRole({ uid })` — revoca admin (rechaza auto-revocarse).

Desde el cliente (componente de admin autenticado):

```ts
import { httpsCallable } from "firebase/functions";
import { getFirebaseFunctions } from "@/lib/firebase";

await httpsCallable(getFirebaseFunctions(), "grantAdminRole")({ uid });
```

(La UI de gestión de admins aún no está cableada — pendiente; por ahora usá el script o la
callable directo.)

## Orden de despliegue (importante para no perder acceso)

1. **Deploy de las Cloud Functions** (`grantAdminRole`/`revokeAdminRole`) — aditivo, sin riesgo.
2. **Bootstrap**: corré `set-admin.mjs` para darte el claim a vos (y a cualquier admin actual).
   Verificá: el usuario, tras re-loguear, tiene `request.auth.token.admin == true`.
3. **Deploy de las reglas** (`firestore.rules` + `storage.rules`). Aunque el claim no estuviera
   seteado, el fallback al campo `role` evita lockout — pero hacé el bootstrap igual para no
   depender del fallback.
4. Más adelante, cuando todos los admins tengan claim: quitá el fallback `|| ...role == 'admin'`
   de `isAdmin()` en ambos archivos.
