-- ============================================================
-- MIGRACIÓN 004: Recepción de Compras
-- Agrega soporte para que TENS/Prevencionista registren
-- la recepción física de los insumos de una solicitud aprobada.
-- ============================================================

-- 1. Agregar valor 'recibida' al ENUM estado_compra (si no existe)
DO $$ BEGIN
  ALTER TYPE public.estado_compra ADD VALUE IF NOT EXISTS 'recibida';
EXCEPTION WHEN others THEN NULL;
END $$;

-- 2. Nuevas columnas en solicitudes_compra
ALTER TABLE public.solicitudes_compra
ADD COLUMN IF NOT EXISTS fecha_recepcion TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS recibido_por UUID REFERENCES public.usuarios (id),
ADD COLUMN IF NOT EXISTS items_recibidos JSONB;
-- items_recibidos formato:
-- [{ "nombre": "...", "codigo": "...", "cantidad_solicitada": 10,
--    "cantidad_recibida": 8, "unidad_medida": "caja" }]

COMMENT ON COLUMN public.solicitudes_compra.fecha_recepcion IS 'Fecha en que se recibieron físicamente los insumos';

COMMENT ON COLUMN public.solicitudes_compra.recibido_por IS 'Usuario que registró la recepción';

COMMENT ON COLUMN public.solicitudes_compra.items_recibidos IS 'Cantidades realmente recibidas por ítem (puede diferir de items)';

-- 3. Índice para filtrar recepciones pendientes
CREATE INDEX IF NOT EXISTS idx_solicitudes_compra_recepcion ON public.solicitudes_compra (solicitante_id, estado)
WHERE
    estado = 'aprobada'
    AND fecha_recepcion IS NULL;