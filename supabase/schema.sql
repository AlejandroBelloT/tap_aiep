-- ============================================================
-- SISTEMA DE GESTIÓN DE INSUMOS Y ASIGNACIÓN
-- Esquema SQL para Supabase (PostgreSQL)
-- ============================================================

-- ============================================================
-- 1. TIPOS ENUMERADOS
-- ============================================================

CREATE TYPE public.rol_usuario AS ENUM (
  'trabajador',
  'jefatura',
  'tens',
  'prevencionista',
  'administrador'
);

CREATE TYPE public.estado_solicitud AS ENUM (
  'pendiente',
  'autorizada',
  'despachada',
  'recibida',
  'rechazada'
);

CREATE TYPE public.tipo_movimiento AS ENUM (
  'ingreso',
  'despacho',
  'merma',
  'ajuste'
);

-- ============================================================
-- 2. TABLA: usuarios
-- Extiende auth.users de Supabase con datos de perfil y rol
-- ============================================================

CREATE TABLE public.usuarios (
    id UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
    rut VARCHAR(12) UNIQUE, -- RUT chileno, ej: 12.345.678-9 (se usa para login)
    nombre TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    rol public.rol_usuario NOT NULL DEFAULT 'trabajador',
    servicio TEXT, -- área o servicio al que pertenece
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_usuarios_rut ON public.usuarios (rut);
-- búsqueda rápida por RUT

COMMENT ON
TABLE public.usuarios IS 'Perfiles de usuario del sistema, vinculados a auth.users';

COMMENT ON COLUMN public.usuarios.rol IS 'Rol principal del usuario. Los roles superiores heredan capacidades de los inferiores.';

-- ============================================================
-- 3. TABLA: insumos
-- Catálogo de insumos con control de stock
-- ============================================================

CREATE TABLE public.insumos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    nombre TEXT NOT NULL,
    descripcion TEXT,
    codigo TEXT UNIQUE, -- código interno opcional
    unidad_medida TEXT NOT NULL DEFAULT 'unidad',
    stock_actual INTEGER NOT NULL DEFAULT 0 CHECK (stock_actual >= 0),
    stock_minimo INTEGER NOT NULL DEFAULT 5 CHECK (stock_minimo >= 0),
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON
TABLE public.insumos IS 'Catálogo de insumos con stock en tiempo real';

COMMENT ON COLUMN public.insumos.stock_minimo IS 'Umbral de alerta por stock bajo';

-- ============================================================
-- 4. TABLA: pedidos
-- Agrupa múltiples ítems (solicitudes) bajo un mismo pedido.
-- nro_correlativo es el número visible para reportería.
-- ============================================================

CREATE TABLE public.pedidos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    nro_correlativo INTEGER GENERATED ALWAYS AS IDENTITY NOT NULL, -- número secuencial visible: Pedido #1, #2, …
    solicitante_id UUID NOT NULL REFERENCES public.usuarios (id),
    trabajador_id UUID NOT NULL REFERENCES public.usuarios (id),
    motivo TEXT,
    estado TEXT NOT NULL DEFAULT 'pendiente',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_pedidos_nro ON public.pedidos (nro_correlativo);

CREATE INDEX idx_pedidos_trabajador ON public.pedidos (trabajador_id);

CREATE INDEX idx_pedidos_solicitante ON public.pedidos (solicitante_id);

CREATE INDEX idx_pedidos_created_at ON public.pedidos (created_at DESC);

COMMENT ON
TABLE public.pedidos IS 'Agrupa ítems de una misma solicitud. nro_correlativo identifica el pedido en reportes.';

COMMENT ON COLUMN public.pedidos.nro_correlativo IS 'Número secuencial visible: Pedido #1, #2, ...';

CREATE TRIGGER trg_pedidos_updated_at
  BEFORE UPDATE ON public.pedidos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- 5. TABLA: solicitudes
-- Ciclo de vida completo: pendiente → autorizada → despachada → recibida
-- ============================================================

CREATE TABLE public.solicitudes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    pedido_id UUID REFERENCES public.pedidos (id) ON DELETE SET NULL, -- pedido agrupador
    solicitante_id UUID NOT NULL REFERENCES public.usuarios (id), -- quien crea la solicitud (jefatura/prev)
    trabajador_id UUID NOT NULL REFERENCES public.usuarios (id), -- para quién es el insumo
    insumo_id UUID NOT NULL REFERENCES public.insumos (id),
    cantidad INTEGER NOT NULL DEFAULT 1 CHECK (cantidad > 0),
    estado public.estado_solicitud NOT NULL DEFAULT 'pendiente',
    motivo TEXT, -- justificación de la solicitud
    observaciones TEXT, -- notas del TENS al gestionar
    gestionado_por UUID REFERENCES public.usuarios (id), -- TENS/prev que autorizó o despachó
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON
TABLE public.solicitudes IS 'Solicitudes de insumos con trazabilidad completa de estados';

COMMENT ON COLUMN public.solicitudes.pedido_id IS 'Referencia al pedido que agrupa este ítem.';

-- ============================================================
-- 5. TABLA: entregas
-- Registro de cada despacho físico, incluyendo confirmación del receptor
-- ============================================================

CREATE TABLE public.entregas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    solicitud_id UUID NOT NULL UNIQUE REFERENCES public.solicitudes (id) ON DELETE CASCADE,
    despachado_por UUID NOT NULL REFERENCES public.usuarios (id),
    recibido_por UUID REFERENCES public.usuarios (id),
    fecha_despacho TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    fecha_recepcion TIMESTAMPTZ,
    observaciones TEXT
);

