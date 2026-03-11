'use client';
/**
 * app/(dashboard)/trabajador/page.jsx
 *
 * Dashboard Trabajador — navegación por ?tab=
 *   inicio          → resumen con tarjetas y accesos rápidos
 *   recepciones     → MisRecepciones (confirmar entregas despachadas)
 *   mis-solicitudes → TablaMisSolicitudes (ver solicitudes hechas por jefatura/prev para él)
 *
 * El trabajador NO puede crear solicitudes; las crea jefatura o prevencionista.
 */
import { useEffect, useState, useCallback, startTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import StatsCard from '@/components/ui/StatsCard';
import MisRecepciones from '@/components/trabajador/MisRecepciones';
import TablaMisSolicitudes from '@/components/jefatura/TablaMisSolicitudes';

const SECCION_LABEL = {
    inicio: { icon: '🏠', label: 'Inicio' },
    recepciones: { icon: '📬', label: 'Mis Recepciones' },
    'mis-solicitudes': { icon: '📄', label: 'Mis Solicitudes' },
};

export default function TrabajadorDashboard() {
    const { perfil } = useAuth();
    const router = useRouter();
    const searchParams = useSearchParams();
    const [tabActiva, setTabActiva] = useState(() => searchParams.get('tab') ?? 'inicio');

    useEffect(() => {
        const t = searchParams.get('tab') ?? 'inicio';
        startTransition(() => setTabActiva(t));
    }, [searchParams]);

    const cambiarTab = (id) => router.push(`/trabajador?tab=${id}`, { scroll: false });

    /* ── Stats ─────────────────────────────────────────────── */
    const [stats, setStats] = useState({ despachadas: 0, recibidas: 0, enCurso: 0 });

    const cargarStats = useCallback(async () => {
        if (!perfil?.id) return;
        const [
            { count: despachadas },
            { count: recibidas },
            { count: enCurso },
        ] = await Promise.all([
            supabase.from('solicitudes').select('*', { count: 'exact', head: true })
                .eq('trabajador_id', perfil.id).eq('estado', 'despachada'),
            supabase.from('solicitudes').select('*', { count: 'exact', head: true })
                .eq('trabajador_id', perfil.id).eq('estado', 'recibida'),
            supabase.from('solicitudes').select('*', { count: 'exact', head: true })
                .eq('trabajador_id', perfil.id).in('estado', ['pendiente', 'autorizada']),
        ]);
        startTransition(() => setStats({
            despachadas: despachadas ?? 0,
            recibidas: recibidas ?? 0,
            enCurso: enCurso ?? 0,
        }));
    }, [perfil?.id]);

    useEffect(() => {
        startTransition(cargarStats);
        const channel = supabase
            .channel(`stats-trabajador-${perfil?.id}`)
            .on('postgres_changes', {
                event: '*', schema: 'public', table: 'solicitudes',
                filter: `trabajador_id=eq.${perfil?.id}`,
            }, cargarStats)
            .subscribe();
        return () => supabase.removeChannel(channel);
    }, [cargarStats, perfil?.id]);

    const seccion = SECCION_LABEL[tabActiva] ?? SECCION_LABEL.inicio;

    return (
        <div className="space-y-6">
            {/* Cabecera */}
            <div className="flex items-start justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800">
                        Hola, {perfil?.nombre?.split(' ')[0] ?? 'Trabajador'} 👋
                    </h1>
                    <p className="text-slate-500 text-sm mt-0.5">
                        {new Date().toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                    </p>
                </div>
                {stats.despachadas > 0 && (
                    <div className="bg-purple-100 border border-purple-200 text-purple-700 rounded-2xl px-4 py-2 text-center">
                        <p className="text-2xl font-bold">{stats.despachadas}</p>
                        <p className="text-xs font-medium">para confirmar</p>
                    </div>
                )}
            </div>

            {/* Alerta de entregas pendientes */}
            {stats.despachadas > 0 && (
                <div
                    onClick={() => cambiarTab('recepciones')}
                    className="bg-purple-50 border-2 border-purple-200 rounded-2xl p-4 flex items-center gap-3 cursor-pointer hover:bg-purple-100 transition"
                >
                    <span className="text-2xl">🔔</span>
                    <div>
                        <p className="font-semibold text-purple-800">
                            Tienes {stats.despachadas} entrega{stats.despachadas !== 1 ? 's' : ''} esperando confirmación
                        </p>
                        <p className="text-purple-600 text-sm">Haz clic para confirmar la recepción.</p>
                    </div>
                </div>
            )}

            {/* Barra de sección activa */}
            <div className="flex items-center gap-2 text-lg font-semibold text-slate-700">
                <span>{seccion.icon}</span>
                <span>{seccion.label}</span>
            </div>

            {/* ── INICIO ───────────────────────────────── */}
            {tabActiva === 'inicio' && (
                <>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <StatsCard
                            label="Por confirmar"
                            value={stats.despachadas}
                            icon="📬"
                            color={stats.despachadas > 0 ? 'purple' : 'slate'}
                        />
                        <StatsCard label="Insumos recibidos" value={stats.recibidas} icon="✅" color="green" />
                        <StatsCard label="Solicitudes en curso" value={stats.enCurso} icon="⏳" color="amber" />
                    </div>

                    {/* Accesos rápidos */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <button
                            onClick={() => cambiarTab('recepciones')}
                            className="relative flex items-center gap-4 bg-white rounded-2xl border border-slate-200 shadow-sm p-5 text-left hover:shadow-md hover:border-purple-300 transition group"
                        >
                            {stats.despachadas > 0 && (
                                <span className="absolute top-3 right-3 bg-purple-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                                    {stats.despachadas}
                                </span>
                            )}
                            <div className="w-12 h-12 rounded-xl bg-purple-100 flex items-center justify-center text-2xl flex-shrink-0">📬</div>
                            <div>
                                <p className="font-semibold text-slate-800 group-hover:text-purple-700">Mis Recepciones</p>
                                <p className="text-sm text-slate-500">Confirma los insumos que te han despachado</p>
                            </div>
                        </button>

                        <button
                            onClick={() => cambiarTab('mis-solicitudes')}
                            className="flex items-center gap-4 bg-white rounded-2xl border border-slate-200 shadow-sm p-5 text-left hover:shadow-md hover:border-blue-300 transition group"
                        >
                            <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center text-2xl flex-shrink-0">📄</div>
                            <div>
                                <p className="font-semibold text-slate-800 group-hover:text-blue-700">Mis Solicitudes</p>
                                <p className="text-sm text-slate-500">Revisa el estado de las solicitudes asignadas a ti</p>
                            </div>
                        </button>
                    </div>
                </>
            )}

            {/* ── RECEPCIONES ──────────────────────────── */}
            {tabActiva === 'recepciones' && (
                <MisRecepciones compact={false} onRecibirOk={cargarStats} />
            )}

            {/* ── MIS SOLICITUDES ──────────────────────── */}
            {tabActiva === 'mis-solicitudes' && <TablaMisSolicitudes filtrarPor="trabajador_id" />}
        </div>
    );
}
