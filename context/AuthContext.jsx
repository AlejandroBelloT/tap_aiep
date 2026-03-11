'use client';

import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { ROLE_HOME } from '@/lib/roles';

const AuthContext = createContext(null);

// ── Claves para sincronización entre pestañas ─────────────────────────────
// La sesión vive en sessionStorage (se borra al cerrar el navegador), pero
// al abrir una nueva pestaña sessionStorage está vacío. Para que el usuario
// no tenga que volver a autenticarse, la nueva pestaña solicita la sesión
// activa a otras pestañas del mismo origen mediante eventos de localStorage.
const LS_SYNC_REQUEST = 'tab_sync_request';   // nueva pestaña solicita sesión
const LS_SYNC_RESPONSE = 'tab_sync_response';  // pestaña activa responde con datos
const LS_GLOBAL_SIGNOUT = 'global_signout';    // logout intencional → cerrar todas

const TAB_SYNC_TIMEOUT_MS = 350; // espera máxima de respuesta de otra pestaña

/**
 * Solicita la sesión activa a otras pestañas del mismo navegador.
 * Devuelve true si se recibieron datos y se importaron a sessionStorage.
 */
function syncSessionFromOtherTab() {
    return new Promise((resolve) => {
        if (typeof window === 'undefined') { resolve(false); return; }

        let settled = false;

        const onStorage = (e) => {
            if (e.key !== LS_SYNC_RESPONSE || !e.newValue) return;
            if (settled) return;
            settled = true;
            window.removeEventListener('storage', onStorage);
            clearTimeout(timer);

            try {
                const data = JSON.parse(e.newValue);
                // Importar las claves de sesión de Supabase al sessionStorage de esta pestaña
                Object.entries(data).forEach(([k, v]) => sessionStorage.setItem(k, v));
                localStorage.removeItem(LS_SYNC_REQUEST);
                localStorage.removeItem(LS_SYNC_RESPONSE);
                resolve(Object.keys(data).length > 0);
            } catch {
                resolve(false);
            }
        };

        const timer = setTimeout(() => {
            if (settled) return;
            settled = true;
            window.removeEventListener('storage', onStorage);
            localStorage.removeItem(LS_SYNC_REQUEST);
            resolve(false); // ninguna pestaña respondió → navegador recién abierto
        }, TAB_SYNC_TIMEOUT_MS);

        window.addEventListener('storage', onStorage);
        localStorage.setItem(LS_SYNC_REQUEST, Date.now().toString());
    });
}

