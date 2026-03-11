-- ============================================================
-- MIGRACIÓN 006: Asegurar que registrar_merma inserte movimiento
-- En versiones anteriores la función podía no registrar el
-- movimiento en movimientos_stock. Esta versión es definitiva.
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
SET search_path = public
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

  -- Descontar stock
  UPDATE public.insumos
  SET
    stock_actual = stock_actual - p_cantidad,
    updated_at   = NOW()
  WHERE id = p_insumo_id;

  -- Registrar movimiento (SIEMPRE, en la misma transacción)
  INSERT INTO public.movimientos_stock (
    insumo_id,
    tipo,
    cantidad,
    stock_anterior,
    stock_nuevo,
    usuario_id,
    observaciones
  ) VALUES (
    p_insumo_id,
    'merma',
    p_cantidad,
    v_insumo.stock_actual,
    v_insumo.stock_actual - p_cantidad,
    p_usuario_id,
    COALESCE(NULLIF(TRIM(p_observaciones), ''), 'Merma registrada')
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

-- Asegurar que el RPC sea ejecutable por usuarios autenticados
GRANT
EXECUTE ON FUNCTION public.registrar_merma (UUID, INTEGER, UUID, TEXT) TO authenticated;