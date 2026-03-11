-- ============================================================
-- MIGRACIÓN 003: Solicitudes de Compra a Proveedor
-- Permite a TENS y Prevencionista solicitar compra de insumos.
-- El Administrador revisa, aprueba o rechaza cada solicitud.
-- ============================================================

-- 1. Tipo ENUM para el estado
DO $$ BEGIN
  CREATE TYPE public.estado_compra AS ENUM ('pendiente', 'aprobada', 'rechazada');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. Tipo ENUM para la urgencia
DO $$ BEGIN
  CREATE TYPE public.urgencia_compra AS ENUM ('normal', 'urgente', 'critico');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 3. Tabla principal
CREATE TABLE IF NOT EXISTS public.solicitudes_compra (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    nro_solicitud INTEGER GENERATED ALWAYS AS IDENTITY NOT NULL,
    solicitante_id UUID NOT NULL REFERENCES public.usuarios (id),
    estado public.estado_compra NOT NULL DEFAULT 'pendiente',
    urgencia public.urgencia_compra NOT NULL DEFAULT 'normal',
    proveedor_sugerido TEXT,
    justificacion TEXT NOT NULL,
    items JSONB NOT NULL DEFAULT '[]',
    -- items formato:
    -- [{ "nombre": "...", "codigo": "...", "cantidad": 10,
    --    "unidad_medida": "caja", "precio_estimado": 5000 }]
    observaciones_admin TEXT,
    revisado_por UUID REFERENCES public.usuarios (id),
    fecha_revision TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_solicitudes_compra_nro ON public.solicitudes_compra (nro_solicitud);

CREATE INDEX IF NOT EXISTS idx_solicitudes_compra_estado ON public.solicitudes_compra (estado);

CREATE INDEX IF NOT EXISTS idx_solicitudes_compra_solicitante ON public.solicitudes_compra (solicitante_id);

CREATE INDEX IF NOT EXISTS idx_solicitudes_compra_created ON public.solicitudes_compra (created_at DESC);

COMMENT ON
TABLE public.solicitudes_compra IS 'Solicitudes de compra de insumos a proveedores, emitidas por TENS/Prevencionista y aprobadas por Administrador';

COMMENT ON COLUMN public.solicitudes_compra.nro_solicitud IS 'Número correlativo visible: SC-001, SC-002, …';

COMMENT ON COLUMN public.solicitudes_compra.items IS 'Array JSONB con los ítems a comprar: nombre, codigo, cantidad, unidad_medida, precio_estimado';

-- 4. Trigger updated_at
DO $$ BEGIN
  CREATE TRIGGER trg_solicitudes_compra_updated_at
    BEFORE UPDATE ON public.solicitudes_compra
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- 5. ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE public.solicitudes_compra ENABLE ROW LEVEL SECURITY;

-- TENS y Prevencionista pueden VER TODAS las solicitudes (para seguimiento)
-- Admin puede ver todas
DROP POLICY IF EXISTS "compras_select_gestores" ON public.solicitudes_compra;

CREATE POLICY "compras_select_gestores" ON public.solicitudes_compra FOR
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

-- TENS y Prevencionista pueden CREAR sus propias solicitudes
DROP POLICY IF EXISTS "compras_insert_gestores" ON public.solicitudes_compra;

CREATE POLICY "compras_insert_gestores" ON public.solicitudes_compra FOR
INSERT
    TO authenticated
WITH
    CHECK (
        (
            SELECT rol
            FROM public.usuarios
            WHERE
                id = auth.uid ()
        ) IN ('tens', 'prevencionista')
        AND solicitante_id = auth.uid ()
    );

-- Solo el Admin puede UPDATE (aprobar / rechazar)
-- También el solicitante puede actualizar SU solicitud si está pendiente
DROP POLICY IF EXISTS "compras_update_admin" ON public.solicitudes_compra;

CREATE POLICY "compras_update_admin" ON public.solicitudes_compra FOR
UPDATE TO authenticated USING (
    (
        SELECT rol
        FROM public.usuarios
        WHERE
            id = auth.uid ()
    ) = 'administrador'
    OR (
        solicitante_id = auth.uid ()
        AND estado = 'pendiente'
        AND (
            SELECT rol
            FROM public.usuarios
            WHERE
                id = auth.uid ()
        ) IN ('tens', 'prevencionista')
    )
);

-- Solo Admin puede eliminar (soft delete no implementado aquí)
DROP POLICY IF EXISTS "compras_delete_admin" ON public.solicitudes_compra;

CREATE POLICY "compras_delete_admin" ON public.solicitudes_compra FOR DELETE TO authenticated USING (
    (
        SELECT rol
        FROM public.usuarios
        WHERE
            id = auth.uid ()
    ) = 'administrador'
);