'use client';
/**
 * components/admin/reportes/PeriodSelector.jsx
 *
 * Selector de período reutilizable para todos los reportes.
 * Opciones: 1 mes | 3 meses | 6 meses | 1 año | Rango personalizado
 */

const hoy = () => new Date().toISOString().split('T')[0];

function restarDias(dias) {
    const d = new Date();
    d.setDate(d.getDate() - dias);
    return d.toISOString().split('T')[0];
}

const PRESETS = [
    { label: '1 mes', dias: 30 },
    { label: '3 meses', dias: 90 },
    { label: '6 meses', dias: 180 },
    { label: '1 año', dias: 365 },
];

export default function PeriodSelector({ desde, hasta, onChange }) {
    const presetActivo = PRESETS.find(p => {
        const esperado = restarDias(p.dias);
        return desde === esperado && hasta === hoy();
    })?.label ?? 'custom';

    const aplicarPreset = (dias) => {
        onChange({ desde: restarDias(dias), hasta: hoy() });
    };

    return (
        <div className="flex flex-wrap items-center gap-2">
            {/* Botones preset */}
            <div className="flex rounded-lg overflow-hidden border border-slate-200">
                {PRESETS.map(p => (
                    <button
                        key={p.label}
                        type="button"
                        onClick={() => aplicarPreset(p.dias)}
                        className={`px-3 py-1.5 text-xs font-medium transition border-r border-slate-200 last:border-r-0
                            ${presetActivo === p.label
                                ? 'bg-blue-600 text-white'
                                : 'bg-white text-slate-600 hover:bg-slate-50'
                            }`}
                    >
                        {p.label}
                    </button>
                ))}
            </div>

            {/* Rango personalizado */}
            <div className="flex items-center gap-1.5 text-xs text-slate-500 flex-wrap">
                <span>Desde</span>
                <input
                    type="date"
                    value={desde}
                    max={hasta || hoy()}
                    onChange={e => onChange({ desde: e.target.value, hasta })}
                    className="text-xs px-2 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <span>hasta</span>
                <input
                    type="date"
                    value={hasta}
                    min={desde}
                    max={hoy()}
                    onChange={e => onChange({ desde, hasta: e.target.value })}
                    className="text-xs px-2 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
            </div>
        </div>
    );
}
