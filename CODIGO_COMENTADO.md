# Partes importantes del código — Sistema de Gestión de Insumos

> Este documento recorre las piezas centrales del proyecto con comentarios explicativos.
> Está organizado en capas: base de datos → configuración → lógica de negocio → UI → API.

---

## Índice

1. [Base de datos — schema.sql](#1-base-de-datos--schemasql)
2. [Cliente Supabase — lib/supabase.js](#2-cliente-supabase--libsupabasejs)
3. [Sistema de roles — lib/roles.js](#3-sistema-de-roles--librolejs)
4. [Autenticación — context/AuthContext.jsx](#4-autenticación--contextauthcontextjsx)
5. [Notificaciones en tiempo real — hooks/useNotificaciones.js](#5-notificaciones-en-tiempo-real--hooksusnotificacionesjs)
6. [Layout protegido del dashboard](#6-layout-protegido-del-dashboard)
7. [Rutas API server-side](#7-rutas-api-server-side)

---

## 1. Base de datos — `schema.sql`

El esquema define los **tipos enumerados**, las **tablas** y las **funciones RPC** que usa toda la aplicación.

### 1.1 Tipos enumerados

```sql
-- Define los roles posibles de un usuario.
-- Se usan en la columna 'rol' de la tabla usuarios.
CREATE TYPE public.rol_usuario AS ENUM (
  'trabajador',     -- solo recibe insumos
  'jefatura',       -- puede crear solicitudes para trabajadores
  'tens',           -- gestiona inventario y despacha solicitudes
  'prevencionista', -- combina capacidades de jefatura + tens
  'administrador'   -- acceso total + CRUD usuarios + reportes
);

-- Ciclo de vida de una solicitud de insumo.
-- Los estados avanzan en orden: pendiente → autorizada → despachada → recibida.
-- Un tens también puede rechazar una solicitud.
CREATE TYPE public.estado_solicitud AS ENUM (
  'pendiente',    -- recién creada, esperando autorización
  'autorizada',   -- aprobada, pendiente de despacho físico
  'despachada',   -- entregada físicamente, pendiente de confirmación
  'recibida',     -- el trabajador confirmó la recepción
  'rechazada'     -- denegada por el tens/prevencionista
);

-- Tipos de movimiento para la auditoría de stock.
CREATE TYPE public.tipo_movimiento AS ENUM (
  'ingreso',   -- TENS agrega mercadería al inventario
  'despacho',  -- salida por entrega a trabajador
  'merma',     -- pérdida, vencimiento o rotura
  'ajuste'     -- corrección manual de inventario
);
```

---

### 1.2 Tabla `usuarios`

```sql
-- Extiende la tabla auth.users de Supabase con datos de perfil propios del sistema.
-- Cuando se elimina un usuario de auth.users, se elimina en cascada aquí también.
CREATE TABLE public.usuarios (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    rut VARCHAR(12) UNIQUE,  -- RUT chileno (se usa para hacer login en vez del email)
    nombre TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    rol public.rol_usuario NOT NULL DEFAULT 'trabajador',
    servicio TEXT,           -- área/unidad a la que pertenece el usuario
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índice para búsqueda rápida por RUT (se usa al iniciar sesión)
CREATE INDEX idx_usuarios_rut ON public.usuarios(rut);
```

---

### 1.3 Tabla `insumos`

```sql
-- Catálogo de todos los insumos con control de stock en tiempo real.
CREATE TABLE public.insumos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre TEXT NOT NULL,
    descripcion TEXT,
    codigo TEXT UNIQUE,  -- código interno opcional para identificación rápida
    unidad_medida TEXT NOT NULL DEFAULT 'unidad',
    stock_actual INTEGER NOT NULL DEFAULT 0 CHECK (stock_actual >= 0), -- nunca puede ser negativo
    stock_minimo INTEGER NOT NULL DEFAULT 5,  -- umbral de alerta por stock bajo
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

### 1.4 Tablas `pedidos` y `solicitudes`

```sql
-- Un pedido agrupa varias solicitudes creadas en la misma operación.
-- nro_correlativo es el número visible en pantalla (Pedido #1, #2, …).
CREATE TABLE public.pedidos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nro_correlativo INTEGER GENERATED ALWAYS AS IDENTITY NOT NULL, -- auto-incremental, solo lectura
    solicitante_id UUID NOT NULL REFERENCES public.usuarios(id),   -- jefatura o prevencionista
    trabajador_id  UUID NOT NULL REFERENCES public.usuarios(id),   -- para quién son los insumos
    motivo TEXT,
    estado TEXT NOT NULL DEFAULT 'pendiente',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Cada fila es un ítem dentro de un pedido: un insumo específico con su cantidad.
-- Tiene su propio ciclo de vida (estado) independiente del pedido padre.
CREATE TABLE public.solicitudes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pedido_id      UUID REFERENCES public.pedidos(id) ON DELETE SET NULL, -- si se borra el pedido, el ítem queda huérfano
    solicitante_id UUID NOT NULL REFERENCES public.usuarios(id),
    trabajador_id  UUID NOT NULL REFERENCES public.usuarios(id),
    insumo_id      UUID NOT NULL REFERENCES public.insumos(id),
    cantidad       INTEGER NOT NULL DEFAULT 1 CHECK (cantidad > 0),
    estado         public.estado_solicitud NOT NULL DEFAULT 'pendiente',
    motivo         TEXT,                           -- justificación del solicitante
    observaciones  TEXT,                           -- notas del TENS al gestionar
    gestionado_por UUID REFERENCES public.usuarios(id), -- TENS que autorizó/despachó
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

### 1.5 Tabla `movimientos_stock`

```sql
-- Log inmutable: registra TODOS los cambios de stock con su contexto.
-- Nunca se actualiza ni se borra; solo se inserta.
-- Permite reconstruir el historial completo del inventario.
CREATE TABLE public.movimientos_stock (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    insumo_id      UUID NOT NULL REFERENCES public.insumos(id),
    tipo           public.tipo_movimiento NOT NULL,
    cantidad       INTEGER NOT NULL,
    stock_anterior INTEGER NOT NULL,  -- snapshot antes del cambio
    stock_nuevo    INTEGER NOT NULL,  -- snapshot después del cambio
    usuario_id     UUID REFERENCES public.usuarios(id),
    referencia_id  UUID,              -- UUID de la solicitud relacionada (si aplica)
    observaciones  TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

### 1.6 Función auxiliar y RPC principal

```sql
-- Trigger que actualiza updated_at automáticamente cada vez que se modifica una fila.
-- Se aplica a: usuarios, insumos, pedidos, solicitudes.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- RPC: autorizar_solicitud
-- Ejecuta con SECURITY DEFINER (permisos del dueño de la función, no del llamante),
-- lo que permite a un TENS cambiar el estado sin bypasear RLS globalmente.
CREATE OR REPLACE FUNCTION public.autorizar_solicitud(
  p_solicitud_id UUID,
  p_tens_id      UUID
)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Solo actúa si la solicitud existe Y está pendiente
  UPDATE public.solicitudes
  SET
    estado         = 'autorizada',
    gestionado_por = p_tens_id,
    updated_at     = NOW()
  WHERE id     = p_solicitud_id
    AND estado = 'pendiente';  -- cláusula de seguridad: no puede autorizar dos veces

  IF NOT FOUND THEN
    RAISE EXCEPTION 'La solicitud no existe o no está en estado "pendiente"';
  END IF;

  RETURN json_build_object('success', true, 'message', 'Solicitud autorizada correctamente');
END;
$$;
```

---

## 2. Cliente Supabase — `lib/supabase.js`

```js
import { createClient } from "@supabase/supabase-js";

// Placeholders para el build estático de Next.js.
// Durante 'next build' algunas páginas importan este módulo sin usarlo realmente.
// Sin placeholders, createClient lanzaría una excepción y el build fallaría.
const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://placeholder.supabase.co";
const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "placeholder";

// Cliente singleton: se reutiliza la misma instancia en toda la app.
export const supabase = createClient(supabaseUrl, supabaseAnon, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,

    // IMPORTANTE: se usa sessionStorage en vez de localStorage.
    // Esto hace que la sesión desaparezca al cerrar el navegador,
    // reforzando la seguridad en equipos compartidos (hospitales).
    // En el servidor (SSR/API routes) window no existe, por lo que
    // Supabase opera sin persistencia, que es el comportamiento correcto.
    storage: typeof window !== "undefined" ? window.sessionStorage : undefined,
  },
});
```

---

## 3. Sistema de roles — `lib/roles.js`

```js
// Jerarquía de roles del sistema (de menor a mayor poder):
//   trabajador → jefatura → tens → prevencionista → administrador
//
// El modelo es ACUMULATIVO: los roles superiores incluyen las capacidades
// de todos los roles inferiores.

// Ruta de inicio del dashboard por rol (para redirecciones post-login)
export const ROLE_HOME = {
  trabajador: "/trabajador",
  jefatura: "/jefatura",
  tens: "/tens",
  prevencionista: "/prevencionista",
  administrador: "/admin",
};

// Tabla de capacidades: cada capacidad lista qué roles la tienen.
// Agregar un rol a una lista le otorga esa capacidad automáticamente.
const CAPACIDADES = {
  // Puede confirmar la recepción física de insumos despachados
  puedeRecibirInsumos: [
    "trabajador",
    "jefatura",
    "tens",
    "prevencionista",
    "administrador",
  ],

  // Puede crear solicitudes de insumos para trabajadores
  puedeSolicitar: ["jefatura", "prevencionista", "administrador"],

  // Puede gestionar inventario, autorizar solicitudes y registrar mermas
  puedeGestionar: ["tens", "prevencionista", "administrador"],

  // Acceso total: CRUD usuarios + reportes globales
  puedeAdmin: ["administrador"],
};

/**
 * Verifica si un rol tiene una capacidad determinada.
 *
 * Ejemplo de uso en UI o middleware:
 *   if (!puede(perfil.rol, 'puedeGestionar')) return <Forbidden />;
 *
 * @param {string} rol
 * @param {keyof typeof CAPACIDADES} capacidad
 * @returns {boolean}
 */
export function puede(rol, capacidad) {
  if (!rol || !CAPACIDADES[capacidad]) return false;
  return CAPACIDADES[capacidad].includes(rol);
}
```

---

## 4. Autenticación — `context/AuthContext.jsx`

Este es el corazón del sistema de autenticación. Provee a toda la app el estado de sesión, el perfil del usuario y las funciones de login/logout.

### 4.1 Sincronización entre pestañas

```js
// La sesión vive en sessionStorage (se borra al cerrar el browser).
// Problema: abrir una pestaña nueva limpia sessionStorage → el usuario parece no autenticado.
// Solución: usar localStorage como canal de mensajería entre pestañas.

const LS_SYNC_REQUEST = "tab_sync_request"; // nueva pestaña solicita: "¿alguien tiene sesión?"
const LS_SYNC_RESPONSE = "tab_sync_response"; // pestaña activa responde con los datos de sesión
const LS_GLOBAL_SIGNOUT = "global_signout"; // señal para cerrar sesión en todas las pestañas

const TAB_SYNC_TIMEOUT_MS = 350; // si nadie responde en 350 ms → el browser fue cerrado y reabierto

function syncSessionFromOtherTab() {
  return new Promise((resolve) => {
    let settled = false;

    const onStorage = (e) => {
      if (e.key !== LS_SYNC_RESPONSE || !e.newValue) return;
      if (settled) return;
      settled = true;
      window.removeEventListener("storage", onStorage);
      clearTimeout(timer);

      try {
        const data = JSON.parse(e.newValue);
        // Copiar las claves de sesión de Supabase al sessionStorage de ESTA pestaña nueva
        Object.entries(data).forEach(([k, v]) => sessionStorage.setItem(k, v));
        localStorage.removeItem(LS_SYNC_REQUEST);
        localStorage.removeItem(LS_SYNC_RESPONSE);
        resolve(Object.keys(data).length > 0);
      } catch {
        resolve(false);
      }
    };

    // Si nadie responde en 350 ms asumimos que no hay otras pestañas activas
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      window.removeEventListener("storage", onStorage);
      localStorage.removeItem(LS_SYNC_REQUEST);
      resolve(false);
    }, TAB_SYNC_TIMEOUT_MS);

    window.addEventListener("storage", onStorage);
    // Emitir la solicitud (las otras pestañas la oirán y responderán con sus datos)
    localStorage.setItem(LS_SYNC_REQUEST, Date.now().toString());
  });
}
```

---

### 4.2 Inicialización de la sesión

```js
useEffect(() => {
  let isMounted = true;

  const initAuth = async () => {
    // 1. Intentar leer sesión del sessionStorage de ESTA pestaña
    const {
      data: { session: s },
    } = await supabase.auth.getSession();

    if (s) {
      // Hay sesión: recarga de página normal
      if (isMounted) setSession(s);
    } else {
      // No hay sesión: puede ser pestaña nueva (otra pestaña tiene sesión)
      // o bien el browser fue cerrado y reabierto (sesión expirada intencionalmente)
      const synced = await syncSessionFromOtherTab();

      if (synced) {
        // Otra pestaña compartió sus datos → leer sesión recién importada
        const {
          data: { session: ss },
        } = await supabase.auth.getSession();
        if (isMounted) setSession(ss ?? null);
      } else {
        // Ninguna pestaña respondió → el usuario debe iniciar sesión de nuevo
        if (isMounted) setSession(null);
      }
    }
  };

  initAuth();

  // Esta pestaña responde cuando OTRA solicita sincronización
  const onSyncRequest = (e) => {
    if (e.key !== LS_SYNC_REQUEST || !e.newValue) return;
    const data = {};
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      // Solo compartir las claves propias de Supabase (prefijo 'sb-')
      if (key.startsWith("sb-")) data[key] = sessionStorage.getItem(key);
    }
    if (Object.keys(data).length > 0) {
      localStorage.setItem(LS_SYNC_RESPONSE, JSON.stringify(data));
    }
  };

  window.addEventListener("storage", onSyncRequest);
  // …cleanup al desmontar
}, []);
```

---

### 4.3 Login por RUT

```js
const signIn = useCallback(async ({ rut, password }) => {
  setError(null);

  // El usuario ingresa su RUT, no su email.
  // La RPC 'get_email_by_rut' busca el email en public.usuarios (solo usuarios activos).
  const { data: emailData, error: rpcError } = await supabase.rpc(
    "get_email_by_rut",
    { p_rut: rut.trim() },
  );

  if (rpcError || !emailData) {
    const msg = "RUT no encontrado o usuario inactivo.";
    setError(msg);
    return { error: msg };
  }

  // Con el email obtenido, se usa la autenticación nativa de Supabase
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: emailData,
    password,
  });

  if (signInError) {
    setError(signInError.message);
    return { error: signInError.message };
  }

  // El listener onAuthStateChange dispara setSession → useEffect carga el perfil
  return { error: null };
}, []);
```

---

### 4.4 Cierre de sesión por inactividad

```js
// Si el usuario no interactúa durante 10 minutos, se cierra la sesión automáticamente.
// El timer se reinicia con cada acción del usuario (movimiento de ratón, teclado, etc.).
const INACTIVITY_TIMEOUT = 10 * 60 * 1000; // 10 minutos en milisegundos

const resetInactivityTimer = useCallback(() => {
  if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
  inactivityTimerRef.current = setTimeout(() => {
    supabase.auth.signOut(); // cierra sesión silenciosamente
  }, INACTIVITY_TIMEOUT);
}, []);
```

---

## 5. Notificaciones en tiempo real — `hooks/useNotificaciones.js`

```js
// Este hook consulta la base de datos y retorna contadores de notificaciones
// que se muestran como badges (números) en el sidebar.
//
// Badge keys y su significado:
//   'solicitudes-pendientes' → solicitudes sin atender (para tens/prevencionista)
//   'mis-solicitudes'        → solicitudes activas donde el usuario es solicitante o beneficiario
//   'mis-recepciones'        → insumos despachados esperando confirmación de recepción
//   'compras-pendientes'     → solicitudes de compra sin procesar (solo administrador)

export function useNotificaciones(perfil) {
  const [badges, setBadges] = useState({});

  useEffect(() => {
    if (!perfil) return;
    const { id, rol } = perfil;

    async function fetchBadges() {
      const nuevo = {};

      // Solo tens y prevencionista ven solicitudes de trabajadores pendientes
      if (rol === "tens" || rol === "prevencionista") {
        const { count } = await supabase
          .from("solicitudes")
          .select("id", { count: "exact", head: true })
          .eq("estado", "pendiente"); // count: exact devuelve el total sin traer filas
        if (count > 0) nuevo["solicitudes-pendientes"] = count;
      }
      // …más consultas para otros badges según el rol
    }

    fetchBadges();

    // Suscripción a cambios en tiempo real:
    // cada vez que una solicitud cambia de estado, los badges se recalculan
    const channel = supabase
      .channel("notificaciones")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "solicitudes" },
        fetchBadges,
      )
      .subscribe();

    return () => supabase.removeChannel(channel); // cleanup al desmontar
  }, [perfil]);

  return badges;
}
```

---

## 6. Layout protegido del dashboard

```jsx
// app/(dashboard)/layout.jsx
//
// Este layout actúa como "guardia de ruta":
//   1. Verifica que haya una sesión activa.
//   2. Verifica que el rol del usuario coincida con la ruta que visita.
//   3. Si no tiene permiso, redirige al dashboard de su rol.
//   4. Renderiza el sidebar adaptado a cada rol.

