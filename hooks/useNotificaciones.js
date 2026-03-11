'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

/**
 * Devuelve un objeto { [badgeKey]: count } con las notificaciones activas
 * para el perfil dado. Se actualiza en tiempo real vía Realtime de Supabase.
 *
 * Badge keys:
 *   'solicitudes-pendientes' → solicitudes esperando autorización/despacho
 *   'mis-solicitudes'        → solicitudes activas (pendiente/autorizada/despachada) donde soy solicitante o beneficiario
 *   'mis-recepciones'        → solicitudes en estado despachada asignadas a mí (listas para recepcionar)
 *   'compras-pendientes'     → solicitudes de compra pendientes (solo admin)
 */
export function useNotificaciones(perfil) {
    const [badges, setBadges] = useState({});

    useEffect(() => {
        if (!perfil) return;
        const { id, rol } = perfil;
        let activo = true;

        async function fetchBadges() {
            const nuevo = {};

            if (rol === 'tens' || rol === 'prevencionista') {
                const { count } = await supabase
                    .from('solicitudes')
                    .select('id', { count: 'exact', head: true })
                    .eq('estado', 'pendiente');
                if (count > 0) nuevo['solicitudes-pendientes'] = count;
            }

            // Solicitudes activas donde tengo algo pendiente
            {
                const [{ count: c1 }, { count: c2 }] = await Promise.all([
                    // Como solicitante: solicitudes mías aún activas
                    supabase
                        .from('solicitudes')
                        .select('id', { count: 'exact', head: true })
                        .eq('solicitante_id', id)
                        .in('estado', ['pendiente', 'autorizada', 'despachada']),
                    // Como trabajador beneficiario: otro me creó solicitudes aún activas
                    supabase
                        .from('solicitudes')
                        .select('id', { count: 'exact', head: true })
                        .eq('trabajador_id', id)
                        .neq('solicitante_id', id)
                        .in('estado', ['pendiente', 'autorizada', 'despachada']),
                ]);
                const total = (c1 ?? 0) + (c2 ?? 0);
                if (total > 0) nuevo['mis-solicitudes'] = total;
            }

            // Solicitudes despachadas listas para recepcionar
            {
                const { count } = await supabase
                    .from('solicitudes')
                    .select('id', { count: 'exact', head: true })
                    .eq('trabajador_id', id)
                    .eq('estado', 'despachada');
                if (count > 0) nuevo['mis-recepciones'] = count;
            }

            if (rol === 'administrador') {
                const { count } = await supabase
                    .from('solicitudes_compra')
                    .select('id', { count: 'exact', head: true })
                    .eq('estado', 'pendiente');
                if (count > 0) nuevo['compras-pendientes'] = count;
            }

            if (activo) setBadges(nuevo);
        }

        fetchBadges();

        // Suscripción realtime para actualizar badges al instante
        const channel = supabase
            .channel(`notif-${id}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'solicitudes' }, fetchBadges)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos' }, fetchBadges)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'solicitudes_compra' }, fetchBadges)
            .subscribe();

        return () => {
            activo = false;
            supabase.removeChannel(channel);
        };
    }, [perfil]);

    return badges;
}
