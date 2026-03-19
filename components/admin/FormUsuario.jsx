'use client';
/**
 * components/admin/FormUsuario.jsx
 *
 * Modal con formulario para CREAR o EDITAR un usuario del sistema.
 *
 * CREAR: Crea al usuario en Supabase Auth (mediante Admin API) y su perfil en public.usuarios.
 *        Como el cliente JS no puede usar la Admin API directamente, la creación se hace en dos pasos:
 *        1. El admin usa "Invite user" de Supabase Auth desde el panel, o bien
 *        2. Aquí se inserta directamente en public.usuarios para usuarios ya registrados en Auth.
 *        → En este formulario manejamos la creación del PERFIL (nombre, rol, servicio)
 *          suponiendo que el usuario ya tiene cuenta en Supabase Auth.
 *          Para crear desde cero, también incluimos el flujo de signUp admin.
 *
 * EDITAR: Actualiza nombre, rol, servicio y estado activo en public.usuarios.
 */
import { useState, useEffect, startTransition } from 'react';
import { supabase } from '@/lib/supabase';
import { ROLES } from '@/lib/roles';
import { formatRut, validateRut } from '@/lib/rut';
import Alert from '@/components/ui/Alert';

export default function FormUsuario({ usuario, onSuccess, onClose }) {
    const esEdicion = Boolean(usuario);

    const [rut, setRut] = useState(formatRut(usuario?.rut ?? ''));
    const [nombre, setNombre] = useState(usuario?.nombre ?? '');
    const [email, setEmail] = useState(usuario?.email ?? '');
    const [rol, setRol] = useState(usuario?.rol ?? 'trabajador');
    const [servicio, setServicio] = useState(usuario?.servicio ?? '');
    const [activo, setActivo] = useState(usuario?.activo ?? true);
    const [password, setPassword] = useState('');

    const [loading, setLoading] = useState(false);
    const [feedback, setFeedback] = useState(null);

    useEffect(() => {
        if (usuario) {
            startTransition(() => {
                setRut(formatRut(usuario.rut ?? ''));
                setNombre(usuario.nombre ?? '');
                setEmail(usuario.email ?? '');
                setRol(usuario.rol ?? 'trabajador');
                setServicio(usuario.servicio ?? '');
                setActivo(usuario.activo ?? true);
            });
        }
    }, [usuario]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setFeedback(null);

        if (!nombre.trim()) {
            setFeedback({ type: 'error', message: 'El nombre es obligatorio.' });
            return;
        }

        if (!rut.trim()) {
            setFeedback({ type: 'error', message: 'El RUT es obligatorio.' });
            return;
        }
        if (!validateRut(rut)) {
            setFeedback({ type: 'error', message: 'El RUT ingresado no es válido. Verifica el dígito verificador.' });
            return;
        }

        setLoading(true);

        if (esEdicion) {
            // ── EDITAR perfil existente ─────────────────────────────
            const { error } = await supabase
                .from('usuarios')
                .update({
                    rut: rut.trim(),
                    nombre: nombre.trim(),
                    rol,
                    servicio: servicio.trim() || null,
                    activo,
                })
                .eq('id', usuario.id);

            setLoading(false);

            if (error) {
                setFeedback({ type: 'error', message: `Error al actualizar: ${error.message}` });
            } else {
                setFeedback({ type: 'success', message: 'Usuario actualizado correctamente.' });
                onSuccess?.();
            }
        } else {
            // ── CREAR nuevo usuario (via API del servidor, sin confirmación de email) ──
            if (!email.trim()) {
                setFeedback({ type: 'error', message: 'El correo es obligatorio para crear un usuario.' });
                setLoading(false);
                return;
            }
            if (!password || password.length < 6) {
                setFeedback({ type: 'error', message: 'La contraseña debe tener al menos 6 caracteres.' });
                setLoading(false);
                return;
            }

            const res = await fetch('/api/usuarios', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    nombre: nombre.trim(),
                    rut: rut.trim(),
                    email: email.trim().toLowerCase(),
                    rol,
                    servicio: servicio.trim() || null,
                    password,
                }),
            });

            const json = await res.json().catch(() => ({}));
            setLoading(false);

            if (!res.ok) {
                setFeedback({ type: 'error', message: json.error ?? 'Error al crear usuario.' });
                return;
            }

            setFeedback({ type: 'success', message: '✅ Usuario creado. Ya puede iniciar sesión sin confirmar correo.' });

            // Reset formulario
            setNombre(''); setEmail(''); setRut(''); setRol('trabajador');
            setServicio(''); setPassword('');
            onSuccess?.();
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">

            {/* Nombre */}
            <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                    Nombre completo <span className="text-red-500">*</span>
                </label>
                <input
                    type="text"
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                    disabled={loading}
                    required
                    className="w-full px-4 py-2.5 rounded-lg border border-slate-300 text-slate-800
                     focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50 transition"
                    placeholder="Juan Pérez González"
                />
            </div>

            {/* RUT */}
            <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                    RUT <span className="text-red-500">*</span>
                </label>
                <input
                    type="text"
                    value={rut}
                    onChange={(e) => setRut(formatRut(e.target.value))}
                    disabled={loading}
                    maxLength={12}
                    inputMode="numeric"
                    required
                    className="w-full px-4 py-2.5 rounded-lg border border-slate-300 text-slate-800 tracking-wide
                     focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50 transition"
                    placeholder="12.345.678-9"
                />
                {rut.length > 3 && !validateRut(rut) && (
                    <p className="text-xs text-red-500 mt-1">RUT inválido</p>
                )}
            </div>

            {/* Email (solo en creación) */}
            {!esEdicion && (
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                        Correo electrónico <span className="text-red-500">*</span>
                    </label>
                    <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        disabled={loading}
                        required
                        className="w-full px-4 py-2.5 rounded-lg border border-slate-300 text-slate-800
                       focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50 transition"
                        placeholder="usuario@empresa.cl"
                    />
                </div>
            )}

            {/* Email (solo lectura en edición) */}
            {esEdicion && (
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Correo electrónico</label>
                    <p className="px-4 py-2.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-500 text-sm">
                        {usuario.email}
                    </p>
                </div>
            )}

            {/* Password (solo en creación) */}
            {!esEdicion && (
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                        Contraseña temporal <span className="text-red-500">*</span>
                    </label>
                    <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        disabled={loading}
                        minLength={6}
                        required
                        className="w-full px-4 py-2.5 rounded-lg border border-slate-300 text-slate-800
                       focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50 transition"
                        placeholder="Mínimo 6 caracteres"
                    />
                </div>
            )}

            {/* Rol */}
            <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                    Rol <span className="text-red-500">*</span>
                </label>
                <select
                    value={rol}
                    onChange={(e) => setRol(e.target.value)}
                    disabled={loading}
                    className="w-full px-4 py-2.5 rounded-lg border border-slate-300 text-slate-800 bg-white
                     focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50 transition"
                >
                    {ROLES.map(({ value, label }) => (
                        <option key={value} value={value}>{label}</option>
                    ))}
                </select>

                {/* Descripción del rol seleccionado */}
                <div className="mt-1.5 text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-2 border border-slate-100">
                    {rol === 'trabajador' && '✔ Puede confirmar recepciones de insumos.'}
                    {rol === 'jefatura' && '✔ Puede solicitar insumos + confirmar recepciones.'}
                    {rol === 'tens' && '✔ Puede gestionar inventario, despachos + confirmar recepciones.'}
                    {rol === 'prevencionista' && '✔ Acceso completo: inventario, solicitudes, despachos, recepciones.'}
                    {rol === 'administrador' && '✔ Acceso total + CRUD usuarios + reportes globales.'}
                </div>
            </div>

            {/* Servicio / Área */}
            <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                    Servicio / Área <span className="text-slate-400 font-normal">(opcional)</span>
                </label>
                <input
                    type="text"
                    value={servicio}
                    onChange={(e) => setServicio(e.target.value)}
                    disabled={loading}
                    className="w-full px-4 py-2.5 rounded-lg border border-slate-300 text-slate-800
                     focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50 transition"
                    placeholder="Ej: Obra Costanera Norte, Área Seguridad…"
                />
            </div>

            {/* Estado activo (solo en edición) */}
            {esEdicion && (
                <div className="flex items-center gap-3 px-4 py-3 bg-slate-50 rounded-xl border border-slate-100">
                    <button
                        type="button"
                        role="switch"
                        aria-checked={activo}
                        onClick={() => setActivo(!activo)}
                        disabled={loading}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition
              ${activo ? 'bg-green-500' : 'bg-slate-300'} disabled:opacity-50`}
                    >
                        <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition
                ${activo ? 'translate-x-6' : 'translate-x-1'}`}
                        />
                    </button>
                    <span className="text-sm text-slate-700">
                        {activo ? 'Usuario activo' : 'Usuario desactivado'}
                    </span>
                </div>
            )}

            {/* Feedback */}
            {feedback && (
                <Alert type={feedback.type} message={feedback.message} onClose={() => setFeedback(null)} />
            )}

            {/* Acciones */}
            <div className="flex gap-3 pt-2">
                <button
                    type="submit"
                    disabled={loading}
                    className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold
                     rounded-xl transition disabled:opacity-60 flex items-center justify-center gap-2"
                >
                    {loading ? (
                        <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (esEdicion ? '💾 Guardar cambios' : '👤 Crear usuario')}
                </button>
                <button
                    type="button"
                    onClick={onClose}
                    disabled={loading}
                    className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-600
                     hover:bg-slate-50 transition text-sm font-medium"
                >
                    Cancelar
                </button>
            </div>
        </form>
    );
}