// Define qué rutas puede visitar cada rol
const ACCESO_POR_ROL = {
  trabajador: ["/trabajador"],
  jefatura: ["/jefatura"],
  tens: ["/tens"],
  prevencionista: ["/prevencionista"],
  administrador: ["/admin"],
};

// El componente usa useAuth() para obtener sesión, perfil y estado de carga
// Si loading es true → muestra spinner (evita flash de contenido no autorizado)
// Si !session       → redirige a /login
// Si el rol no puede acceder a la ruta actual → redirige a su dashboard

// Construcción dinámica del sidebar según el rol del usuario
function buildNavItems(perfil) {
  if (!perfil) return [];
  const { rol } = perfil;
  const items = [];

  if (rol === "tens") {
    items.push({
      section: "Gestión de Insumos",
      links: [
        { href: "/tens?tab=inventario", label: "Inventario", icon: "🗂️" },
        { href: "/tens?tab=stock", label: "Consultar Stock", icon: "🔍" },
        { href: "/tens?tab=compra", label: "Solicitar Compra", icon: "🛒" },
        {
          href: "/tens?tab=recepcion-compra",
          label: "Recepción de Compras",
          icon: "📦",
        },
      ],
    });
    // badgeKey conecta el link con un contador del hook useNotificaciones
    items.push({
      section: "Solicitudes de Trabajadores",
      links: [
        {
          href: "/tens?tab=solicitudes",
          label: "Solicitudes Pendientes",
          icon: "📋",
          badgeKey: "solicitudes-pendientes",
        }, // muestra número rojo si hay pendientes
      ],
    });
  }
  // …mismo patrón para prevencionista, jefatura, trabajador, administrador
  return items;
}
```

---

## 7. Rutas API server-side

Las rutas en `app/api/` se ejecutan **solo en el servidor** y usan `SUPABASE_SERVICE_ROLE_KEY`, que nunca se expone al cliente.

### 7.1 `POST /api/usuarios` — Crear usuario

```js
// app/api/usuarios/route.js

