'use client';
/**
 * components/ui/Badge.jsx
 * Badge de estado para solicitudes e insumos con bajo stock.
 */

const VARIANTS = {
    pendiente: 'bg-amber-100  text-amber-700  border-amber-200',
    autorizada: 'bg-blue-100   text-blue-700   border-blue-200',
    despachada: 'bg-purple-100 text-purple-700 border-purple-200',
    recibida: 'bg-green-100  text-green-700  border-green-200',
    rechazada: 'bg-red-100    text-red-700    border-red-200',
    bajo_stock: 'bg-orange-100 text-orange-700 border-orange-200',
    activo: 'bg-green-100  text-green-700  border-green-200',
};

const LABELS = {
    pendiente: 'Pendiente',
    autorizada: 'Autorizada',
    despachada: 'Despachada',
    recibida: 'Recibida',
    rechazada: 'Rechazada',
    bajo_stock: 'Stock bajo',
    activo: 'Activo',
};

export default function Badge({ estado }) {
    const classes = VARIANTS[estado] ?? 'bg-slate-100 text-slate-600 border-slate-200';
    const label = LABELS[estado] ?? estado;

    return (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${classes}`}>
            {label}
        </span>
    );
}
