"use client";
/**
 * components/trabajador/MisRecepciones.jsx
 *
 * Componente compartido por TODOS los roles (trabajador, jefatura, tens, prevencionista).
 * Muestra las entregas con estado "despachada" asignadas al usuario actual
 * y permite confirmar la recepción con un botón destacado.
 *
 * Modo "compact": vista reducida para embeber en un dashboard mayor.
 * Modo normal: vista de pantalla completa para el rol trabajador.
 */
import { useEffect, useState, useCallback, startTransition } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import Badge from "@/components/ui/Badge";
import Alert from "@/components/ui/Alert";

const fmt = (iso) =>
    iso
        ? new Intl.DateTimeFormat("es-CL", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        }).format(new Date(iso))
        : "—";

export default function MisRecepciones({ compact = false }) {
    const { perfil } = useAuth();

    const [pendientes, setPendientes] = useState([]); // despachadas sin recibir
    const [loading, setLoading] = useState(true);
    const [feedback, setFeedback] = useState(null);
    const [confirmando, setConfirmando] = useState(null); // id en proceso

    const perfilId = perfil?.id;
    const cargar = useCallback(async () => {
        if (!perfilId) return;
        setLoading(true);

        // Solicitudes despachadas para mí
        const { data: desp } = await supabase
            .from("solicitudes")
            .select(
                `
        id, estado, cantidad, created_at, updated_at,
        insumo:insumos(nombre, unidad_medida),
        solicitante:usuarios!solicitudes_solicitante_id_fkey(nombre)
      `,
            )
            .eq("trabajador_id", perfilId)
            .eq("estado", "despachada")
            .order("updated_at", { ascending: false });

        setPendientes(desp ?? []);
        setLoading(false);
    }, [perfilId]);

    useEffect(() => {
        startTransition(cargar);

        const channel = supabase
            .channel(`recepciones-${perfilId}`)
            .on(
                "postgres_changes",
                {
                    event: "*",
                    schema: "public",
                    table: "solicitudes",
                    filter: `trabajador_id=eq.${perfilId}`,
                },
                cargar,
            )
            .subscribe();

        return () => supabase.removeChannel(channel);
    }, [cargar, perfilId]);

    // ── Confirmar recepción ───────────────────────────────────
    const confirmar = async (solicitud) => {
        setFeedback(null);
        setConfirmando(solicitud.id);

        const { error } = await supabase.rpc("confirmar_recepcion", {
            p_solicitud_id: solicitud.id,
            p_trabajador_id: perfil.id,
        });

        setConfirmando(null);

        if (error) {
            setFeedback({ type: "error", message: `Error: ${error.message}` });
        } else {
            setFeedback({
                type: "success",
                message: `✅ Recepción de "${solicitud.insumo?.nombre}" confirmada.`,
            });
            cargar();
        }
    };

    // ────────────────────────────────────────────────────────
    if (loading) {
        return (
            <div className="flex items-center justify-center py-10">
                <span className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mr-2" />
                <span className="text-slate-400 text-sm">Cargando recepciones…</span>
            </div>
        );
    }

    // ── Vista COMPACTA (para embeber en otros dashboards) ──
    if (compact) {
        return (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-slate-800">
                            Mis Recepciones Pendientes
                        </h3>
                        {pendientes.length > 0 && (
                            <span className="text-xs bg-purple-100 text-purple-700 border border-purple-200 px-2 py-0.5 rounded-full font-medium">
                                {pendientes.length}
                            </span>
                        )}
                    </div>
                    <button
                        onClick={cargar}
                        className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition text-xs"
                    >
                        ↻ Actualizar
                    </button>
                </div>

                {feedback && (
                    <div className="px-5 pt-3">
                        <Alert
                            type={feedback.type}
                            message={feedback.message}
                            onClose={() => setFeedback(null)}
                        />
                    </div>
                )}

                {pendientes.length === 0 ? (
                    <p className="px-5 py-8 text-center text-slate-400 text-sm">
                        No tienes entregas pendientes de confirmación.
                    </p>
                ) : (
                    <ul className="divide-y divide-slate-50">
                        {pendientes.map((s) => (
                            <li
                                key={s.id}
                                className="flex items-center justify-between gap-4 px-5 py-3"
                            >
                                <div className="min-w-0">
                                    <p className="font-medium text-slate-800 truncate">
                                        {s.insumo?.nombre}
                                    </p>
                                    <p className="text-xs text-slate-500">
                                        {s.cantidad} {s.insumo?.unidad_medida} · despachado{" "}
                                        {fmt(s.updated_at)}
                                    </p>
                                </div>
                                <button
                                    onClick={() => confirmar(s)}
                                    disabled={confirmando === s.id}
                                    className="shrink-0 px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold
                             rounded-xl transition disabled:opacity-60 flex items-center gap-1.5"
                                >
                                    {confirmando === s.id ? (
                                        <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                    ) : (
                                        "✓ Recibido"
                                    )}
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        );
    }

    // ── Vista COMPLETA (rol trabajador) ────────────────────────
    return (
        <div className="space-y-6 max-w-2xl mx-auto">
            {feedback && (
                <Alert
                    type={feedback.type}
                    message={feedback.message}
                    onClose={() => setFeedback(null)}
                />
            )}

            {/* Cabecera */}
            <div>
                <h2 className="text-xl font-bold text-slate-800">
                    Mi bandeja de recepciones
                </h2>
                <p className="text-slate-500 text-sm mt-0.5">
                    Confirma los insumos que has recibido físicamente.
                </p>
            </div>

            {/* Entregas pendientes */}
            <div>
                <h3 className="text-sm font-semibold text-slate-700 mb-3 uppercase tracking-wider">
                    Pendientes de confirmar
                </h3>
                {pendientes.length === 0 ? (
                    <div className="bg-white rounded-2xl border-2 border-dashed border-slate-200 p-10 text-center">
                        <p className="text-3xl mb-2">📭</p>
                        <p className="text-slate-500">
                            No tienes entregas pendientes de confirmación.
                        </p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {pendientes.map((s) => (
                            <div
                                key={s.id}
                                className="bg-white rounded-2xl border-2 border-purple-100 shadow-sm p-5
                           flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                            >
                                <div>
                                    <div className="flex items-center gap-2 mb-1">
                                        <Badge estado="despachada" />
                                        <span className="text-xs text-slate-400">
                                            {fmt(s.updated_at)}
                                        </span>
                                    </div>
                                    <p className="text-lg font-bold text-slate-800">
                                        {s.insumo?.nombre}
                                    </p>
                                    <p className="text-slate-500 text-sm">
                                        {s.cantidad} {s.insumo?.unidad_medida}
                                        {s.solicitante &&
                                            ` · Solicitado por ${s.solicitante.nombre}`}
                                    </p>
                                </div>

                                {/* Botón grande de confirmación */}
                                <button
                                    onClick={() => confirmar(s)}
                                    disabled={confirmando === s.id}
                                    className="w-full sm:w-auto px-6 py-4 bg-green-600 hover:bg-green-700 active:scale-95
                             text-white text-base font-bold rounded-2xl shadow-md transition
                             disabled:opacity-60 flex items-center justify-center gap-2 min-w-45"
                                >
                                    {confirmando === s.id ? (
                                        <>
                                            <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                            Confirmando…
                                        </>
                                    ) : (
                                        <>✅ Confirmar Recepción</>
                                    )}
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>


        </div>
    );
}
