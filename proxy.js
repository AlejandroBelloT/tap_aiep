/**
 * proxy.js  (antes middleware.js — renombrado para Next.js 16+)
 *
 * En esta app la sesión de Supabase se gestiona en el cliente mediante
 * localStorage, por lo que el proxy no puede leer el token de autenticación.
 * La protección de rutas se delega al DashboardLayout (cliente).
 *
 * Este proxy solo sirve para:
 *  - Dejar pasar todos los assets estáticos y rutas de API.
 *  - En el futuro, si se migra a @supabase/ssr con cookies, aquí se
 *    puede agregar la verificación de sesión en el servidor.
 */

import { NextResponse } from 'next/server';

export function proxy(request) {
    // Dejar pasar todo — la auth la maneja el DashboardLayout en el cliente
    return NextResponse.next();
}

export const config = {
    matcher: ['/((?!_next/static|_next/image|favicon.ico|public/).*)'],
};
