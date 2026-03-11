-- ============================================================
-- MIGRACIÓN 002: Tabla pedidos + nro_correlativo + pedido_id
--               en solicitudes + RPC buscar trabajador por nombre
-- ============================================================

-- ============================================================
-- A. TABLA pedidos
--    Agrupa múltiples ítems (solicitudes) bajo un mismo pedido
--    identificado con un número correlativo para reportería.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.pedidos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    nro_correlativo INTEGER GENERATED ALWAYS AS IDENTITY NOT NULL, -- número visible para reportería
    solicitante_id UUID NOT NULL REFERENCES public.usuarios (id),
    trabajador_id UUID NOT NULL REFERENCES public.usuarios (id),
    motivo TEXT,
    estado TEXT NOT NULL DEFAULT 'pendiente', -- estado consolidado (informativo)
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_pedidos_nro ON public.pedidos (nro_correlativo);

CREATE INDEX IF NOT EXISTS idx_pedidos_trabajador ON public.pedidos (trabajador_id);

CREATE INDEX IF NOT EXISTS idx_pedidos_solicitante ON public.pedidos (solicitante_id);

CREATE INDEX IF NOT EXISTS idx_pedidos_created_at ON public.pedidos (created_at DESC);

COMMENT ON
TABLE public.pedidos IS 'Agrupa ítems de una misma solicitud. nro_correlativo identifica el pedido en reportes.';

COMMENT ON COLUMN public.pedidos.nro_correlativo IS 'Número secuencial visible: Pedido #1, #2, ...';

-- Trigger updated_at
CREATE TRIGGER trg_pedidos_updated_at
  BEFORE UPDATE ON public.pedidos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- B. Columna pedido_id en solicitudes
--    Vincula cada ítem de solicitud con su pedido padre.
-- ============================================================

ALTER TABLE public.solicitudes
ADD COLUMN IF NOT EXISTS pedido_id UUID REFERENCES public.pedidos (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_solicitudes_pedido ON public.solicitudes (pedido_id);

COMMENT ON COLUMN public.solicitudes.pedido_id IS 'Referencia al pedido que agrupa este ítem.';

-- ============================================================
-- C. RPC: buscar_trabajador_por_nombre
--    Devuelve trabajadores cuyo nombre contiene la cadena buscada.
--    Usado para búsqueda de funcionario por nombre en el formulario.
-- ============================================================

-- DROP preventivo por si existía una versión anterior con distinta firma
DROP FUNCTION IF EXISTS public.buscar_trabajador_por_nombre(TEXT);

CREATE OR REPLACE FUNCTION public.buscar_trabajador_por_nombre(p_nombre TEXT)
RETURNS TABLE (
  id       UUID,
  rut      VARCHAR(12),
  nombre   TEXT,
  servicio TEXT,
  rol      public.rol_usuario,
  activo   BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT u.id, u.rut, u.nombre, u.servicio, u.rol, u.activo
  FROM public.usuarios u
  WHERE u.activo = TRUE
    AND u.nombre ILIKE '%' || TRIM(p_nombre) || '%'
  ORDER BY u.nombre
  LIMIT 8;
END;
$$;

GRANT
EXECUTE ON FUNCTION public.buscar_trabajador_por_nombre (TEXT) TO authenticated;

-- ============================================================
-- D. Modificar buscar_trabajador_por_rut para incluir rut en respuesta
--    (necesario para mostrar RUT del trabajador encontrado)
-- ============================================================

-- DROP requerido porque cambia el tipo de retorno (se agrega columna rut)
DROP FUNCTION IF EXISTS public.buscar_trabajador_por_rut (TEXT);

CREATE OR REPLACE FUNCTION public.buscar_trabajador_por_rut(p_rut TEXT)
RETURNS TABLE (
  id       UUID,
  rut      VARCHAR(12),
  nombre   TEXT,
  servicio TEXT,
  rol      public.rol_usuario,
  activo   BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT u.id, u.rut, u.nombre, u.servicio, u.rol, u.activo
  FROM public.usuarios u
  WHERE u.rut = TRIM(p_rut)
  LIMIT 1;
END;
$$;

GRANT
EXECUTE ON FUNCTION public.buscar_trabajador_por_rut (TEXT) TO authenticated;

-- ============================================================
-- E. RLS para tabla pedidos
--    Misma política que solicitudes: usuario autenticado puede
--    leer/insertar sus propios pedidos.
-- ============================================================

ALTER TABLE public.pedidos ENABLE ROW LEVEL SECURITY;

-- Un usuario puede ver pedidos donde es solicitante o trabajador
CREATE POLICY pedidos_select ON public.pedidos FOR
SELECT TO authenticated USING (
        solicitante_id = auth.uid ()
        OR trabajador_id = auth.uid ()
        OR EXISTS (
            SELECT 1
            FROM public.usuarios
            WHERE
                id = auth.uid ()
                AND rol IN (
                    'tens', 'prevencionista', 'administrador'
                )
        )
    );

-- Solo usuarios autenticados pueden insertar sus propios pedidos
CREATE POLICY pedidos_insert ON public.pedidos FOR
INSERT
    TO authenticated
WITH
    CHECK (solicitante_id = auth.uid ());

-- Solo roles privilegiados pueden actualizar
CREATE POLICY pedidos_update ON public.pedidos FOR
UPDATE TO authenticated USING (
    EXISTS (
        SELECT 1
        FROM public.usuarios
        WHERE
            id = auth.uid ()
            AND rol IN (
                'tens',
                'prevencionista',
                'administrador'
            )
    )
);