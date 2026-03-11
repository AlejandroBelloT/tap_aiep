/**
 * app/api/usuarios/route.js
 *
 * POST /api/usuarios  →  Crear nuevo usuario (sin confirmación de correo)
 *
 * Usa la SERVICE_ROLE_KEY (server-only) para llamar a
 * auth.admin.createUser con email_confirm: true, evitando que
 * el usuario tenga que verificar su correo para poder iniciar sesión.
 */
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

export async function POST(request) {
    try {
        const { nombre, rut, email, rol, servicio, password } = await request.json();

        // ── Validaciones ───────────────────────────────────────────────
        if (!nombre?.trim()) return NextResponse.json({ error: 'El nombre es obligatorio.' }, { status: 400 });
        if (!rut?.trim()) return NextResponse.json({ error: 'El RUT es obligatorio.' }, { status: 400 });
        if (!email?.trim()) return NextResponse.json({ error: 'El correo es obligatorio.' }, { status: 400 });
        if (!rol?.trim()) return NextResponse.json({ error: 'El rol es obligatorio.' }, { status: 400 });
        if (!password || password.length < 6)
            return NextResponse.json({ error: 'La contraseña debe tener al menos 6 caracteres.' }, { status: 400 });

        // ── Crear en Supabase Auth (email ya confirmado) ───────────────
        const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
            email: email.trim().toLowerCase(),
            password,
            email_confirm: true,   // ← sin necesidad de verificar correo
            user_metadata: {
                nombre: nombre.trim(),
                rut: rut.trim(),
                rol,
                servicio: servicio?.trim() || null,
            },
        });

        if (authError) {
            console.error('[api/usuarios] Auth error:', authError);
            return NextResponse.json({ error: authError.message }, { status: 500 });
        }

        // ── Upsert del perfil en public.usuarios ───────────────────────
        // El trigger handle_new_user ya lo inserta, pero hacemos upsert
        // para garantizar que rol y servicio queden correctos.
        const { error: perfilError } = await supabaseAdmin
            .from('usuarios')
            .upsert({
                id: authData.user.id,
                rut: rut.trim(),
                nombre: nombre.trim(),
                email: email.trim().toLowerCase(),
                rol,
                servicio: servicio?.trim() || null,
                activo: true,
            }, { onConflict: 'id' });

        if (perfilError) {
            console.error('[api/usuarios] Perfil error:', perfilError);
            // El usuario de Auth ya fue creado; avisamos pero no fallamos del todo
            return NextResponse.json(
                { error: `Usuario creado en Auth pero error en perfil: ${perfilError.message}` },
                { status: 207 }
            );
        }

        return NextResponse.json({ ok: true, id: authData.user.id }, { status: 201 });
    } catch (err) {
        console.error('[api/usuarios] Error inesperado:', err);
        return NextResponse.json({ error: 'Error inesperado en el servidor.' }, { status: 500 });
    }
}
