/**
 * app/api/usuarios/[id]/route.js
 *
 * DELETE /api/usuarios/:id  →  Eliminar usuario completo
 *
 * 1. Elimina el usuario de Supabase Auth (admin.deleteUser)
 * 2. El CASCADE en la FK public.usuarios.id → auth.users.id
 *    elimina automáticamente el perfil de la tabla pública.
 *    Si no hay CASCADE, también lo eliminamos explícitamente.
 */
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export async function DELETE(_request, { params }) {
    const supabaseAdmin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY,
        { auth: { autoRefreshToken: false, persistSession: false } }
    );
    const { id } = await params;

    if (!id) {
        return NextResponse.json({ error: 'ID de usuario requerido.' }, { status: 400 });
    }

    try {
        // 1. Eliminar perfil de public.usuarios (por si no hay CASCADE)
        await supabaseAdmin.from('usuarios').delete().eq('id', id);

        // 2. Eliminar usuario de Supabase Auth
        const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(id);

        if (authError) {
            console.error('[api/usuarios/delete] Auth error:', authError);
            return NextResponse.json({ error: authError.message }, { status: 500 });
        }

        return NextResponse.json({ ok: true });
    } catch (err) {
        console.error('[api/usuarios/delete] Error inesperado:', err);
        return NextResponse.json({ error: 'Error inesperado en el servidor.' }, { status: 500 });
    }
}
