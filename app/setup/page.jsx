'use client';
/**
 * app/setup/page.jsx
 *
 * Página de configuración inicial — úsala UNA SOLA VEZ para crear
 * el primer usuario administrador del sistema.
 *
 * Comportamiento:
 *  - Si ya existe al menos un administrador activo → muestra aviso y enlace al login.
 *  - Si no existe ninguno → muestra el formulario de creación.
 */
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { formatRut, validateRut } from '@/lib/rut';

const ESTADOS = {
    loading: 'loading',
    disponible: 'disponible',   // puede crear admin
    bloqueado: 'bloqueado',    // ya existe un admin
    exito: 'exito',        // admin creado exitosamente
};

export default function SetupPage() {
    const router = useRouter();
    const [estado, setEstado] = useState(ESTADOS.loading);

    // Campos del form
    const [nombre, setNombre] = useState('');
    const [rut, setRut] = useState('');
    const [email, setEmail] = useState('');
    const [servicio, setServicio] = useState('');
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');

    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    // Verifica si ya existe un administrador
    useEffect(() => {
        const verificar = async () => {
            const { count } = await supabase
                .from('usuarios')
                .select('*', { count: 'exact', head: true })
                .eq('rol', 'administrador')
                .eq('activo', true);

            setEstado(count > 0 ? ESTADOS.bloqueado : ESTADOS.disponible);
        };
        verificar();
    }, []);

    const handleRutChange = (e) => setRut(formatRut(e.target.value));

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        // Validaciones
        if (!nombre.trim()) { setError('El nombre es obligatorio.'); return; }
        if (!validateRut(rut)) { setError('El RUT ingresado no es válido.'); return; }
        if (!email.trim()) { setError('El correo es obligatorio.'); return; }
        if (!servicio.trim()) { setError('El servicio es obligatorio.'); return; }
        if (password.length < 8) { setError('La contraseña debe tener al menos 8 caracteres.'); return; }
        if (password !== confirm) { setError('Las contraseñas no coinciden.'); return; }

        setSubmitting(true);

        // Llamar al API Route del servidor (usa SERVICE_ROLE_KEY → email ya confirmado)
        const res = await fetch('/api/setup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                nombre: nombre.trim(),
                rut: rut.trim(),
                email: email.trim().toLowerCase(),
                servicio: servicio.trim(),
                password,
            }),
        });

        const data = await res.json();

        if (!res.ok) {
            setError(data.error ?? 'Error desconocido al crear el administrador.');
            setSubmitting(false);
            return;
        }

        setEstado(ESTADOS.exito);
        setSubmitting(false);
    };

    /* ─── Pantalla de carga ───────────────────────────────── */
    if (estado === ESTADOS.loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50">
                <span className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    /* ─── Ya existe un admin ──────────────────────────────── */
    if (estado === ESTADOS.bloqueado) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-linear-to-br from-blue-50 to-slate-100 px-4">
                <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center space-y-4">
                    <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto text-3xl">
                        ✅
                    </div>
                    <h1 className="text-xl font-bold text-slate-800">Sistema ya configurado</h1>
                    <p className="text-slate-500 text-sm">
                        Ya existe al menos un administrador activo en el sistema.
                        Esta página de configuración ya no está disponible.
                    </p>
                    <button
                        onClick={() => router.push('/login')}
                        className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition"
                    >
                        Ir al inicio de sesión
                    </button>
                </div>
            </div>
        );
    }

    /* ─── Admin creado con éxito ──────────────────────────── */
    if (estado === ESTADOS.exito) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-linear-to-br from-blue-50 to-slate-100 px-4">
                <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center space-y-4">
                    <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto text-3xl">
                        🎉
                    </div>
                    <h1 className="text-xl font-bold text-slate-800">¡Administrador creado!</h1>
                    <div className="bg-slate-50 rounded-xl p-4 text-left text-sm space-y-1">
                        <p><span className="text-slate-500">Nombre:</span>   <span className="font-medium text-slate-800">{nombre}</span></p>
                        <p><span className="text-slate-500">RUT:</span>      <span className="font-medium text-slate-800 font-mono">{rut}</span></p>
                        <p><span className="text-slate-500">Correo:</span>   <span className="font-medium text-slate-800">{email}</span></p>
                        <p><span className="text-slate-500">Servicio:</span> <span className="font-medium text-slate-800">{servicio}</span></p>
                        <p><span className="text-slate-500">Rol:</span>      <span className="font-medium text-blue-700">Administrador</span></p>
                    </div>
                    <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                        ⚠ Si Supabase tiene la confirmación de correo activada, deberás confirmar el email antes de iniciar sesión.
                        Puedes desactivarla en <strong>Authentication → Settings → Email confirmations</strong>.
                    </p>
                    <button
                        onClick={() => router.push('/login')}
                        className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition"
                    >
                        Ir al inicio de sesión
                    </button>
                </div>
            </div>
        );
    }

    /* ─── Formulario de creación ──────────────────────────── */
    return (
        <div className="min-h-screen flex items-center justify-center bg-linear-to-br from-blue-50 to-slate-100 px-4">
            <div className="w-full max-w-md">

                {/* Encabezado */}
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-600 text-white text-2xl font-bold mb-4 shadow-lg">
                        GI
                    </div>
                    <h1 className="text-2xl font-bold text-slate-800">Configuración inicial</h1>
                    <p className="text-slate-500 text-sm mt-1">Crea el primer administrador del sistema</p>
                </div>

                <div className="bg-white rounded-2xl shadow-xl p-8">
                    <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 mb-6 text-sm text-blue-700">
                        <span className="text-base shrink-0">ℹ️</span>
                        <span>Esta página solo estará disponible mientras no exista ningún administrador.</span>
                    </div>

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
                                disabled={submitting}
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
                                onChange={handleRutChange}
                                disabled={submitting}
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

                        {/* Email */}
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">
                                Correo electrónico <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                disabled={submitting}
                                required
                                className="w-full px-4 py-2.5 rounded-lg border border-slate-300 text-slate-800
                                 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50 transition"
                                placeholder="admin@empresa.cl"
                            />
                            <p className="text-xs text-slate-400 mt-1">
                                Solo para Supabase Auth — el login se hace con RUT.
                            </p>
                        </div>

                        {/* Servicio */}
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">
                                Servicio / Área <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="text"
                                value={servicio}
                                onChange={(e) => setServicio(e.target.value)}
                                disabled={submitting}
                                required
                                className="w-full px-4 py-2.5 rounded-lg border border-slate-300 text-slate-800
                                 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50 transition"
                                placeholder="Ej: Administración, Recursos Humanos…"
                            />
                        </div>

                        {/* Rol — solo lectura */}
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Rol</label>
                            <div className="w-full px-4 py-2.5 rounded-lg border border-slate-200 bg-slate-50
                                            text-slate-500 text-sm flex items-center gap-2">
                                <span className="inline-block w-2 h-2 rounded-full bg-blue-500"></span>
                                Administrador
                                <span className="ml-auto text-xs text-slate-400">(fijo para esta página)</span>
                            </div>
                        </div>

                        {/* Contraseña */}
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">
                                Contraseña <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                disabled={submitting}
                                minLength={8}
                                required
                                className="w-full px-4 py-2.5 rounded-lg border border-slate-300 text-slate-800
                                 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50 transition"
                                placeholder="Mínimo 8 caracteres"
                            />
                        </div>

                        {/* Confirmar contraseña */}
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">
                                Confirmar contraseña <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="password"
                                value={confirm}
                                onChange={(e) => setConfirm(e.target.value)}
                                disabled={submitting}
                                required
                                className={`w-full px-4 py-2.5 rounded-lg border text-slate-800
                                 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50 transition
                                 ${confirm && confirm !== password ? 'border-red-400' : 'border-slate-300'}`}
                                placeholder="Repite la contraseña"
                            />
                            {confirm && confirm !== password && (
                                <p className="text-xs text-red-500 mt-1">Las contraseñas no coinciden</p>
                            )}
                        </div>

                        {/* Error global */}
                        {error && (
                            <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
                                <svg className="w-4 h-4 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                                </svg>
                                {error}
                            </div>
                        )}

                        {/* Botón */}
                        <button
                            type="submit"
                            disabled={submitting}
                            className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl
                             transition shadow-sm disabled:opacity-60 flex items-center justify-center gap-2"
                        >
                            {submitting ? (
                                <>
                                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                    Creando administrador…
                                </>
                            ) : '🔑 Crear administrador'}
                        </button>

                        <p className="text-center text-xs text-slate-400 pt-1">
                            ¿Ya tienes cuenta?{' '}
                            <button type="button" onClick={() => router.push('/login')}
                                className="text-blue-600 underline hover:text-blue-700">
                                Iniciar sesión
                            </button>
                        </p>
                    </form>
                </div>
            </div>
        </div>
    );
}
