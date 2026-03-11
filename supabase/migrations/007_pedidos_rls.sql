-- ============================================================
-- MIGRACIÓN 007: RLS para tabla pedidos
-- La tabla pedidos no tenía RLS habilitado, lo que impedía
-- que jefatura/prevencionista pudieran INSERT/SELECT en ella.
-- ============================================================

-- Habilitar RLS
ALTER TABLE public.pedidos ENABLE ROW LEVEL SECURITY;

-- GRANT directo por si los default privileges no cubren la tabla
GRANT SELECT, INSERT , UPDATE ON public.pedidos TO authenticated;

-- ── SELECT: gestores ven todos; jefatura/prev ven los suyos ──
DROP POLICY IF EXISTS "pedidos_select" ON public.pedidos;

CREATE POLICY "pedidos_select" ON public.pedidos FOR
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

-- ── INSERT: jefatura, prevencionista y admin pueden crear pedidos ──
DROP POLICY IF EXISTS "pedidos_insert" ON public.pedidos;

CREATE POLICY "pedidos_insert" ON public.pedidos FOR
INSERT
    TO authenticated
WITH
    CHECK (
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
    );

-- ── UPDATE: solo gestores (para marcar estado consolidado) ──
DROP POLICY IF EXISTS "pedidos_update_gestores" ON public.pedidos;

CREATE POLICY "pedidos_update_gestores" ON public.pedidos FOR
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