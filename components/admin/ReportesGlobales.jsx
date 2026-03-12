'use client';
/**
 * components/admin/ReportesGlobales.jsx
 *
 * Contenedor principal de reportes para el Administrador.
 * Sub-tabs:
 *   1. Solicitudes Globales  — listado completo con filtros
 *   2. Por Trabajador        — insumos entregados a un trabajador
 *   3. Entradas por Insumo   — movimientos tipo 'ingreso'
 *   4. Mermas                — movimientos tipo 'merma'
 *   5. Entregas por Insumo   — historial detallado de quién recibió qué
 */
import { useState } from 'react';
import SolicitudesGlobalesTab from '@/components/admin/reportes/SolicitudesGlobalesTab';
import ReporteTrabajador from '@/components/admin/reportes/ReporteTrabajador';
import ReporteEntradasInsumo from '@/components/admin/reportes/ReporteEntradasInsumo';
import ReporteSalidasInsumo from '@/components/admin/reportes/ReporteSalidasInsumo';
import ReporteEntregasInsumo from '@/components/admin/reportes/ReporteEntregasInsumo';

const SUB_TABS = [
    { id: 'global', label: '📊 Solicitudes Globales' },
    { id: 'trabajador', label: '👤 Por Trabajador' },
    { id: 'entradas', label: '📥 Entradas' },
    { id: 'salidas', label: '⚠️ Mermas' },
    { id: 'entregas', label: '📦 Entregas' },
];

export default function ReportesGlobales() {
    const [subTab, setSubTab] = useState('global');

    return (
        <div className="space-y-5">
            {/* Sub-navegación */}
            <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1 flex-wrap">
                {SUB_TABS.map(t => (
                    <button
                        key={t.id}
                        onClick={() => setSubTab(t.id)}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${subTab === t.id
                            ? 'bg-white text-slate-800 shadow-sm'
                            : 'text-slate-500 hover:text-slate-700'
                            }`}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            {/* Contenido del sub-tab activo */}
            {subTab === 'global' && <SolicitudesGlobalesTab />}
            {subTab === 'trabajador' && <ReporteTrabajador />}
            {subTab === 'entradas' && <ReporteEntradasInsumo />}
            {subTab === 'salidas' && <ReporteSalidasInsumo />}
            {subTab === 'entregas' && <ReporteEntregasInsumo />}
        </div>
    );
}
