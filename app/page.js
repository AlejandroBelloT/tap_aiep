'use client';
/**
 * app/page.js
 * Ruta raíz "/": redirige según sesión activa.
 */
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { ROLE_HOME } from '@/lib/roles';

export default function RootPage() {
  const { perfil, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (perfil?.rol) {
      router.replace(ROLE_HOME[perfil.rol] ?? '/login');
    } else {
      router.replace('/login');
    }
  }, [loading, perfil, router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <main className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-slate-500 text-sm">Cargando sistema…</p>
      </main>
    </div>
  );
}
