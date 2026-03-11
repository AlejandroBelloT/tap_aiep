/**
 * app/api/setup/route.js
 *
 * API Route del SERVIDOR para crear el primer administrador.
 * Usa la SERVICE_ROLE_KEY para llamar a auth.admin.createUser,
 * lo que crea el usuario con el email ya confirmado (sin necesitar
 * ningún flujo de verificación de correo).
 *
 * ⚠ SOLO funciona mientras no haya ningún administrador activo.
 */
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export async function POST(request) {
    // Cliente admin inicializado en tiempo de ejecución (nunca llega al browser)
    const supabaseAdmin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY,
        { auth: { autoRefreshToken: false, persistSession: false } }
    );
    try {
        const { nombre, rut, email, servicio, password } = await request.json();

        // ── Validaciones básicas ───────────────────────────────────────
        if (!nombre?.trim()) return NextResponse.json({ error: 'El nombre es obligatorio.' }, { status: 400 });
        if (!rut?.trim()) return NextResponse.json({ error: 'El RUT es obligatorio.' }, { status: 400 });
        if (!email?.trim()) return NextResponse.json({ error: 'El correo es obligatorio.' }, { status: 400 });
        if (!servicio?.trim()) return NextResponse.json({ error: 'El servicio es obligatorio.' }, { status: 400 });
        if (!password || password.length < 8)
            return NextResponse.json({ error: 'La contraseña debe tener al menos 8 caracteres.' }, { status: 400 });

        // ── Verificar que no existe ningún administrador activo ────────
        const { count, error: countError } = await supabaseAdmin
            .from('usuarios')
            .select('*', { count: 'exact', head: true })
            .eq('rol', 'administrador')
            .eq('activo', true);

        if (countError) {
            console.error('[setup] Error al verificar admins:', countError);
            return NextResponse.json({ error: 'Error al verificar el estado del sistema.' }, { status: 500 });
        }

        if (count > 0) {
            return NextResponse.json(
                { error: 'Ya existe un administrador. Esta ruta no está disponible.' },
                { status: 409 }
            );
        }

        // ── Crear usuario en Supabase Auth (email ya confirmado) ──────
        const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
            email: email.trim().toLowerCase(),
            password,
            email_confirm: true,           // ← sin necesidad de verificar correo
            user_metadata: {
                nombre: nombre.trim(),
                rut: rut.trim(),
                rol: 'administrador',
                servicio: servicio.trim(),
            },
        });

        if (authError) {
            console.error('[setup] Error al crear usuario en Auth:', authError);
            return NextResponse.json({ error: authError.message }, { status: 500 });
        }

        // ── Upsert del perfil en public.usuarios ──────────────────────
        const { error: perfilError } = await supabaseAdmin
            .from('usuarios')
            .upsert({
                id: authData.user.id,
                rut: rut.trim(),
                nombre: nombre.trim(),
                email: email.trim().toLowerCase(),
                rol: 'administrador',
                servicio: servicio.trim(),
                activo: true,
            }, { onConflict: 'id' });

        if (perfilError) {
            console.error('[setup] Error al crear perfil:', perfilError);
            // El usuario de Auth ya fue creado; informamos pero no es fatal
            return NextResponse.json(
                { error: `Usuario de Auth creado, pero error en el perfil: ${perfilError.message}` },
                { status: 500 }
            );
        }

        return NextResponse.json({ ok: true });

    } catch (err) {
        console.error('[setup] Error inesperado:', err);
        return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 });
    }
}
