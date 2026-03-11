-- ============================================================
-- MIGRACIÓN 005: Corregir RLS para permitir recepción de compras
-- El solicitante (TENS/Prevencionista) necesita poder actualizar
-- una solicitud aprobada para marcarla como recibida.
-- ============================================================

-- Reemplazar la política de UPDATE que solo permitía estado='pendiente'
DROP POLICY IF EXISTS "compras_update_admin" ON public.solicitudes_compra;

CREATE POLICY "compras_update_admin" ON public.solicitudes_compra FOR
UPDATE TO authenticated USING (
    -- Administrador puede actualizar cualquier solicitud (antes del cambio)
    (
        SELECT rol
        FROM public.usuarios
        WHERE
            id = auth.uid ()
    ) = 'administrador'
    OR (
        -- TENS/Prevencionista puede actualizar sus propias solicitudes en estado editable
        solicitante_id = auth.uid ()
        AND estado IN ('pendiente', 'aprobada')
        AND (
            SELECT rol
            FROM public.usuarios
            WHERE
                id = auth.uid ()
        ) IN ('tens', 'prevencionista')
    )
)
WITH
    CHECK (
        -- Administrador puede dejar la fila en cualquier estado
        (
            SELECT rol
            FROM public.usuarios
            WHERE
                id = auth.uid ()
        ) = 'administrador'
        OR (
            -- TENS/Prevencionista: la fila resultante debe seguir siendo suya
            -- y puede quedar en cualquier estado válido (pendiente, aprobada, recibida, rechazada)
            solicitante_id = auth.uid ()
            AND (
                SELECT rol
                FROM public.usuarios
                WHERE
                    id = auth.uid ()
            ) IN ('tens', 'prevencionista')
        )
    );