COMMENT ON
TABLE public.entregas IS 'Registro de despachos y confirmaciones de recepción';

-- ============================================================
-- 6. TABLA: movimientos_stock
-- Auditoría completa de todos los cambios de stock
-- ============================================================

CREATE TABLE public.movimientos_stock (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    insumo_id UUID NOT NULL REFERENCES public.insumos (id),
    tipo public.tipo_movimiento NOT NULL,
    cantidad INTEGER NOT NULL,
    stock_anterior INTEGER NOT NULL,
    stock_nuevo INTEGER NOT NULL,
    usuario_id UUID REFERENCES public.usuarios (id),
    referencia_id UUID, -- ID de solicitud relacionada (si aplica)
    observaciones TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON
TABLE public.movimientos_stock IS 'Log inmutable de todos los movimientos de inventario';

-- ============================================================
-- 7. ÍNDICES DE RENDIMIENTO
-- ============================================================

CREATE INDEX idx_solicitudes_estado ON public.solicitudes (estado);

CREATE INDEX idx_solicitudes_trabajador ON public.solicitudes (trabajador_id);

CREATE INDEX idx_solicitudes_solicitante ON public.solicitudes (solicitante_id);

CREATE INDEX idx_solicitudes_created_at ON public.solicitudes (created_at DESC);

CREATE INDEX idx_movimientos_insumo ON public.movimientos_stock (insumo_id);

CREATE INDEX idx_movimientos_created_at ON public.movimientos_stock (created_at DESC);

CREATE INDEX idx_usuarios_rol ON public.usuarios (rol);

-- ============================================================
-- 8. FUNCIÓN AUXILIAR: actualizar updated_at automáticamente
-- ============================================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_usuarios_updated_at
  BEFORE UPDATE ON public.usuarios
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_insumos_updated_at
  BEFORE UPDATE ON public.insumos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_solicitudes_updated_at
  BEFORE UPDATE ON public.solicitudes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- 9. RPC: autorizar_solicitud
-- Cambia estado de 'pendiente' a 'autorizada' (sin tocar stock)
-- ============================================================

CREATE OR REPLACE FUNCTION public.autorizar_solicitud(
  p_solicitud_id  UUID,
  p_tens_id       UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.solicitudes
  SET
    estado         = 'autorizada',
    gestionado_por = p_tens_id,
    updated_at     = NOW()
  WHERE id     = p_solicitud_id
    AND estado = 'pendiente';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'La solicitud no existe o no está en estado "pendiente"';
  END IF;

  RETURN json_build_object('success', true, 'message', 'Solicitud autorizada correctamente');
END;
$$;

COMMENT ON FUNCTION public.autorizar_solicitud IS 'Autoriza una solicitud pendiente. Solo cambia el estado, no descuenta stock.';

-- ============================================================
-- 10. RPC: despachar_insumo  ←  TRANSACCIÓN CRÍTICA
-- Cambia estado a 'despachada', descuenta stock y registra la entrega
-- Todo en una sola transacción atómica
-- ============================================================

CREATE OR REPLACE FUNCTION public.despachar_insumo(
  p_solicitud_id  UUID,
  p_tens_id       UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_solicitud       public.solicitudes%ROWTYPE;
  v_stock_anterior  INTEGER;
BEGIN
  -- Bloquear fila de la solicitud para evitar condiciones de carrera
  SELECT * INTO v_solicitud
  FROM public.solicitudes
  WHERE id = p_solicitud_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitud no encontrada';
  END IF;

  IF v_solicitud.estado != 'autorizada' THEN
    RAISE EXCEPTION 'Solo se pueden despachar solicitudes con estado "autorizada". Estado actual: %', v_solicitud.estado;
  END IF;

  -- Bloquear fila del insumo y verificar stock suficiente
  SELECT stock_actual INTO v_stock_anterior
  FROM public.insumos
  WHERE id = v_solicitud.insumo_id
  FOR UPDATE;

  IF v_stock_anterior < v_solicitud.cantidad THEN
    RAISE EXCEPTION 'Stock insuficiente. Disponible: %, Requerido: %',
      v_stock_anterior, v_solicitud.cantidad;
  END IF;

  -- 1. Descontar stock del insumo
  UPDATE public.insumos
  SET
    stock_actual = stock_actual - v_solicitud.cantidad,
    updated_at   = NOW()
  WHERE id = v_solicitud.insumo_id;

  -- 2. Cambiar estado de la solicitud
  UPDATE public.solicitudes
  SET
    estado         = 'despachada',
    gestionado_por = p_tens_id,
    updated_at     = NOW()
  WHERE id = p_solicitud_id;

  -- 3. Crear registro de entrega
  INSERT INTO public.entregas (solicitud_id, despachado_por)
  VALUES (p_solicitud_id, p_tens_id);

  -- 4. Registrar movimiento de stock para auditoría
  INSERT INTO public.movimientos_stock (
    insumo_id, tipo, cantidad,
    stock_anterior, stock_nuevo,
    usuario_id, referencia_id, observaciones
  ) VALUES (
    v_solicitud.insumo_id,
    'despacho',
    v_solicitud.cantidad,
    v_stock_anterior,
    v_stock_anterior - v_solicitud.cantidad,
    p_tens_id,
    p_solicitud_id,
    'Despacho automático por solicitud aprobada'
  );

  RETURN json_build_object(
    'success',         true,
    'stock_anterior',  v_stock_anterior,
    'stock_nuevo',     v_stock_anterior - v_solicitud.cantidad,
    'message',         'Insumo despachado y stock actualizado correctamente'
  );

EXCEPTION
  WHEN OTHERS THEN
    -- El bloque EXCEPTION re-lanza el error; PostgreSQL hace rollback automático
    RAISE;
END;
$$;

COMMENT ON FUNCTION public.despachar_insumo IS 'TRANSACCIÓN ATÓMICA: autoriza la entrega, descuenta stock, crea entrega y registra movimiento.
   Hace rollback completo si cualquier paso falla.';

-- ============================================================
-- 11. RPC: confirmar_recepcion
-- El trabajador "firma" la recepción del insumo
-- ============================================================

CREATE OR REPLACE FUNCTION public.confirmar_recepcion(
  p_solicitud_id  UUID,
  p_trabajador_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Verificar que la solicitud pertenece a este trabajador y está despachada
  UPDATE public.solicitudes
  SET
    estado     = 'recibida',
    updated_at = NOW()
  WHERE id            = p_solicitud_id
    AND trabajador_id = p_trabajador_id
    AND estado        = 'despachada';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No se encontró una entrega despachada para este trabajador con el ID proporcionado';
  END IF;

  -- Actualizar la fecha de recepción en la tabla entregas
  UPDATE public.entregas
  SET
    recibido_por    = p_trabajador_id,
    fecha_recepcion = NOW()
  WHERE solicitud_id = p_solicitud_id;

  RETURN json_build_object('success', true, 'message', 'Recepción confirmada correctamente');

EXCEPTION
  WHEN OTHERS THEN
    RAISE;
END;
$$;

COMMENT ON FUNCTION public.confirmar_recepcion IS 'El trabajador receptor confirma haber recibido el insumo.';

-- ============================================================
-- 12. RPC: registrar_ingreso_stock
-- TENS/Prevencionista registra entrada de nuevos insumos
-- ============================================================

CREATE OR REPLACE FUNCTION public.registrar_ingreso_stock(
  p_insumo_id     UUID,
  p_cantidad      INTEGER,
  p_usuario_id    UUID,
  p_observaciones TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_stock_anterior INTEGER;
BEGIN
  IF p_cantidad <= 0 THEN
    RAISE EXCEPTION 'La cantidad debe ser mayor a cero';
  END IF;

  SELECT stock_actual INTO v_stock_anterior
  FROM public.insumos
  WHERE id = p_insumo_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Insumo no encontrado';
  END IF;

  UPDATE public.insumos
  SET
    stock_actual = stock_actual + p_cantidad,
    updated_at   = NOW()
  WHERE id = p_insumo_id;

  INSERT INTO public.movimientos_stock (
    insumo_id, tipo, cantidad,
    stock_anterior, stock_nuevo,
    usuario_id, observaciones
  ) VALUES (
    p_insumo_id,
    'ingreso',
    p_cantidad,
    v_stock_anterior,
    v_stock_anterior + p_cantidad,
    p_usuario_id,
    COALESCE(p_observaciones, 'Ingreso de stock')
  );

  RETURN json_build_object(
    'success',        true,
    'stock_anterior', v_stock_anterior,
    'stock_nuevo',    v_stock_anterior + p_cantidad
  );

EXCEPTION
  WHEN OTHERS THEN
    RAISE;
END;
$$;

-- ============================================================
-- 13. RPC: registrar_merma
-- TENS/Prevencionista registra pérdidas o deterioro de insumos
-- ============================================================

CREATE OR REPLACE FUNCTION public.registrar_merma(
  p_insumo_id     UUID,
  p_cantidad      INTEGER,
  p_usuario_id    UUID,
  p_observaciones TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_insumo        public.insumos%ROWTYPE;
BEGIN
  IF p_cantidad <= 0 THEN
    RAISE EXCEPTION 'La cantidad debe ser mayor a cero';
  END IF;

  SELECT * INTO v_insumo
  FROM public.insumos
  WHERE id = p_insumo_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Insumo no encontrado';
  END IF;

  IF v_insumo.stock_actual < p_cantidad THEN
    RAISE EXCEPTION 'No se puede registrar una merma mayor al stock actual (%).', v_insumo.stock_actual;
  END IF;

  UPDATE public.insumos
  SET
    stock_actual = stock_actual - p_cantidad,
    updated_at   = NOW()
  WHERE id = p_insumo_id;

  INSERT INTO public.movimientos_stock (
    insumo_id, tipo, cantidad,
    stock_anterior, stock_nuevo,
    usuario_id, observaciones
  ) VALUES (
    p_insumo_id,
    'merma',
    p_cantidad,
    v_insumo.stock_actual,
    v_insumo.stock_actual - p_cantidad,
    p_usuario_id,
    COALESCE(p_observaciones, 'Merma registrada')
  );

  RETURN json_build_object(
    'success',        true,
    'stock_anterior', v_insumo.stock_actual,
    'stock_nuevo',    v_insumo.stock_actual - p_cantidad
  );

EXCEPTION
  WHEN OTHERS THEN
    RAISE;
END;
$$;

-- ============================================================
-- 14. RPC: rechazar_solicitud
-- ============================================================

CREATE OR REPLACE FUNCTION public.rechazar_solicitud(
  p_solicitud_id  UUID,
  p_tens_id       UUID,
  p_observaciones TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.solicitudes
  SET
    estado         = 'rechazada',
    gestionado_por = p_tens_id,
    observaciones  = p_observaciones,
    updated_at     = NOW()
  WHERE id     = p_solicitud_id
    AND estado IN ('pendiente', 'autorizada');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitud no encontrada o no se puede rechazar en su estado actual';
  END IF;

  RETURN json_build_object('success', true, 'message', 'Solicitud rechazada');
END;
$$;

-- ============================================================
-- 15. ROW LEVEL SECURITY (RLS)
-- ============================================================

-- Habilitar RLS en todas las tablas
ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.insumos ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.solicitudes ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.entregas ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.movimientos_stock ENABLE ROW LEVEL SECURITY;

-- ── USUARIOS ──────────────────────────────────────────────

-- Cualquier usuario autenticado puede ver todos los perfiles (para selects en formularios)
CREATE POLICY "usuarios_select_auth" ON public.usuarios FOR
SELECT TO authenticated USING (true);

-- Solo el propio usuario o un admin puede actualizar el perfil
CREATE POLICY "usuarios_update_self_or_admin" ON public.usuarios FOR
UPDATE TO authenticated USING (
    auth.uid () = id
    OR (
        SELECT rol
        FROM public.usuarios
        WHERE
            id = auth.uid ()
    ) = 'administrador'
);

-- Solo admin puede insertar nuevos usuarios (el trigger de Auth los crea, el admin los gestiona)
CREATE POLICY "usuarios_insert_admin" ON public.usuarios FOR
INSERT
    TO authenticated
WITH
    CHECK (
        (
            SELECT rol
            FROM public.usuarios
            WHERE
                id = auth.uid ()
        ) = 'administrador'
    );

-- Solo admin puede eliminar (desactivar) usuarios
CREATE POLICY "usuarios_delete_admin" ON public.usuarios FOR DELETE TO authenticated USING (
    (
        SELECT rol
        FROM public.usuarios
        WHERE
            id = auth.uid ()
    ) = 'administrador'
);

-- ── INSUMOS ───────────────────────────────────────────────

-- Todos los autenticados pueden ver insumos activos
CREATE POLICY "insumos_select_auth" ON public.insumos FOR
SELECT TO authenticated USING (activo = true);

-- TENS, Prevencionista y Admin pueden modificar insumos
CREATE POLICY "insumos_write_gestores" ON public.insumos FOR ALL TO authenticated USING (
    (
        SELECT rol
        FROM public.usuarios
        WHERE
            id = auth.uid ()
    ) IN (
        'tens',
        'prevencionista',
        'administrador'
    )
)
WITH
    CHECK (
        (
            SELECT rol
            FROM public.usuarios
            WHERE
                id = auth.uid ()
        ) IN (
            'tens',
            'prevencionista',
            'administrador'
        )
    );

-- ── SOLICITUDES ───────────────────────────────────────────

-- SELECT: gestores ven todas; jefatura ve las propias; trabajador ve las que le pertenecen
CREATE POLICY "solicitudes_select" ON public.solicitudes FOR
SELECT TO authenticated USING (
        (
            SELECT rol
            FROM public.usuarios
            WHERE
                id = auth.uid ()
        ) IN (
            'tens', 'prevencionista', 'administrador'
        )
        OR solicitante_id = auth.uid ()
        OR trabajador_id = auth.uid ()
    );

-- INSERT: jefatura, prevencionista y admin pueden crear solicitudes para cualquier trabajador.
--         trabajador puede crear solicitudes pero solo a su propio nombre.
CREATE POLICY "solicitudes_insert" ON public.solicitudes FOR
INSERT
    TO authenticated
WITH
    CHECK (
        (
            -- Jefatura, prevencionista y admin: solicitante debe ser el propio usuario
            (
                SELECT rol
                FROM public.usuarios
                WHERE
                    id = auth.uid ()
            ) IN (
                'jefatura',
                'prevencionista',
                'administrador'
            )
            AND solicitante_id = auth.uid ()
        )
        OR (
            -- Trabajador: solo puede solicitar para sí mismo
            (
                SELECT rol
                FROM public.usuarios
                WHERE
                    id = auth.uid ()
            ) = 'trabajador'
            AND solicitante_id = auth.uid ()
            AND trabajador_id = auth.uid ()
        )
    );

-- UPDATE: solo gestores (via RPC SECURITY DEFINER idealmente, pero también directo)
CREATE POLICY "solicitudes_update_gestores" ON public.solicitudes FOR
UPDATE TO authenticated USING (
    (
        SELECT rol
        FROM public.usuarios
        WHERE
            id = auth.uid ()
    ) IN (
        'tens',
        'prevencionista',
        'administrador'
    )
);

-- ── ENTREGAS ──────────────────────────────────────────────

CREATE POLICY "entregas_select" ON public.entregas FOR
SELECT TO authenticated USING (
        (
            SELECT rol
            FROM public.usuarios
            WHERE
                id = auth.uid ()
        ) IN (
            'tens', 'prevencionista', 'administrador'
        )
        OR recibido_por = auth.uid ()
        OR despachado_por = auth.uid ()
        OR (
            SELECT trabajador_id
            FROM public.solicitudes
            WHERE
                id = solicitud_id
        ) = auth.uid ()
    );

CREATE POLICY "entregas_write_gestores" ON public.entregas FOR ALL TO authenticated USING (
    (
        SELECT rol
        FROM public.usuarios
        WHERE
            id = auth.uid ()
    ) IN (
        'tens',
        'prevencionista',
        'administrador'
    )
);

-- ── MOVIMIENTOS DE STOCK ──────────────────────────────────

-- Solo gestores y admin pueden ver el log de movimientos
CREATE POLICY "movimientos_select_gestores" ON public.movimientos_stock FOR
SELECT TO authenticated USING (
        (
            SELECT rol
            FROM public.usuarios
            WHERE
                id = auth.uid ()
        ) IN (
            'tens', 'prevencionista', 'administrador'
        )
    );

-- Solo SECURITY DEFINER functions escriben movimientos (bloquear INSERT directo)
CREATE POLICY "movimientos_insert_deny_direct" ON public.movimientos_stock FOR
INSERT
    TO authenticated
WITH
    CHECK (false);
-- las RPCs usan SECURITY DEFINER y bypasean RLS

-- ============================================================
-- 16. TRIGGER: crear perfil automáticamente al registrar usuario en Auth
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.usuarios (id, rut, nombre, email, rol, servicio)
  VALUES (
    NEW.id,
    NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'rut', '')), ''),
    COALESCE(NEW.raw_user_meta_data->>'nombre', split_part(NEW.email, '@', 1)),
    NEW.email,
    COALESCE((NEW.raw_user_meta_data->>'rol')::public.rol_usuario, 'trabajador'),
    NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'servicio', '')), '')
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- 17. RPC: get_email_by_rut
-- Devuelve el email de un usuario dado su RUT (para login).
-- SECURITY DEFINER para evitar que RLS bloquee la consulta.
-- Solo retorna el email, nunca expone más datos.
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_email_by_rut(p_rut TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email TEXT;
BEGIN
  SELECT email INTO v_email
  FROM public.usuarios
  WHERE rut = TRIM(p_rut)
    AND activo = TRUE
  LIMIT 1;

  RETURN v_email;  -- NULL si no existe
END;
$$;

GRANT
EXECUTE ON FUNCTION public.get_email_by_rut (TEXT) TO anon,
authenticated;

-- ============================================================
-- 18. RPC: buscar_trabajador_por_rut
-- Devuelve datos básicos del trabajador para autocompletar
-- el formulario de solicitudes.
-- ============================================================
CREATE OR REPLACE FUNCTION public.buscar_trabajador_por_rut(p_rut TEXT)
RETURNS TABLE (
  id        UUID,
  nombre    TEXT,
  servicio  TEXT,
  rol       public.rol_usuario,
  activo    BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT u.id, u.nombre, u.servicio, u.rol, u.activo
  FROM public.usuarios u
  WHERE u.rut = TRIM(p_rut)
  LIMIT 1;
END;
$$;

GRANT
EXECUTE ON FUNCTION public.buscar_trabajador_por_rut (TEXT) TO authenticated;

-- ============================================================
-- MIGRACIÓN (si la tabla usuarios ya existe sin columna rut)
-- Ejecutar solo si ya tienes datos en producción:
-- ============================================================
-- ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS rut VARCHAR(12) UNIQUE;
-- CREATE INDEX IF NOT EXISTS idx_usuarios_rut ON public.usuarios (rut);

-- ============================================================
-- 19. DATOS SEMILLA (SEED) — opcional para desarrollo
-- ============================================================

INSERT INTO
    public.insumos (
        nombre,
        descripcion,
        codigo,
        unidad_medida,
        stock_actual,
        stock_minimo
    )
VALUES (
        'Guantes de látex',
        'Talla M, caja 100 unidades',
        'INS-001',
        'caja',
        20,
        5
    ),
    (
        'Mascarilla KN95',
        'Protección respiratoria FFP2',
        'INS-002',
        'unidad',
        150,
        20
    ),
    (
        'Casco de seguridad',
        'Tipo I, clase E, blanco',
        'INS-003',
        'unidad',
        30,
        5
    ),
    (
        'Zapatos de seguridad',
        'Talla 42, punta de acero',
        'INS-004',
        'par',
        15,
        3
    ),
    (
        'Chaleco reflectante',
        'Talla L, ANSI clase 2',
        'INS-005',
        'unidad',
        25,
        5
    ),
    (
        'Lentes de seguridad',
        'Anti-impacto, transparente',
        'INS-006',
        'unidad',
        40,
        10
    ),
    (
        'Tapones auditivos',
        'SNR 37 dB, par reutilizable',
        'INS-007',
        'par',
        80,
        15
    ),
    (
        'Protector solar SPF 50',
        'Formato 200 ml',
        'INS-008',
        'unidad',
        12,
        5
    );