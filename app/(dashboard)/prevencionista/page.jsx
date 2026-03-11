'use client';
/**
 * app/(dashboard)/prevencionista/page.jsx
 *
 * Dashboard Prevencionista (acceso total acumulativo).
 * Tabs:
 *   1. Gestión Inventario
 *   2. Solicitudes (autorizar/despachar)
 *   3. Crear Solicitud
 *   4. Mis Solicitudes
 *   5. Consultar Stock
 *   6. Mis Recepciones
 */
import { useState, useEffect, useCallback, startTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import Modal from '@/components/ui/Modal';
import TablaInsumos from '@/components/tens/TablaInsumos';
import IngresarStock from '@/components/tens/IngresarStock';
import RegistrarMerma from '@/components/tens/RegistrarMerma';
import SolicitudesPendientes from '@/components/tens/SolicitudesPendientes';
import MisRecepciones from '@/components/trabajador/MisRecepciones';
import FormCrearSolicitud from '@/components/jefatura/FormCrearSolicitud';
import TablaMisSolicitudes from '@/components/jefatura/TablaMisSolicitudes';
import ConsultarStock from '@/components/shared/ConsultarStock';
import SolicitudCompraForm from '@/components/shared/SolicitudCompraForm';
import RecepcionCompra from '@/components/shared/RecepcionCompra';

const SECCION_LABEL = {
    inicio: { icon: '🏠', label: 'Inicio' },
    inventario: { icon: '🗂️', label: 'Gestión Inventario' },
    solicitudes: { icon: '📋', label: 'Solicitudes Pendientes' },
    nueva: { icon: '➕', label: 'Crear Solicitud de Insumos' },
    'mis-solicitudes': { icon: '📄', label: 'Mis Solicitudes' },
    compra: { icon: '🛒', label: 'Solicitar Compra' },
    'recepcion-compra': { icon: '📦', label: 'Recepción de Compras' },
    stock: { icon: '🔍', label: 'Consultar Stock' },
    recepciones: { icon: '✅', label: 'Mis Recepciones' },
};

export default function PrevencionistaDashboard() {
    const { perfil } = useAuth();
    const router = useRouter();
    const searchParams = useSearchParams();
    const [tabActiva, setTabActiva] = useState(() => searchParams.get('tab') ?? 'inicio');

    // Sincronizar tab con la URL
    useEffect(() => {
        const t = searchParams.get('tab') ?? 'inicio';
        startTransition(() => setTabActiva(t));
    }, [searchParams]);

    const cambiarTab = (id) => {
        router.push(`/prevencionista?tab=${id}`, { scroll: false });
    };
    const [modalIngreso, setModalIngreso] = useState({ open: false, insumo: null });
    const [modalMerma, setModalMerma] = useState({ open: false, insumo: null });
    const [stats, setStats] = useState({
        totalInsumos: 0, bajoStock: 0,
        solPendientes: 0, solAutorizadas: 0,
        misSolPendientes: 0, misSolAutorizadas: 0, misSolRechazadas: 0,
        compraPendiente: 0, compraAprobada: 0, compraRechazada: 0,
    });

    const cargarStats = useCallback(async () => {
        if (!perfil?.id) return;
        const [
            { count: totalInsumos },
            bajoStockRes,
            { count: solPendientes },
            { count: solAutorizadas },
            { data: misSol },
            { data: compras },
        ] = await Promise.all([
            supabase.from('insumos').select('*', { count: 'exact', head: true }).eq('activo', true),
            supabase.from('insumos').select('id, stock_actual, stock_minimo').eq('activo', true),
            supabase.from('solicitudes').select('*', { count: 'exact', head: true }).eq('estado', 'pendiente'),
            supabase.from('solicitudes').select('*', { count: 'exact', head: true }).eq('estado', 'autorizada'),
            supabase.from('solicitudes').select('estado').eq('solicitante_id', perfil.id),
            supabase.from('solicitudes_compra').select('estado').eq('solicitante_id', perfil.id),
        ]);
        const bajoStock = (bajoStockRes.data ?? []).filter(i => i.stock_actual <= i.stock_minimo).length;
        const misSolPendientes = (misSol ?? []).filter(s => s.estado === 'pendiente').length;
        const misSolAutorizadas = (misSol ?? []).filter(s => s.estado === 'autorizada').length;
        const misSolRechazadas = (misSol ?? []).filter(s => s.estado === 'rechazada').length;
        const compraPendiente = (compras ?? []).filter(c => c.estado === 'pendiente').length;
        const compraAprobada = (compras ?? []).filter(c => c.estado === 'aprobada').length;
        const compraRechazada = (compras ?? []).filter(c => c.estado === 'rechazada').length;
        setStats({ totalInsumos, bajoStock, solPendientes, solAutorizadas, misSolPendientes, misSolAutorizadas, misSolRechazadas, compraPendiente, compraAprobada, compraRechazada });
    }, [perfil]);

    useEffect(() => {
        startTransition(cargarStats);
        const iv = setInterval(cargarStats, 30_000);
        return () => clearInterval(iv);
    }, [cargarStats]);

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-slate-800">Panel Prevencionista — {perfil?.nombre}</h1>
                <p className="text-slate-500 text-sm mt-0.5">
                    {new Date().toLocaleDateString('es-CL', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                </p>
            </div>

            {/* Título de sección activa (solo cuando NO está en inicio) */}
            {tabActiva !== 'inicio' && (
                <div className="flex items-center gap-2 border-b border-slate-200 pb-3">
                    <span className="text-xl">{SECCION_LABEL[tabActiva]?.icon}</span>
                    <h2 className="text-base font-semibold text-slate-700">{SECCION_LABEL[tabActiva]?.label}</h2>
                    {tabActiva === 'solicitudes' && stats.solPendientes + stats.solAutorizadas > 0 && (
                        <span className="ml-1 text-xs bg-amber-500 text-white px-2 py-0.5 rounded-full font-medium">
                            {stats.solPendientes + stats.solAutorizadas}
                        </span>
                    )}
                </div>
            )}

            {/* ── VISTA INICIO ──────────────────────────────── */}
            {tabActiva === 'inicio' && (
                <div className="space-y-4">
                    <p className="text-sm text-slate-500">Resumen general · selecciona una sección del panel lateral para comenzar.</p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">

                        {/* Inventario */}
                        <button onClick={() => cambiarTab('inventario')}
                            className="text-left bg-white rounded-2xl border border-slate-200 shadow-sm p-5 hover:border-blue-400 hover:shadow-md transition group">
                            <div className="flex items-center justify-between mb-3">
                                <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center text-xl">🗂️</div>
                                <svg className="w-4 h-4 text-slate-300 group-hover:text-blue-500 transition" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                </svg>
                            </div>
                            <p className="font-semibold text-slate-800 mb-2">Gestión Inventario</p>
                            <div className="space-y-1">
                                <div className="flex justify-between text-sm">
                                    <span className="text-slate-500">Insumos activos</span>
                                    <span className="font-semibold text-slate-800">{stats.totalInsumos}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-slate-500">Stock bajo / crítico</span>
                                    <span className={`font-semibold ${stats.bajoStock > 0 ? 'text-red-600' : 'text-green-600'}`}>{stats.bajoStock}</span>
                                </div>
                            </div>
                        </button>

                        {/* Solicitudes de insumos a despachar */}
                        <button onClick={() => cambiarTab('solicitudes')}
                            className="text-left bg-white rounded-2xl border border-slate-200 shadow-sm p-5 hover:border-amber-400 hover:shadow-md transition group">
                            <div className="flex items-center justify-between mb-3">
                                <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center text-xl">📋</div>
                                <svg className="w-4 h-4 text-slate-300 group-hover:text-amber-500 transition" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                </svg>
                            </div>
                            <p className="font-semibold text-slate-800 mb-2">Solicitudes de Insumos</p>
                            <div className="space-y-1">
                                <div className="flex justify-between text-sm">
                                    <span className="text-slate-500">Pendientes de revisión</span>
                                    <span className={`font-semibold ${stats.solPendientes > 0 ? 'text-amber-600' : 'text-slate-800'}`}>{stats.solPendientes}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-slate-500">Listas para despachar</span>
                                    <span className={`font-semibold ${stats.solAutorizadas > 0 ? 'text-purple-600' : 'text-slate-800'}`}>{stats.solAutorizadas}</span>
                                </div>
                            </div>
                        </button>

                        {/* Mis solicitudes de insumos (propias) */}
                        <button onClick={() => cambiarTab('mis-solicitudes')}
                            className="text-left bg-white rounded-2xl border border-slate-200 shadow-sm p-5 hover:border-slate-400 hover:shadow-md transition group">
                            <div className="flex items-center justify-between mb-3">
                                <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center text-xl">📄</div>
                                <svg className="w-4 h-4 text-slate-300 group-hover:text-slate-500 transition" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                </svg>
                            </div>
                            <p className="font-semibold text-slate-800 mb-2">Mis Solicitudes de Insumos</p>
                            <div className="space-y-1">
                                <div className="flex justify-between text-sm">
                                    <span className="text-slate-500">Pendientes</span>
                                    <span className={`font-semibold ${stats.misSolPendientes > 0 ? 'text-amber-600' : 'text-slate-800'}`}>{stats.misSolPendientes}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-slate-500">Autorizadas</span>
                                    <span className="font-semibold text-green-600">{stats.misSolAutorizadas}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-slate-500">Rechazadas</span>
                                    <span className={`font-semibold ${stats.misSolRechazadas > 0 ? 'text-red-500' : 'text-slate-800'}`}>{stats.misSolRechazadas}</span>
                                </div>
                            </div>
                        </button>

                        {/* Solicitudes de compra */}
                        <button onClick={() => cambiarTab('compra')}
                            className="text-left bg-white rounded-2xl border border-slate-200 shadow-sm p-5 hover:border-blue-400 hover:shadow-md transition group">
                            <div className="flex items-center justify-between mb-3">
                                <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center text-xl">🛒</div>
                                <svg className="w-4 h-4 text-slate-300 group-hover:text-blue-500 transition" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                </svg>
                            </div>
                            <p className="font-semibold text-slate-800 mb-2">Mis Solicitudes de Compra</p>
                            <div className="space-y-1">
                                <div className="flex justify-between text-sm">
                                    <span className="text-slate-500">En revisión</span>
                                    <span className={`font-semibold ${stats.compraPendiente > 0 ? 'text-amber-600' : 'text-slate-800'}`}>{stats.compraPendiente}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-slate-500">Aprobadas</span>
                                    <span className="font-semibold text-green-600">{stats.compraAprobada}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-slate-500">Rechazadas</span>
                                    <span className={`font-semibold ${stats.compraRechazada > 0 ? 'text-red-500' : 'text-slate-800'}`}>{stats.compraRechazada}</span>
                                </div>
                            </div>
                        </button>

                        {/* Recepción de compras */}
                        <button onClick={() => cambiarTab('recepcion-compra')}
                            className="text-left bg-white rounded-2xl border border-slate-200 shadow-sm p-5 hover:border-emerald-400 hover:shadow-md transition group">
                            <div className="flex items-center justify-between mb-3">
                                <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center text-xl">📦</div>
                                <svg className="w-4 h-4 text-slate-300 group-hover:text-emerald-500 transition" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                </svg>
                            </div>
                            <p className="font-semibold text-slate-800 mb-2">Recepciones de Compra</p>
                            <div className="space-y-1">
                                <div className="flex justify-between text-sm">
                                    <span className="text-slate-500">Aprobadas sin recibir</span>
                                    <span className={`font-semibold ${stats.compraAprobada > 0 ? 'text-emerald-600' : 'text-slate-800'}`}>{stats.compraAprobada}</span>
                                </div>
                            </div>
                        </button>

                        {/* Consultar stock */}
                        <button onClick={() => cambiarTab('stock')}
                            className="text-left bg-white rounded-2xl border border-slate-200 shadow-sm p-5 hover:border-slate-400 hover:shadow-md transition group">
                            <div className="flex items-center justify-between mb-3">
                                <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center text-xl">🔍</div>
                                <svg className="w-4 h-4 text-slate-300 group-hover:text-slate-500 transition" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                </svg>
                            </div>
                            <p className="font-semibold text-slate-800 mb-1">Consultar Stock</p>
                            <p className="text-sm text-slate-500">Busca insumos por nombre o código y revisa niveles de stock en tiempo real.</p>
                        </button>

                        {/* Mis recepciones */}
                        <button onClick={() => cambiarTab('recepciones')}
                            className="text-left bg-white rounded-2xl border border-slate-200 shadow-sm p-5 hover:border-green-400 hover:shadow-md transition group">
                            <div className="flex items-center justify-between mb-3">
                                <div className="w-10 h-10 rounded-xl bg-green-100 text-green-600 flex items-center justify-center text-xl">✅</div>
                                <svg className="w-4 h-4 text-slate-300 group-hover:text-green-500 transition" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                </svg>
                            </div>
                            <p className="font-semibold text-slate-800 mb-1">Mis Recepciones</p>
                            <p className="text-sm text-slate-500">Historial de insumos recibidos y confirmaciones de entrega.</p>
                        </button>

                    </div>
                </div>
            )}

            {tabActiva === 'inventario' && (
                <TablaInsumos
                    onIngreso={insumo => setModalIngreso({ open: true, insumo })}
                    onMerma={insumo => setModalMerma({ open: true, insumo })}
                />
            )}
            {tabActiva === 'solicitudes' && <SolicitudesPendientes />}
            {tabActiva === 'nueva' && (
                <div className="max-w-lg">
                    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
                        <h2 className="font-semibold text-slate-800 mb-5 flex items-center gap-2">
                            <span className="w-7 h-7 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center text-sm">➕</span>
                            Crear nueva solicitud de insumos
                        </h2>
                        <FormCrearSolicitud mostrarStock={true} onSuccess={() => { cargarStats(); cambiarTab('mis-solicitudes'); }} />
                    </div>
                </div>
            )}
            {tabActiva === 'mis-solicitudes' && <TablaMisSolicitudes filtrarPor="trabajador_id" />}
            {tabActiva === 'compra' && <SolicitudCompraForm />}
            {tabActiva === 'recepcion-compra' && <RecepcionCompra />}
            {tabActiva === 'stock' && <ConsultarStock />}
            {tabActiva === 'recepciones' && <MisRecepciones compact={false} />}

            <Modal open={modalIngreso.open} onClose={() => setModalIngreso({ open: false, insumo: null })} title="Registrar Ingreso de Stock">
                {modalIngreso.insumo && (
                    <IngresarStock insumo={modalIngreso.insumo} onSuccess={cargarStats} onClose={() => setModalIngreso({ open: false, insumo: null })} />
                )}
            </Modal>
            <Modal open={modalMerma.open} onClose={() => setModalMerma({ open: false, insumo: null })} title="Registrar Merma">
                {modalMerma.insumo && (
                    <RegistrarMerma insumo={modalMerma.insumo} onSuccess={cargarStats} onClose={() => setModalMerma({ open: false, insumo: null })} />
                )}
            </Modal>
        </div>
    );
}
