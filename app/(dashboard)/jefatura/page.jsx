'use client';
/**
 * app/(dashboard)/jefatura/page.jsx
 *
 * Dashboard Jefatura — navegación por ?tab=
 *   inicio           → resumen con tarjetas
 *   nueva             → FormCrearSolicitud (para cualquier trabajador o sí mismo)
 *   mis-solicitudes   → TablaMisSolicitudes (solicitudes asignadas a él como receptor)
 *   recepciones       → MisRecepciones (insumos que él mismo debe confirmar)
 */
import { useState, useEffect, useCallback, startTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import StatsCard from '@/components/ui/StatsCard';
import FormCrearSolicitud from '@/components/jefatura/FormCrearSolicitud';
import TablaMisSolicitudes from '@/components/jefatura/TablaMisSolicitudes';
import MisRecepciones from '@/components/trabajador/MisRecepciones';

const SECCION_LABEL = {
    inicio: { icon: '🏠', label: 'Inicio' },
    nueva: { icon: '➕', label: 'Crear Solicitud de Insumos' },
    'mis-solicitudes': { icon: '📄', label: 'Mis Solicitudes' },
    recepciones: { icon: '✅', label: 'Mis Recepciones' },
};

export default function JefaturaDashboard() {
    const { perfil } = useAuth();
    const router = useRouter();
    const searchParams = useSearchParams();
    const [tabActiva, setTabActiva] = useState(() => searchParams.get('tab') ?? 'inicio');

    useEffect(() => {
        const t = searchParams.get('tab') ?? 'inicio';
        startTransition(() => setTabActiva(t));
    }, [searchParams]);

    const cambiarTab = (id) => router.push(`/jefatura?tab=${id}`, { scroll: false });

    const [stats, setStats] = useState({ pendientes: 0, autorizadas: 0, despachadas: 0, recibidas: 0 });

    const cargarStats = useCallback(async () => {
        if (!perfil?.id) return;
        const resultados = await Promise.all(
            ['pendiente', 'autorizada', 'despachada', 'recibida'].map(estado =>
                supabase.from('solicitudes')
                    .select('*', { count: 'exact', head: true })
                    .eq('solicitante_id', perfil.id)
                    .eq('estado', estado)
            )
        );
        startTransition(() => setStats({
            pendientes: resultados[0].count ?? 0,
            autorizadas: resultados[1].count ?? 0,
            despachadas: resultados[2].count ?? 0,
            recibidas: resultados[3].count ?? 0,
        }));
    }, [perfil?.id]);

    useEffect(() => {
        startTransition(cargarStats);
        const iv = setInterval(cargarStats, 30_000);
        return () => clearInterval(iv);
    }, [cargarStats]);

    const seccion = SECCION_LABEL[tabActiva] ?? SECCION_LABEL.inicio;

    return (
        <div className="space-y-6">
            {/* Cabecera */}
            <div>
                <h1 className="text-2xl font-bold text-slate-800">
                    {perfil?.nombre ?? 'Jefatura'}
                </h1>
                <p className="text-slate-500 text-sm mt-0.5">
                    {new Date().toLocaleDateString('es-CL', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                </p>
            </div>

            {/* Barra de sección activa */}
            {tabActiva !== 'inicio' && (
                <div className="flex items-center gap-3 pb-2 border-b border-slate-200">
                    <span className="text-xl">{seccion.icon}</span>
                    <h2 className="text-lg font-semibold text-slate-800">{seccion.label}</h2>
                </div>
            )}

            {/* ── INICIO ── */}
            {tabActiva === 'inicio' && (
                <div className="space-y-6">
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        <StatsCard label="Pendientes" value={stats.pendientes} icon="⏳" color="amber"
                            onClick={() => cambiarTab('mis-solicitudes')} />
                        <StatsCard label="Autorizadas" value={stats.autorizadas} icon="✓" color="blue"
                            onClick={() => cambiarTab('mis-solicitudes')} />
                        <StatsCard label="Despachadas" value={stats.despachadas} icon="🚀" color="purple"
                            onClick={() => cambiarTab('recepciones')} />
                        <StatsCard label="Recibidas" value={stats.recibidas} icon="✅" color="green"
                            onClick={() => cambiarTab('recepciones')} />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <button onClick={() => cambiarTab('nueva')}
                            className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm
                             hover:shadow-md hover:border-blue-100 transition text-left group">
                            <div className="text-3xl mb-2">➕</div>
                            <p className="font-semibold text-slate-800 group-hover:text-blue-600 transition">Crear Solicitud</p>
                            <p className="text-xs text-slate-500 mt-1">Solicitar insumos para un trabajador o para ti mismo</p>
                        </button>
                        <button onClick={() => cambiarTab('mis-solicitudes')}
                            className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm
                             hover:shadow-md hover:border-blue-100 transition text-left group">
                            <div className="text-3xl mb-2">📄</div>
                            <p className="font-semibold text-slate-800 group-hover:text-blue-600 transition">Mis Solicitudes</p>
                            <p className="text-xs text-slate-500 mt-1">
                                {stats.pendientes + stats.autorizadas > 0
                                    ? `${stats.pendientes + stats.autorizadas} solicitud(es) activa(s)`
                                    : 'Ver historial de solicitudes creadas'}
                            </p>
                        </button>
                    </div>
                </div>
            )}

            {/* ── NUEVA SOLICITUD ── */}
            {tabActiva === 'nueva' && (
                <div className="max-w-lg">
                    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
                        <h2 className="font-semibold text-slate-800 mb-5 flex items-center gap-2">
                            <span className="w-7 h-7 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center text-sm">➕</span>
                            Crear nueva solicitud de insumos
                        </h2>
                        <FormCrearSolicitud
                            mostrarStock={false}
                            onSuccess={() => { cargarStats(); cambiarTab('mis-solicitudes'); }}
                        />
                    </div>
                </div>
            )}

            {/* ── MIS SOLICITUDES ── */}
            {tabActiva === 'mis-solicitudes' && <TablaMisSolicitudes filtrarPor="trabajador_id" />}

            {/* ── RECEPCIONES ── */}
            {tabActiva === 'recepciones' && <MisRecepciones compact={false} />}
        </div>
    );
}
