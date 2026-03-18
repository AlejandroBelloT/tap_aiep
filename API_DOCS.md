# Documentación de la API

Base URL: `/api`

> Todas las rutas son **server-side only** y utilizan la `SUPABASE_SERVICE_ROLE_KEY`.  
> Nunca se exponen al cliente.

---

## Índice

- [POST /api/setup](#post-apisetup)
- [POST /api/usuarios](#post-apiusuarios)
- [DELETE /api/usuarios/:id](#delete-apiusuariosid)

---

## POST /api/setup

Crea el **primer administrador** del sistema. Solo funciona mientras no exista ningún usuario con rol `administrador` activo en la base de datos.

### Request

**Body** `application/json`

| Campo      | Tipo   | Requerido | Descripción                          |
| ---------- | ------ | :-------: | ------------------------------------ |
| `nombre`   | string |     ✓     | Nombre completo del administrador    |
| `rut`      | string |     ✓     | RUT del administrador                |
| `email`    | string |     ✓     | Correo electrónico                   |
| `servicio` | string |     ✓     | Servicio o unidad a la que pertenece |
| `password` | string |     ✓     | Contraseña (mínimo 8 caracteres)     |

```json
{
  "nombre": "Juan Pérez",
  "rut": "12345678-9",
  "email": "admin@hospital.cl",
  "servicio": "Administración",
  "password": "contraseña_segura"
}
```

### Respuestas

| Código | Descripción                                                          |
| ------ | -------------------------------------------------------------------- |
| `201`  | Administrador creado exitosamente                                    |
| `400`  | Falta un campo requerido o la contraseña tiene menos de 8 caracteres |
| `409`  | Ya existe un administrador activo; ruta bloqueada                    |
| `500`  | Error al crear el usuario en Supabase Auth o en el perfil            |

**Éxito `201`**

```json
{ "ok": true, "id": "<uuid>" }
```

**Error `409`**

```json
{ "error": "Ya existe un administrador. Esta ruta no está disponible." }
```

### Notas

- El usuario se crea con `email_confirm: true`, por lo que **no requiere verificación de correo**.
- El rol se asigna automáticamente como `administrador`.
- Se hace upsert del perfil en `public.usuarios` además de crear la cuenta en Supabase Auth.

---

## POST /api/usuarios

Crea un nuevo usuario con el rol y servicio indicados. Solo debe ser llamado por un administrador autenticado.

### Request

**Body** `application/json`

| Campo      | Tipo   | Requerido | Descripción                                                                           |
| ---------- | ------ | :-------: | ------------------------------------------------------------------------------------- |
| `nombre`   | string |     ✓     | Nombre completo del usuario                                                           |
| `rut`      | string |     ✓     | RUT del usuario                                                                       |
| `email`    | string |     ✓     | Correo electrónico                                                                    |
| `rol`      | string |     ✓     | Rol del usuario (`administrador`, `jefatura`, `prevencionista`, `tens`, `trabajador`) |
| `servicio` | string |           | Servicio o unidad del usuario                                                         |
| `password` | string |     ✓     | Contraseña (mínimo 6 caracteres)                                                      |

```json
{
  "nombre": "María González",
  "rut": "98765432-1",
  "email": "mgonzalez@hospital.cl",
  "rol": "tens",
  "servicio": "Urgencias",
  "password": "clave123"
}
```

### Respuestas

| Código | Descripción                                                                   |
| ------ | ----------------------------------------------------------------------------- |
| `201`  | Usuario creado exitosamente                                                   |
| `400`  | Falta un campo requerido o la contraseña tiene menos de 6 caracteres          |
| `207`  | Usuario creado en Auth pero ocurrió un error al guardar el perfil en la tabla |
| `500`  | Error al crear el usuario en Supabase Auth                                    |

**Éxito `201`**

```json
{ "ok": true, "id": "<uuid>" }
```

**Error parcial `207`**

```json
{ "error": "Usuario creado en Auth pero error en perfil: <mensaje>" }
```

### Notas

- El usuario se crea con `email_confirm: true` (sin verificación de correo).
- Los metadatos `nombre`, `rut`, `rol` y `servicio` se almacenan en `user_metadata` de Supabase Auth.
- Se hace upsert del perfil en `public.usuarios` con `activo: true`.

---

## DELETE /api/usuarios/:id

Elimina un usuario de forma completa: primero borra el perfil de `public.usuarios` y luego elimina la cuenta de Supabase Auth.

### Parámetros de ruta

| Parámetro | Tipo   | Descripción                 |
| --------- | ------ | --------------------------- |
| `id`      | string | UUID del usuario a eliminar |

**Ejemplo:**

```
DELETE /api/usuarios/a1b2c3d4-e5f6-7890-abcd-ef1234567890
```

### Respuestas

| Código | Descripción                                   |
| ------ | --------------------------------------------- |
| `200`  | Usuario eliminado exitosamente                |
| `400`  | No se proporcionó el ID                       |
| `500`  | Error al eliminar el usuario en Supabase Auth |

**Éxito `200`**

```json
{ "ok": true }
```

### Notas

- Se elimina primero el registro en `public.usuarios` y luego en Supabase Auth (por si no existe CASCADE en la FK).
- Si la FK tiene `ON DELETE CASCADE`, la eliminación del registro en `public.usuarios` puede ser redundante pero no causa errores.

---

## Variables de entorno requeridas

| Variable                    | Descripción                                               |
| --------------------------- | --------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`  | URL del proyecto Supabase                                 |
| `SUPABASE_SERVICE_ROLE_KEY` | Clave de servicio con permisos de administrador (privada) |

> ⚠️ `SUPABASE_SERVICE_ROLE_KEY` **nunca debe exponerse al cliente**. Solo se usa en rutas de servidor (`route.js`).
