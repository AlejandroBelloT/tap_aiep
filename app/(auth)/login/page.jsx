'use client';
/**
 * app/(auth)/login/page.jsx
 * Pantalla de inicio de sesión del sistema.
 * Login con RUT + contraseña.
 */
import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { formatRut, validateRut } from '@/lib/rut';

export default function LoginPage() {
    const { signIn } = useAuth();

    const [rut, setRut] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const handleRutChange = (e) => {
        setRut(formatRut(e.target.value));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        if (!rut || !password) {
            setError('Ingresa tu RUT y contraseña.');
            return;
        }

        if (!validateRut(rut)) {
            setError('El RUT ingresado no es válido. Verifica el formato (ej: 12.345.678-9).');
            return;
        }

        setSubmitting(true);
        const { error: signInError } = await signIn({ rut, password });
        // Si hay error, liberar — si no, onAuthStateChange navega y desmonta este componente
        if (signInError) {
            setSubmitting(false);
            if (signInError.includes('RUT no encontrado') || signInError.includes('inactivo')) {
                setError('RUT no registrado o usuario inactivo.');
            } else if (signInError.includes('Invalid login credentials')) {
                setError('RUT o contraseña incorrectos.');
            } else if (signInError.includes('Email not confirmed')) {
                setError('La cuenta aún no ha sido confirmada. Contacta al administrador.');
            } else {
                setError(signInError);
            }
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-linear-to-br from-blue-50 to-slate-100 px-4">
            <div className="w-full max-w-md">

                {/* Logo / Título */}
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-600 text-white text-2xl font-bold mb-4 shadow-lg">
                        GI
                    </div>
                    <h1 className="text-2xl font-bold text-slate-800">Sistema de Gestión de Insumos</h1>
                    <p className="text-slate-500 text-sm mt-1">Inicia sesión para continuar</p>
                </div>

                {/* Card del formulario */}
                <div className="bg-white rounded-2xl shadow-xl p-8">
                    <form onSubmit={handleSubmit} className="space-y-5">

                        {/* RUT */}
                        <div>
                            <label htmlFor="rut" className="block text-sm font-medium text-slate-700 mb-1">
                                RUT
                            </label>
                            <input
                                id="rut"
                                type="text"
                                autoComplete="username"
                                inputMode="numeric"
                                value={rut}
                                onChange={handleRutChange}
                                disabled={submitting}
                                maxLength={12}
                                className="w-full px-4 py-2.5 rounded-lg border border-slate-300 text-slate-800 placeholder-slate-400
                           focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                           disabled:bg-slate-50 disabled:cursor-not-allowed transition tracking-wide"
                                placeholder="12.345.678-9"
                            />
                        </div>

                        {/* Password */}
                        <div>
                            <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-1">
                                Contraseña
                            </label>
                            <input
                                id="password"
                                type="password"
                                autoComplete="current-password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                disabled={submitting}
                                className="w-full px-4 py-2.5 rounded-lg border border-slate-300 text-slate-800 placeholder-slate-400
                           focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                           disabled:bg-slate-50 disabled:cursor-not-allowed transition"
                                placeholder="••••••••"
                            />
                        </div>

                        {/* Error */}
                        {error && (
                            <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-2.5">
                                <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                                </svg>
                                {error}
                            </div>
                        )}

                        {/* Botón */}
                        <button
                            type="submit"
                            disabled={submitting}
                            className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg
                         transition shadow-sm hover:shadow-md disabled:opacity-60 disabled:cursor-not-allowed
                         flex items-center justify-center gap-2"
                        >
                            {submitting ? (
                                <>
                                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                    Ingresando…
                                </>
                            ) : 'Ingresar'}
                        </button>
                    </form>
                </div>

                <p className="text-center text-xs text-slate-400 mt-6">
                    Sistema de Gestión de Insumos y Asignación © {new Date().getFullYear()}
                </p>
            </div>
        </div>
    );
}
