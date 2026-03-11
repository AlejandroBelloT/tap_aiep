'use client';
/**
 * components/admin/TablaUsuarios.jsx
 *
 * CRUD de usuarios para el Administrador.
 * Acciones:
 *   - Ver lista completa de usuarios con su rol y estado.
 *   - Crear nuevo usuario (abre FormUsuario en modo creación).
 *   - Editar: nombre, rol, servicio, activar/desactivar (abre FormUsuario en modo edición).
 *   - Desactivar / Reactivar usuario (toggle activo).
 */
import { useEffect, useState, useCallback, startTransition } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { ROLES, getRolLabel } from '@/lib/roles';
import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import Alert from '@/components/ui/Alert';
import FormUsuario from '@/components/admin/FormUsuario';

const ROL_COLOR = {
    trabajador: 'bg-slate-100   text-slate-700   border-slate-200',
    jefatura: 'bg-blue-100    text-blue-700    border-blue-200',
    tens: 'bg-teal-100    text-teal-700    border-teal-200',
    prevencionista: 'bg-purple-100  text-purple-700  border-purple-200',
    administrador: 'bg-red-100     text-red-700     border-red-200',
};

const fmt = (iso) =>
    iso
        ? new Intl.DateTimeFormat('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(iso))
        : '—';

export default function TablaUsuarios() {
    const { perfil: adminPerfil } = useAuth();

    const [usuarios, setUsuarios] = useState([]);
    const [loading, setLoading] = useState(true);
    const [feedback, setFeedback] = useState(null);
    const [procesando, setProcesando] = useState(null); // id de usuario en proceso

    // Filtros
    const [busqueda, setBusqueda] = useState('');
    const [filtroRol, setFiltroRol] = useState('todos');
    const [filtroActivo, setFiltroActivo] = useState('activos');

    // Modales
    const [modalCrear, setModalCrear] = useState(false);
    const [modalEditar, setModalEditar] = useState({ open: false, usuario: null });
    const [modalEliminar, setModalEliminar] = useState({ open: false, usuario: null });

    const cargar = useCallback(async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('usuarios')
            .select('*')
            .order('nombre');

        if (!error) setUsuarios(data ?? []);
        setLoading(false);
    }, []);

    useEffect(() => {
        startTransition(cargar);
    }, [cargar]);

    // ── Toggle activo / inactivo ───────────────────────────────
    const toggleActivo = async (usuario) => {
        // No permitir desactivar el propio usuario admin
        if (usuario.id === adminPerfil?.id) {
            setFeedback({ type: 'warning', message: 'No puedes desactivar tu propio usuario.' });
            return;
        }

        setProcesando(usuario.id);
        const { error } = await supabase
            .from('usuarios')
            .update({ activo: !usuario.activo })
            .eq('id', usuario.id);

        setProcesando(null);

        if (error) {
            setFeedback({ type: 'error', message: `Error: ${error.message}` });
        } else {
            setFeedback({
                type: 'success',
                message: `${usuario.nombre} ${!usuario.activo ? 'activado' : 'desactivado'} correctamente.`,
            });
            cargar();
        }
    };

    // ── Eliminar usuario ──────────────────────────────────────
    const eliminarUsuario = async (usuario) => {
        setProcesando(usuario.id);
        setModalEliminar({ open: false, usuario: null });

        const res = await fetch(`/api/usuarios/${usuario.id}`, { method: 'DELETE' });
        setProcesando(null);

        if (!res.ok) {
            const json = await res.json().catch(() => ({}));
            setFeedback({ type: 'error', message: `Error al eliminar: ${json.error ?? res.statusText}` });
        } else {
            setFeedback({ type: 'success', message: `${usuario.nombre} eliminado del sistema.` });
            cargar();
        }
    };

    // ── Cambio rápido de rol (inline) ─────────────────────────
    const cambiarRol = async (usuario, nuevoRol) => {
        if (usuario.id === adminPerfil?.id && nuevoRol !== 'administrador') {
            setFeedback({ type: 'warning', message: 'No puedes cambiar tu propio rol de administrador.' });
            return;
        }

        setProcesando(usuario.id);
        const { error } = await supabase
            .from('usuarios')
            .update({ rol: nuevoRol })
            .eq('id', usuario.id);

        setProcesando(null);

        if (error) {
            setFeedback({ type: 'error', message: `Error al cambiar rol: ${error.message}` });
        } else {
            setFeedback({ type: 'success', message: `Rol de ${usuario.nombre} actualizado a "${getRolLabel(nuevoRol)}".` });
            cargar();
        }
    };

    // ── Filtrado en memoria ────────────────────────────────────
    const usuariosFiltrados = usuarios.filter((u) => {
        const matchBusqueda =
            !busqueda ||
            u.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
            u.email.toLowerCase().includes(busqueda.toLowerCase()) ||
            (u.rut ?? '').toLowerCase().includes(busqueda.toLowerCase()) ||
            (u.servicio ?? '').toLowerCase().includes(busqueda.toLowerCase());

        const matchRol = filtroRol === 'todos' || u.rol === filtroRol;
        const matchActivo = filtroActivo === 'todos' ||
            (filtroActivo === 'activos' && u.activo) ||
            (filtroActivo === 'inactivos' && !u.activo);

        return matchBusqueda && matchRol && matchActivo;
    });

    return (
        <>
            {feedback && (
                <Alert type={feedback.type} message={feedback.message} onClose={() => setFeedback(null)} />
            )}

            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                {/* Header */}
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 px-5 py-4 border-b border-slate-100">
                    <h3 className="font-semibold text-slate-800">Gestión de Usuarios</h3>

                    <div className="flex flex-wrap items-center gap-2">
                        {/* Búsqueda */}
                        <input
                            type="text"
                            placeholder="Buscar nombre, RUT, correo o servicio…"
                            value={busqueda}
                            onChange={(e) => setBusqueda(e.target.value)}
                            className="text-sm px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 w-52"
                        />

                        {/* Filtro rol */}
                        <select
                            value={filtroRol}
                            onChange={(e) => setFiltroRol(e.target.value)}
                            className="text-sm px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                            <option value="todos">Todos los roles</option>
                            {ROLES.map(({ value, label }) => (
                                <option key={value} value={value}>{label}</option>
                            ))}
                        </select>

                        {/* Filtro activo */}
                        <select
                            value={filtroActivo}
                            onChange={(e) => setFiltroActivo(e.target.value)}
                            className="text-sm px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                            <option value="activos">Activos</option>
                            <option value="inactivos">Inactivos</option>
                            <option value="todos">Todos</option>
                        </select>

                        {/* Botón nuevo usuario */}
                        <button
                            onClick={() => setModalCrear(true)}
                            className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold
                         rounded-lg transition flex items-center gap-1.5"
                        >
                            <span>+</span> Nuevo usuario
                        </button>

                        <button
                            onClick={cargar}
                            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition"
                            title="Recargar"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                        </button>
                    </div>
                </div>

                {/* Tabla */}
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-slate-50 text-left text-xs text-slate-500 uppercase tracking-wider">
                                <th className="px-5 py-3 font-semibold">Usuario</th>
                                <th className="px-5 py-3 font-semibold">RUT</th>
                                <th className="px-5 py-3 font-semibold">Correo</th>
                                <th className="px-5 py-3 font-semibold">Servicio / Área</th>
                                <th className="px-5 py-3 font-semibold">Rol</th>
                                <th className="px-5 py-3 font-semibold text-center">Estado</th>
                                <th className="px-5 py-3 font-semibold">Creado</th>
                                <th className="px-5 py-3 font-semibold">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {loading ? (
                                <tr>
                                    <td colSpan={8} className="px-5 py-10 text-center text-slate-400">
                                        <span className="inline-block w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin mr-2 align-middle" />
                                        Cargando usuarios…
                                    </td>
                                </tr>
                            ) : usuariosFiltrados.length === 0 ? (
                                <tr>
                                    <td colSpan={8} className="px-5 py-10 text-center text-slate-400">
                                        No se encontraron usuarios con los filtros seleccionados.
                                    </td>
                                </tr>
                            ) : (
                                usuariosFiltrados.map((u) => {
                                    const esYo = u.id === adminPerfil?.id;
                                    const enProceso = procesando === u.id;

                                    return (
                                        <tr key={u.id} className={`hover:bg-slate-50 transition ${!u.activo ? 'opacity-60' : ''} ${enProceso ? 'opacity-40' : ''}`}>
                                            {/* Nombre */}
                                            <td className="px-5 py-3">
                                                <div className="flex items-center gap-2.5">
                                                    <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 font-semibold flex items-center justify-center text-xs shrink-0">
                                                        {u.nombre.charAt(0).toUpperCase()}
                                                    </div>
                                                    <div>
                                                        <p className="font-medium text-slate-800 leading-tight">
                                                            {u.nombre}
                                                            {esYo && <span className="ml-1 text-xs text-blue-500">(tú)</span>}
                                                        </p>
                                                    </div>
                                                </div>
                                            </td>

                                            {/* RUT */}
                                            <td className="px-5 py-3 font-mono text-xs text-slate-600 tracking-wide">
                                                {u.rut ?? <span className="text-slate-300 italic">Sin RUT</span>}
                                            </td>

                                            {/* Email */}
                                            <td className="px-5 py-3 text-slate-500 text-xs">{u.email}</td>

                                            {/* Servicio */}
                                            <td className="px-5 py-3 text-slate-600 text-xs">{u.servicio ?? '—'}</td>

                                            {/* Rol (selector inline) */}
                                            <td className="px-5 py-3">
                                                <select
                                                    value={u.rol}
                                                    onChange={(e) => cambiarRol(u, e.target.value)}
                                                    disabled={enProceso || esYo}
                                                    className={`text-xs px-2 py-1 rounded-lg border font-medium bg-white
                            focus:outline-none focus:ring-2 focus:ring-blue-500 transition
                            ${ROL_COLOR[u.rol] ?? 'bg-slate-100 text-slate-700 border-slate-200'}
                            disabled:opacity-70 disabled:cursor-not-allowed`}
                                                >
                                                    {ROLES.map(({ value, label }) => (
                                                        <option key={value} value={value} className="bg-white text-slate-800">{label}</option>
                                                    ))}
                                                </select>
                                            </td>

                                            {/* Estado */}
                                            <td className="px-5 py-3 text-center">
                                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border
                          ${u.activo
                                                        ? 'bg-green-50 text-green-700 border-green-200'
                                                        : 'bg-slate-50 text-slate-500 border-slate-200'
                                                    }`}
                                                >
                                                    {u.activo ? 'Activo' : 'Inactivo'}
                                                </span>
                                            </td>

                                            {/* Creado */}
                                            <td className="px-5 py-3 text-slate-400 text-xs">{fmt(u.created_at)}</td>

                                            {/* Acciones */}
                                            <td className="px-5 py-3">
                                                <div className="flex items-center gap-1.5">
                                                    <button
                                                        onClick={() => setModalEditar({ open: true, usuario: u })}
                                                        disabled={enProceso}
                                                        className="px-2.5 py-1 text-xs bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg font-medium transition disabled:opacity-50"
                                                    >
                                                        ✏️ Editar
                                                    </button>
                                                    {!esYo && (
                                                        <>
                                                            <button
                                                                onClick={() => toggleActivo(u)}
                                                                disabled={enProceso}
                                                                className={`px-2.5 py-1 text-xs rounded-lg font-medium transition disabled:opacity-50
                                    ${u.activo
                                                                        ? 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                                                                        : 'bg-green-50 text-green-700 hover:bg-green-100'
                                                                    }`}
                                                            >
                                                                {u.activo ? '🚫 Desactivar' : '✅ Activar'}
                                                            </button>
                                                            <button
                                                                onClick={() => setModalEliminar({ open: true, usuario: u })}
                                                                disabled={enProceso}
                                                                className="px-2.5 py-1 text-xs bg-red-50 text-red-700 hover:bg-red-100 rounded-lg font-medium transition disabled:opacity-50"
                                                            >
                                                                🗑️ Eliminar
                                                            </button>
                                                        </>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Footer */}
                {!loading && (
                    <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                        <span>{usuariosFiltrados.length} usuario{usuariosFiltrados.length !== 1 ? 's' : ''}</span>
                        <span>{usuarios.filter((u) => u.activo).length} activos de {usuarios.length} totales</span>
                    </div>
                )}
            </div>

            {/* Modal: Crear usuario */}
            <Modal open={modalCrear} onClose={() => setModalCrear(false)} title="Nuevo usuario" maxWidth="max-w-md">
                <FormUsuario
                    onSuccess={() => { cargar(); setModalCrear(false); }}
                    onClose={() => setModalCrear(false)}
                />
            </Modal>

            {/* Modal: Editar usuario */}
            <Modal
                open={modalEditar.open}
                onClose={() => setModalEditar({ open: false, usuario: null })}
                title={`Editar: ${modalEditar.usuario?.nombre ?? ''}`}
                maxWidth="max-w-md"
            >
                {modalEditar.usuario && (
                    <FormUsuario
                        usuario={modalEditar.usuario}
                        onSuccess={() => { cargar(); setModalEditar({ open: false, usuario: null }); }}
                        onClose={() => setModalEditar({ open: false, usuario: null })}
                    />
                )}
            </Modal>

            {/* Modal: Confirmar eliminación */}
            <Modal
                open={modalEliminar.open}
                onClose={() => setModalEliminar({ open: false, usuario: null })}
                title="Eliminar usuario"
                maxWidth="max-w-sm"
            >
                {modalEliminar.usuario && (
                    <div className="space-y-4">
                        <p className="text-slate-700 text-sm">
                            ¿Estás seguro de que deseas eliminar permanentemente a{' '}
                            <span className="font-semibold">{modalEliminar.usuario.nombre}</span>?
                        </p>
                        <p className="text-xs text-slate-500">
                            Esta acción es irreversible. Se eliminará el usuario de Auth y todos sus datos asociados.
                        </p>
                        <div className="flex justify-end gap-2 pt-1">
                            <button
                                onClick={() => setModalEliminar({ open: false, usuario: null })}
                                className="px-4 py-2 text-sm rounded-lg border border-slate-200 hover:bg-slate-50 transition"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={() => eliminarUsuario(modalEliminar.usuario)}
                                className="px-4 py-2 text-sm bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition"
                            >
                                Sí, eliminar
                            </button>
                        </div>
                    </div>
                )}
            </Modal>
        </>
    );
}
