'use client';
/**
 * components/admin/FormInsumo.jsx
 *
 * Panel completo de gestión del catálogo de insumos (solo Admin):
 *  - Crear nuevo insumo
 *  - Editar nombre, descripción, código, unidad, stock mínimo
 *  - Activar / desactivar insumos
 */
import { useEffect, useState, useCallback, startTransition } from 'react';
import { supabase } from '@/lib/supabase';
import Badge from '@/components/ui/Badge';
import Alert from '@/components/ui/Alert';

const UNIDADES = [
    'unidad', 'caja', 'paquete', 'bolsa', 'frasco', 'ampolla',
    'rollo', 'par', 'litro', 'ml', 'kg', 'gramo',
];

const VACIO = {
    nombre: '',
    descripcion: '',
    codigo: '',
    unidad_medida: 'unidad',
    stock_actual: 0,
    stock_minimo: 5,
};

export default function FormInsumo() {
    /* ── estado ─────────────────────────────────── */
    const [insumos, setInsumos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [guardando, setGuardando] = useState(false);
    const [alert, setAlert] = useState(null); // { type, msg }
    const [busqueda, setBusqueda] = useState('');
    const [mostrarInactivos, setMostrarInactivos] = useState(false);

    // Formulario acumulado
    const [form, setForm] = useState(VACIO);
    const [editandoId, setEditandoId] = useState(null); // null = crear nuevo

    /* ── carga ──────────────────────────────────── */
    const cargar = useCallback(async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('insumos')
            .select('*')
            .order('nombre');
        if (!error) setInsumos(data ?? []);
        setLoading(false);
    }, []);

    useEffect(() => {
        startTransition(cargar);

        const ch = supabase
            .channel('admin-insumos')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'insumos' }, cargar)
            .subscribe();

        return () => supabase.removeChannel(ch);
    }, [cargar]);

    /* ── helpers formulario ─────────────────────── */
    const setField = (k, v) => setForm((f) => ({ ...f, [k]: v }));

    const limpiar = () => {
        setForm(VACIO);
        setEditandoId(null);
    };

    const empezarEdicion = (ins) => {
        setForm({
            nombre: ins.nombre,
            descripcion: ins.descripcion ?? '',
            codigo: ins.codigo ?? '',
            unidad_medida: ins.unidad_medida,
            stock_actual: ins.stock_actual,
            stock_minimo: ins.stock_minimo,
        });
        setEditandoId(ins.id);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    /* ── guardar (crear o editar) ───────────────── */
    const handleSubmit = async (e) => {
        e.preventDefault();
        setAlert(null);

        if (!form.nombre.trim()) {
            setAlert({ type: 'error', msg: 'El nombre del insumo es obligatorio.' });
            return;
        }

        setGuardando(true);

        const payload = {
            nombre: form.nombre.trim(),
            descripcion: form.descripcion.trim() || null,
            codigo: form.codigo.trim() || null,
            unidad_medida: form.unidad_medida,
            stock_minimo: Number(form.stock_minimo),
        };

        let error;

        if (editandoId) {
            // EDITAR — no se modifica stock_actual directamente
            ({ error } = await supabase
                .from('insumos')
                .update(payload)
                .eq('id', editandoId));
        } else {
            // CREAR
            ({ error } = await supabase
                .from('insumos')
                .insert({ ...payload, stock_actual: Number(form.stock_actual) }));
        }

        setGuardando(false);

        if (error) {
            if (error.code === '23505') {
                setAlert({ type: 'error', msg: 'Ya existe un insumo con ese código. Usa uno diferente.' });
            } else {
                setAlert({ type: 'error', msg: `Error al guardar: ${error.message}` });
            }
            return;
        }

        setAlert({
            type: 'success',
            msg: editandoId ? 'Insumo actualizado correctamente.' : 'Insumo creado correctamente.',
        });
        limpiar();
        startTransition(cargar);
    };

    /* ── activar / desactivar ───────────────────── */
    const toggleActivo = async (ins) => {
        const { error } = await supabase
            .from('insumos')
            .update({ activo: !ins.activo })
            .eq('id', ins.id);

        if (error) {
            setAlert({ type: 'error', msg: `No se pudo cambiar el estado: ${error.message}` });
        } else {
            startTransition(cargar);
        }
    };

    /* ── filtro ───────────────────────────────────── */
    const filtrados = insumos.filter((i) => {
        const coincide =
            i.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
            (i.codigo ?? '').toLowerCase().includes(busqueda.toLowerCase());
        const visible = mostrarInactivos ? true : i.activo;
        return coincide && visible;
    });

    /* ── render ─────────────────────────────────── */
    return (
        <div className="space-y-6">

            {/* ── Formulario ─────────────────────────────── */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                {/* Cabecera */}
                <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                    <div>
                        <h3 className="font-semibold text-slate-800">
                            {editandoId ? '✏️ Editar insumo' : '➕ Nuevo insumo'}
                        </h3>
                        <p className="text-xs text-slate-400 mt-0.5">
                            {editandoId
                                ? 'Modifica los datos y guarda. El stock actual solo cambia por ingresos o mermas.'
                                : 'Agrega un insumo al catálogo. El stock inicial se puede ajustar luego.'}
                        </p>
                    </div>
                    {editandoId && (
                        <button
                            onClick={limpiar}
                            className="text-xs px-3 py-1 rounded-lg border border-slate-200
                                       text-slate-500 hover:bg-slate-50 transition"
                        >
                            Cancelar edición
                        </button>
                    )}
                </div>

                {/* Alerta */}
                {alert && (
                    <div className="px-5 pt-4">
                        <Alert
                            type={alert.type}
                            message={alert.msg}
                            onClose={() => setAlert(null)}
                        />
                    </div>
                )}

                {/* Campos */}
                <form onSubmit={handleSubmit} className="p-5 space-y-4">
                    {/* Fila 1 — Nombre + Código */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">
                                Nombre <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="text"
                                value={form.nombre}
                                onChange={(e) => setField('nombre', e.target.value)}
                                placeholder="Ej: Guante de nitrilo talla M"
                                className="w-full text-sm px-3 py-2 rounded-lg border border-slate-200
                                           bg-white text-slate-800 placeholder:text-slate-400
                                           focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">
                                Código interno <span className="text-slate-400">(opcional)</span>
                            </label>
                            <input
                                type="text"
                                value={form.codigo}
                                onChange={(e) => setField('codigo', e.target.value.toUpperCase())}
                                placeholder="Ej: GNT-M-001"
                                className="w-full text-sm px-3 py-2 rounded-lg border border-slate-200
                                           bg-white text-slate-800 placeholder:text-slate-400
                                           focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </div>
                    </div>

                    {/* Fila 2 — Descripción */}
                    <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">
                            Descripción <span className="text-slate-400">(opcional)</span>
                        </label>
                        <textarea
                            value={form.descripcion}
                            onChange={(e) => setField('descripcion', e.target.value)}
                            placeholder="Detalles adicionales del insumo…"
                            rows={2}
                            className="w-full text-sm px-3 py-2 rounded-lg border border-slate-200
                                       bg-white text-slate-800 placeholder:text-slate-400
                                       focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                        />
                    </div>

                    {/* Fila 3 — Unidad + Stock mínimo + Stock inicial (solo crear) */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">
                                Unidad de medida <span className="text-red-500">*</span>
                            </label>
                            <select
                                value={form.unidad_medida}
                                onChange={(e) => setField('unidad_medida', e.target.value)}
                                className="w-full text-sm px-3 py-2 rounded-lg border border-slate-200
                                           bg-white text-slate-800
                                           focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                                {UNIDADES.map((u) => (
                                    <option key={u} value={u}>{u}</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">
                                Stock mínimo <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="number"
                                min={0}
                                value={form.stock_minimo}
                                onChange={(e) => setField('stock_minimo', e.target.value)}
                                className="w-full text-sm px-3 py-2 rounded-lg border border-slate-200
                                           bg-white text-slate-800
                                           focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            <p className="text-[11px] text-slate-400 mt-1">Umbral de alerta de stock bajo</p>
                        </div>

                        {!editandoId && (
                            <div>
                                <label className="block text-xs font-medium text-slate-600 mb-1">
                                    Stock inicial
                                </label>
                                <input
                                    type="number"
                                    min={0}
                                    value={form.stock_actual}
                                    onChange={(e) => setField('stock_actual', e.target.value)}
                                    className="w-full text-sm px-3 py-2 rounded-lg border border-slate-200
                                               bg-white text-slate-800
                                               focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                                <p className="text-[11px] text-slate-400 mt-1">Unidades disponibles al crear</p>
                            </div>
                        )}
                    </div>

                    {/* Botón guardar */}
                    <div className="flex justify-end pt-1">
                        <button
                            type="submit"
                            disabled={guardando}
                            className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold
                                       bg-blue-600 hover:bg-blue-700 text-white transition
                                       disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {guardando ? (
                                <>
                                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10"
                                            stroke="currentColor" strokeWidth="4" />
                                        <path className="opacity-75" fill="currentColor"
                                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                    </svg>
                                    Guardando…
                                </>
                            ) : (
                                editandoId ? '💾 Guardar cambios' : '➕ Crear insumo'
                            )}
                        </button>
                    </div>
                </form>
            </div>

            {/* ── Tabla de insumos ──────────────────────── */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <h3 className="font-semibold text-slate-800">
                        Catálogo de insumos{' '}
                        <span className="text-slate-400 font-normal text-sm">
                            ({filtrados.length} {mostrarInactivos ? 'total' : 'activos'})
                        </span>
                    </h3>
                    <div className="flex items-center gap-2">
                        <input
                            type="text"
                            placeholder="Buscar nombre o código…"
                            value={busqueda}
                            onChange={(e) => setBusqueda(e.target.value)}
                            className="text-sm px-3 py-1.5 rounded-lg border border-slate-200 bg-white
                                       text-slate-800 placeholder:text-slate-400
                                       focus:outline-none focus:ring-2 focus:ring-blue-500 w-52"
                        />
                        <label className="flex items-center gap-1.5 text-xs text-slate-500 cursor-pointer select-none">
                            <input
                                type="checkbox"
                                checked={mostrarInactivos}
                                onChange={(e) => setMostrarInactivos(e.target.checked)}
                                className="rounded"
                            />
                            Ver inactivos
                        </label>
                        <button
                            onClick={() => startTransition(cargar)}
                            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition"
                            title="Recargar"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                        </button>
                    </div>
                </div>

                {loading ? (
                    <div className="text-center py-10 text-slate-400 text-sm">Cargando insumos…</div>
                ) : filtrados.length === 0 ? (
                    <div className="text-center py-10 text-slate-400 text-sm">
                        {busqueda ? 'Sin resultados para esa búsqueda.' : 'No hay insumos en el catálogo.'}
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-slate-50 border-b border-slate-100 text-left">
                                    <th className="px-4 py-3 font-medium text-slate-500 text-xs uppercase tracking-wider">Nombre</th>
                                    <th className="px-4 py-3 font-medium text-slate-500 text-xs uppercase tracking-wider hidden sm:table-cell">Código</th>
                                    <th className="px-4 py-3 font-medium text-slate-500 text-xs uppercase tracking-wider hidden md:table-cell">Unidad</th>
                                    <th className="px-4 py-3 font-medium text-slate-500 text-xs uppercase tracking-wider text-center">Stock actual</th>
                                    <th className="px-4 py-3 font-medium text-slate-500 text-xs uppercase tracking-wider text-center hidden lg:table-cell">Stock mín.</th>
                                    <th className="px-4 py-3 font-medium text-slate-500 text-xs uppercase tracking-wider text-center">Estado</th>
                                    <th className="px-4 py-3 font-medium text-slate-500 text-xs uppercase tracking-wider text-right">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {filtrados.map((ins) => {
                                    const bajStock = ins.stock_actual <= ins.stock_minimo;
                                    return (
                                        <tr
                                            key={ins.id}
                                            className={`hover:bg-slate-50/60 transition ${!ins.activo ? 'opacity-50' : ''}`}
                                        >
                                            <td className="px-4 py-3">
                                                <p className="font-medium text-slate-800">{ins.nombre}</p>
                                                {ins.descripcion && (
                                                    <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">{ins.descripcion}</p>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 hidden sm:table-cell text-slate-500 font-mono text-xs">
                                                {ins.codigo ?? '—'}
                                            </td>
                                            <td className="px-4 py-3 hidden md:table-cell text-slate-500 capitalize">
                                                {ins.unidad_medida}
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <span className={`font-semibold ${bajStock ? 'text-red-600' : 'text-slate-800'}`}>
                                                    {ins.stock_actual}
                                                </span>
                                                {bajStock && ins.activo && (
                                                    <span className="ml-1 text-red-500 text-xs">⚠️</span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-center hidden lg:table-cell text-slate-500">
                                                {ins.stock_minimo}
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <Badge
                                                    variant={ins.activo ? 'success' : 'default'}
                                                    label={ins.activo ? 'Activo' : 'Inactivo'}
                                                />
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                <div className="flex items-center justify-end gap-2">
                                                    <button
                                                        onClick={() => empezarEdicion(ins)}
                                                        className="text-xs px-2.5 py-1 rounded-lg bg-blue-50
                                                                   text-blue-700 hover:bg-blue-100 transition font-medium"
                                                    >
                                                        Editar
                                                    </button>
                                                    <button
                                                        onClick={() => toggleActivo(ins)}
                                                        className={`text-xs px-2.5 py-1 rounded-lg font-medium transition
                                                            ${ins.activo
                                                                ? 'bg-red-50 text-red-600 hover:bg-red-100'
                                                                : 'bg-green-50 text-green-700 hover:bg-green-100'}`}
                                                    >
                                                        {ins.activo ? 'Desactivar' : 'Activar'}
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