export async function POST(request) {
  // Se crea un cliente admin con la SERVICE_ROLE_KEY.
  // A diferencia del cliente del navegador, este tiene permisos de superusuario
  // y puede crear/eliminar usuarios sin restricciones de RLS.
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }, // sin estado en servidor
  );

  const { nombre, rut, email, rol, servicio, password } = await request.json();

  // Validaciones en el servidor (no confiar solo en el cliente)
  if (!nombre?.trim())
    return NextResponse.json(
      { error: "El nombre es obligatorio." },
      { status: 400 },
    );
  if (!password || password.length < 6)
    return NextResponse.json(
      { error: "La contraseña debe tener al menos 6 caracteres." },
      { status: 400 },
    );

  // Crear el usuario en Supabase Auth
  const { data: authData, error: authError } =
    await supabaseAdmin.auth.admin.createUser({
      email: email.trim().toLowerCase(),
      password,
      email_confirm: true, // ← el usuario puede iniciar sesión inmediatamente sin verificar correo
      user_metadata: {
        // se guarda en auth.users, accesible como session.user.user_metadata
        nombre: nombre.trim(),
        rut: rut.trim(),
        rol,
        servicio: servicio?.trim() || null,
      },
    });

  if (authError)
    return NextResponse.json({ error: authError.message }, { status: 500 });

  // Upsert del perfil en la tabla pública 'usuarios'.
  // El trigger handle_new_user lo inserta automáticamente, pero hacemos upsert
  // para garantizar que rol y servicio queden correctos desde el primer momento.
  const { error: perfilError } = await supabaseAdmin.from("usuarios").upsert(
    {
      id: authData.user.id,
      rut: rut.trim(),
      nombre: nombre.trim(),
      email: email.trim().toLowerCase(),
      rol,
      servicio: servicio?.trim() || null,
      activo: true,
    },
    { onConflict: "id" },
  ); // si ya existe por UUID, actualiza en vez de insertar

  if (perfilError) {
    // El usuario ya fue creado en Auth pero el perfil falló.
    // Se devuelve 207 (Multi-Status) para que el administrador sepa que debe revisar.
    return NextResponse.json(
      {
        error: `Usuario creado en Auth pero error en perfil: ${perfilError.message}`,
      },
      { status: 207 },
    );
  }

  return NextResponse.json({ ok: true, id: authData.user.id }, { status: 201 });
}
```

---

### 7.2 `POST /api/setup` — Primer administrador

```js
// app/api/setup/route.js
//
// Esta ruta solo funciona UNA VEZ: cuando el sistema aún no tiene ningún administrador.
// Después de crear el primer admin, la ruta devuelve 409 y queda inutilizable.
// Esto previene que alguien cree un administrador no autorizado si la ruta quedara expuesta.

