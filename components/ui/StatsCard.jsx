'use client';
/**
 * components/ui/StatsCard.jsx
 * Tarjeta de estadística para dashboards.
 */
export default function StatsCard({ label, value, icon, color = 'blue', subtext }) {
    const colors = {
        blue: 'bg-blue-50   text-blue-600   border-blue-100',
        green: 'bg-green-50  text-green-600  border-green-100',
        amber: 'bg-amber-50  text-amber-600  border-amber-100',
        red: 'bg-red-50    text-red-600    border-red-100',
        purple: 'bg-purple-50 text-purple-600 border-purple-100',
        slate: 'bg-slate-50  text-slate-600  border-slate-100',
    };

    return (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex items-start gap-4">
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-xl border ${colors[color] ?? colors.blue}`}>
                {icon}
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-xs text-slate-500 font-medium truncate">{label}</p>
                <p className="text-2xl font-bold text-slate-800 leading-tight mt-0.5">{value ?? '—'}</p>
                {subtext && <p className="text-xs text-slate-400 mt-0.5">{subtext}</p>}
            </div>
        </div>
    );
}