export function AuthProvider({ children }) {
    const router = useRouter();
    const pathname = usePathname();

    const [session, setSession] = useState(undefined); // undefined = aún no inicializado
    const [perfil, setPerfil] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const navigatedRef = useRef(false);
    const pathnameRef = useRef(pathname);
    const inactivityTimerRef = useRef(null);
    useEffect(() => { pathnameRef.current = pathname; }, [pathname]);

    // ── 1. Inicialización de sesión con sincronización entre pestañas ────
    useEffect(() => {
        let isMounted = true;

        const initAuth = async () => {
            // Intentar leer sesión desde el sessionStorage de ESTA pestaña
            const { data: { session: s } } = await supabase.auth.getSession();

            if (s) {
                // Sesión disponible en esta pestaña (refresh o pestaña ya inicializada)
                if (isMounted) setSession(s);
            } else {
                // sessionStorage vacío: puede ser navegador recién abierto o pestaña nueva.
                // Intentar obtener la sesión desde otra pestaña activa del mismo navegador.
                const synced = await syncSessionFromOtherTab();
                if (synced) {
                    const { data: { session: ss } } = await supabase.auth.getSession();
                    if (isMounted) setSession(ss ?? null);
                } else {
                    // Ninguna pestaña activa respondió → el navegador fue cerrado y reabierto.
                    // La sesión anterior queda invalidada y se requiere nuevo login.
                    if (isMounted) setSession(null);
                }
            }
        };

        initAuth();

        // Responder a solicitudes de sincronización de otras pestañas
        const onSyncRequest = (e) => {
            if (e.key !== LS_SYNC_REQUEST || !e.newValue) return;
            // Compartir las claves de Supabase del sessionStorage de esta pestaña
            const data = {};
            for (let i = 0; i < sessionStorage.length; i++) {
                const key = sessionStorage.key(i);
                if (key.startsWith('sb-')) data[key] = sessionStorage.getItem(key);
            }
            if (Object.keys(data).length > 0) {
                localStorage.setItem(LS_SYNC_RESPONSE, JSON.stringify(data));
            }
        };

        // Cerrar sesión en esta pestaña cuando otra pestaña hizo logout intencional
        const onGlobalSignOut = (e) => {
            if (e.key === LS_GLOBAL_SIGNOUT && e.newValue) {
                supabase.auth.signOut();
            }
        };

        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, newSession) => {
            // TOKEN_REFRESHED: renovación silenciosa del token, no reprocesar la sesión
            // para evitar que los formularios pierdan su estado.
            if (event === 'TOKEN_REFRESHED') return;
            if (isMounted) setSession(newSession ?? null);
        });

        window.addEventListener('storage', onSyncRequest);
        window.addEventListener('storage', onGlobalSignOut);

        return () => {
            isMounted = false;
            subscription.unsubscribe();
            window.removeEventListener('storage', onSyncRequest);
            window.removeEventListener('storage', onGlobalSignOut);
        };
    }, []); // solo se monta una vez

    // ── 2. Cuando session cambia, cargar perfil y navegar ────────────
    useEffect(() => {
        if (session === undefined) return; // aún no inicializado

        const manejarSesion = async () => {
            if (!session) {
                // Sin sesión → limpiar y redirigir si estamos en ruta protegida
                setPerfil(null);
                setLoading(false);
                const ruta = pathnameRef.current;
                if (ruta && ruta !== '/login' && ruta !== '/setup') {
                    router.replace('/login');
                }
                return;
            }

            // Si ya tenemos el perfil cargado para este mismo usuario no volvemos a
            // cargar ni activamos el loading (evita desmontar formularios en curso
            // cuando el token se renueva al volver a la pestaña).
            if (perfil?.id === session.user.id) return;

            // Hay sesión → cargar perfil
            setLoading(true);

            let { data, error: e } = await supabase
                .from('usuarios')
                .select('*')
                .eq('id', session.user.id)
                .single();

            // Reintento si el trigger de Auth aún no terminó de insertar
            if (!data && !e) {
                await new Promise((r) => setTimeout(r, 1000));
                ({ data, error: e } = await supabase
                    .from('usuarios')
                    .select('*')
                    .eq('id', session.user.id)
                    .single());
            }

            if (e) console.error('[Auth] Error cargando perfil:', e.message);

            setPerfil(data ?? null);
            setLoading(false);

            // Navegar al dashboard del rol (solo una vez por login)
            if (data?.rol && !navigatedRef.current) {
                const destino = ROLE_HOME[data.rol] ?? '/';
                // Solo navegar si NO estamos ya en una ruta del dashboard
                const ruta = pathnameRef.current;
                const yaEnDashboard = Object.values(ROLE_HOME).some((r) => ruta?.startsWith(r));
                if (!yaEnDashboard) {
                    navigatedRef.current = true;
                    router.push(destino);
                    setTimeout(() => { navigatedRef.current = false; }, 3000);
                }
            }
        };

        manejarSesion();
    }, [session, perfil, router]);

    // ── signIn ── Solo RUT → email → signInWithPassword ──────────────
    const signIn = useCallback(async ({ rut, password }) => {
        setError(null);

        const { data: emailData, error: rpcError } = await supabase
            .rpc('get_email_by_rut', { p_rut: rut.trim() });

        if (rpcError || !emailData) {
            const msg = 'RUT no encontrado o usuario inactivo.';
            setError(msg);
            return { error: msg };
        }

        const { error: signInError } = await supabase.auth.signInWithPassword({
            email: emailData,
            password,
        });

        if (signInError) {
            setError(signInError.message);
            return { error: signInError.message };
        }

        // onAuthStateChange → setSession → useEffect carga perfil y navega
        return { error: null };
    }, []);

    // ── signOut ──────────────────────────────────────────────────────
    const signOut = useCallback(async () => {
        // Notificar a otras pestañas abiertas para que también cierren sesión
        localStorage.setItem(LS_GLOBAL_SIGNOUT, Date.now().toString());
        await supabase.auth.signOut();
        // onAuthStateChange → setSession(null) → useEffect redirige a /login
    }, []);

    // ── 3. Cierre de sesión por inactividad (10 minutos) ─────────────
    const INACTIVITY_TIMEOUT = 10 * 60 * 1000;

    const resetInactivityTimer = useCallback(() => {
        if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
        inactivityTimerRef.current = setTimeout(() => {
            supabase.auth.signOut();
        }, INACTIVITY_TIMEOUT);
    }, []);

    useEffect(() => {
        if (!session) {
            // Sin sesión activa, limpiar el timer si existe
            if (inactivityTimerRef.current) {
                clearTimeout(inactivityTimerRef.current);
                inactivityTimerRef.current = null;
            }
            return;
        }

        const eventos = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click'];
        const handleActividad = () => resetInactivityTimer();

        eventos.forEach((ev) => window.addEventListener(ev, handleActividad, { passive: true }));
        resetInactivityTimer(); // arrancar el temporizador al iniciar sesión

        return () => {
            eventos.forEach((ev) => window.removeEventListener(ev, handleActividad));
            if (inactivityTimerRef.current) {
                clearTimeout(inactivityTimerRef.current);
                inactivityTimerRef.current = null;
            }
        };
    }, [session, resetInactivityTimer]);

    const value = {
        session: session ?? null,
        user: session?.user ?? null,
        perfil,
        loading,
        error,
        signIn,
        signOut,
        refreshPerfil: () => session && fetchPerfilManual(session.user.id),
    };

    async function fetchPerfilManual(userId) {
        const { data } = await supabase.from('usuarios').select('*').eq('id', userId).single();
        if (data) setPerfil(data);
    }

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
    return ctx;
}

export default AuthContext;
