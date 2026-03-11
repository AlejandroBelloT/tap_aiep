import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnon) {
    throw new Error(
        'Faltan las variables de entorno NEXT_PUBLIC_SUPABASE_URL y/o NEXT_PUBLIC_SUPABASE_ANON_KEY'
    );
}

/**
 * Cliente Supabase singleton para uso en el navegador.
 * Se reutiliza la misma instancia en toda la app.
 */
// Usar sessionStorage en el navegador: la sesión se borra al cerrar la pestaña/navegador.
// En el servidor (SSR/API routes) no existe window, se omite el storage y Supabase
// opera sin persistencia, que es el comportamiento correcto para el lado servidor.
export const supabase = createClient(supabaseUrl, supabaseAnon, {
    auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storage: typeof window !== 'undefined' ? window.sessionStorage : undefined,
    },
});
