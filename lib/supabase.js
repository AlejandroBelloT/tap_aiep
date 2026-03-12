import { createClient } from '@supabase/supabase-js';

// Durante el build estático de Next.js algunas páginas (como /_not-found) importan
// este módulo sin llegar a usar el cliente. Se usan placeholders para que createClient
// no lance excepciones en tiempo de compilación; en runtime las variables reales deben
// estar configuradas (en .env.local o en las Variables de Entorno de Vercel).
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co';
const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'placeholder';

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
