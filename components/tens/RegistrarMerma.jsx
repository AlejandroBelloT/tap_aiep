'use client';
/**
 * components/tens/RegistrarMerma.jsx
 * Formulario para registrar pérdida, deterioro o baja de insumos.
 * Llama al RPC registrar_merma de Supabase.
 */
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import Alert from '@/components/ui/Alert';

export default function RegistrarMerma({ insumo, onSuccess, onClose }) {
    const { perfil } = useAuth();

    const [cantidad, setCantidad] = useState('');
    const [observaciones, setObservaciones] = useState('');
    const [loading, setLoading] = useState(false);
    const [feedback, setFeedback] = useState(null);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setFeedback(null);

        const qty = parseInt(cantidad, 10);
        if (!qty || qty <= 0) {
            setFeedback({ type: 'error', message: 'Ingresa una cantidad válida mayor a 0.' });
            return;
        }

        if (qty > insumo.stock_actual) {
            setFeedback({
                type: 'error',
                message: `La merma (${qty}) supera el stock actual (${insumo.stock_actual}).`,
            });
            return;
        }

        if (!observaciones.trim()) {
            setFeedback({ type: 'warning', message: 'Las observaciones son obligatorias para registrar una merma.' });
            return;
        }

        setLoading(true);

        const { data, error } = await supabase.rpc('registrar_merma', {
            p_insumo_id: insumo.id,
            p_cantidad: qty,
            p_usuario_id: perfil.id,
            p_observaciones: observaciones,
        });

        setLoading(false);

        if (error) {
            setFeedback({ type: 'error', message: `Error: ${error.message}` });
            return;
        }

        setCantidad('');
        setObservaciones('');
        onSuccess?.();

        // Mostrar feedback brevemente y luego cerrar el formulario
        setFeedback({
            type: 'success',
            message: `Merma registrada. Stock: ${data.stock_anterior} → ${data.stock_nuevo} unidades.`,
        });
        setTimeout(() => {
            onClose?.();
        }, 1800);
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">

            {/* Insumo (solo lectura) */}
            <div className="bg-red-50 rounded-xl p-4 border border-red-100">
                <p className="text-xs text-red-500 font-medium mb-1">Registrando merma para</p>
                <p className="font-semibold text-slate-800">{insumo.nombre}</p>
                <div className="flex items-center gap-4 mt-2 text-sm text-slate-600">
                    <span>Stock actual: <strong className={insumo.stock_actual <= insumo.stock_minimo ? 'text-orange-600' : ''}>{insumo.stock_actual}</strong></span>
                    <span className="text-slate-300">|</span>
                    <span>Mínimo: <strong>{insumo.stock_minimo}</strong></span>
                </div>
            </div>

            {/* Cantidad */}
            <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                    Cantidad a dar de baja <span className="text-red-500">*</span>
                </label>
                <input
                    type="number"
                    min={1}
                    max={insumo.stock_actual}
                    value={cantidad}
                    onChange={(e) => setCantidad(e.target.value)}
                    disabled={loading}
                    className="w-full px-4 py-2.5 rounded-lg border border-slate-300 text-slate-800
                     focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent
                     disabled:bg-slate-50 transition"
                    placeholder={`Máx. ${insumo.stock_actual}`}
                    required
                />
            </div>

            {/* Observaciones obligatorias */}
            <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                    Motivo / Observaciones <span className="text-red-500">*</span>
                </label>
                <textarea
                    value={observaciones}
                    onChange={(e) => setObservaciones(e.target.value)}
                    disabled={loading}
                    rows={3}
                    className="w-full px-4 py-2.5 rounded-lg border border-slate-300 text-slate-800 resize-none
                     focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent
                     disabled:bg-slate-50 transition text-sm"
                    placeholder="Describe el motivo: vencimiento, rotura, deterioro, pérdida…"
                    required
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
                    className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white font-semibold
                     rounded-lg transition disabled:opacity-60 flex items-center justify-center gap-2"
                >
                    {loading ? (
                        <>
                            <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            Registrando…
                        </>
                    ) : '🗑️ Confirmar Merma'}
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
