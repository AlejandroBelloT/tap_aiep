'use client';
/**
 * components/tens/IngresarStock.jsx
 * Formulario para registrar entrada de nuevos insumos al inventario.
 * Llama al RPC registrar_ingreso_stock de Supabase.
 */
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import Alert from '@/components/ui/Alert';

export default function IngresarStock({ insumo, onSuccess, onClose }) {
    const { perfil } = useAuth();

    const [cantidad, setCantidad] = useState('');
    const [observaciones, setObservaciones] = useState('');
    const [loading, setLoading] = useState(false);
    const [feedback, setFeedback] = useState(null); // { type, message }

    const handleSubmit = async (e) => {
        e.preventDefault();
        setFeedback(null);

        const qty = parseInt(cantidad, 10);
        if (!qty || qty <= 0) {
            setFeedback({ type: 'error', message: 'Ingresa una cantidad válida mayor a 0.' });
            return;
        }

        setLoading(true);

        const { data, error } = await supabase.rpc('registrar_ingreso_stock', {
            p_insumo_id: insumo.id,
            p_cantidad: qty,
            p_usuario_id: perfil.id,
            p_observaciones: observaciones || null,
        });

        setLoading(false);

        if (error) {
            setFeedback({ type: 'error', message: `Error: ${error.message}` });
            return;
        }

        setFeedback({
            type: 'success',
            message: `Stock actualizado: ${data.stock_anterior} → ${data.stock_nuevo} unidades.`,
        });

        setCantidad('');
        setObservaciones('');
        onSuccess?.();
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">

            {/* Insumo seleccionado (solo lectura) */}
            <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                <p className="text-xs text-slate-500 font-medium mb-1">Insumo</p>
                <p className="font-semibold text-slate-800">{insumo.nombre}</p>
                <div className="flex items-center gap-4 mt-2 text-sm text-slate-600">
                    <span>Stock actual: <strong>{insumo.stock_actual}</strong></span>
                    <span className="text-slate-300">|</span>
                    <span>Unidad: <strong>{insumo.unidad_medida}</strong></span>
                </div>
            </div>

            {/* Cantidad */}
            <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                    Cantidad a ingresar <span className="text-red-500">*</span>
                </label>
                <input
                    type="number"
                    min={1}
                    value={cantidad}
                    onChange={(e) => setCantidad(e.target.value)}
                    disabled={loading}
                    className="w-full px-4 py-2.5 rounded-lg border border-slate-300 text-slate-800
                     focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent
                     disabled:bg-slate-50 transition"
                    placeholder="Ej: 50"
                    required
                />
            </div>

            {/* Observaciones */}
            <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                    Observaciones <span className="text-slate-400 font-normal">(opcional)</span>
                </label>
                <textarea
                    value={observaciones}
                    onChange={(e) => setObservaciones(e.target.value)}
                    disabled={loading}
                    rows={2}
                    className="w-full px-4 py-2.5 rounded-lg border border-slate-300 text-slate-800 resize-none
                     focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent
                     disabled:bg-slate-50 transition text-sm"
                    placeholder="Proveedor, número de factura, lote, etc."
                />
            </div>

            {/* Feedback */}
            {feedback && (
                <Alert
                    type={feedback.type}
                    message={feedback.message}
                    onClose={() => setFeedback(null)}
                />
            )}

            {/* Acciones */}
            <div className="flex items-center gap-3 pt-2">
                <button
                    type="submit"
                    disabled={loading}
                    className="flex-1 py-2.5 bg-green-600 hover:bg-green-700 text-white font-semibold
                     rounded-lg transition disabled:opacity-60 flex items-center justify-center gap-2"
                >
                    {loading ? (
                        <>
                            <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            Registrando…
                        </>
                    ) : '📦 Registrar Ingreso'}
                </button>
                <button
                    type="button"
                    onClick={onClose}
                    disabled={loading}
                    className="px-5 py-2.5 rounded-lg border border-slate-200 text-slate-600
                     hover:bg-slate-50 transition text-sm font-medium"
                >
                    Cancelar
                </button>
            </div>
        </form>
    );
}