export async function POST(request) {
  // Verificar si ya existe algún administrador activo
  const { data: existente } = await supabaseAdmin
    .from("usuarios")
    .select("id")
    .eq("rol", "administrador")
    .eq("activo", true)
    .limit(1)
    .single();

  if (existente) {
    // Ya hay un admin → bloquear completamente la ruta
    return NextResponse.json(
      { error: "Ya existe un administrador. Esta ruta no está disponible." },
      { status: 409 },
    );
  }

  // … crear el usuario admin con la misma lógica que POST /api/usuarios
}
```

---

### 7.3 `DELETE /api/usuarios/:id` — Eliminar usuario

```js
// app/api/usuarios/[id]/route.js
//
// Elimina un usuario de forma completa en dos pasos:
// 1. Borra el perfil de public.usuarios
// 2. Borra la cuenta de Supabase Auth
//
// El orden importa: si hay FK con ON DELETE CASCADE, el paso 1 puede ser redundante
// pero no causa errores. Si se invierte el orden y falla el paso 1, el perfil quedaría huérfano.

export async function DELETE(request, { params }) {
  const { id } = await params;
  if (!id)
    return NextResponse.json({ error: "ID requerido." }, { status: 400 });

  // Paso 1: eliminar perfil (tabla pública)
  await supabaseAdmin.from("usuarios").delete().eq("id", id);

  // Paso 2: eliminar cuenta de autenticación
  const { error } = await supabaseAdmin.auth.admin.deleteUser(id);
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
```

---

## Resumen de arquitectura

```
┌─────────────────────────────────────────────────────┐
│                  Navegador (Cliente)                │
│                                                     │
│  AuthContext ──► sessionStorage (sesión Supabase)   │
│       │                                             │
│  useAuth()  ◄── hooks/useAuth.js (re-export)        │
│       │                                             │
│  Dashboard Layout (ProtectedRoute + Sidebar)        │
│       │                                             │
│  Páginas por rol: /admin /tens /jefatura …          │
│       │                                             │
│  useNotificaciones() ──► Realtime Supabase          │
└───────────────────────┬─────────────────────────────┘
                        │ llamadas a DB / RPC
                        ▼
┌─────────────────────────────────────────────────────┐
│              Supabase (Backend)                     │
│                                                     │
│  auth.users ──► public.usuarios (trigger)           │
│  public.insumos                                     │
│  public.pedidos ──► public.solicitudes              │
│  public.entregas                                    │
│  public.movimientos_stock (log inmutable)           │
│  RPC: autorizar_solicitud, despachar_solicitud …    │
└───────────────────────┬─────────────────────────────┘
                        │ solo desde servidor
                        ▼
┌─────────────────────────────────────────────────────┐
│              Next.js API Routes (Servidor)          │
│              (usan SERVICE_ROLE_KEY)                │
│                                                     │
│  POST   /api/setup          → primer admin          │
│  POST   /api/usuarios       → crear usuario         │
│  DELETE /api/usuarios/:id   → eliminar usuario      │
└─────────────────────────────────────────────────────┘
```
