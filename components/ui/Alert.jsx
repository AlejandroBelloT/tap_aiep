'use client';
/**
 * components/ui/Alert.jsx
 * Alerta de feedback (success / error / warning / info).
 */
const VARIANTS = {
    success: {
        wrapper: 'bg-green-50 border-green-200 text-green-800',
        icon: (
            <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
        ),
    },
    error: {
        wrapper: 'bg-red-50 border-red-200 text-red-800',
        icon: (
            <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
        ),
    },
    warning: {
        wrapper: 'bg-amber-50 border-amber-200 text-amber-800',
        icon: (
            <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
        ),
    },
    info: {
        wrapper: 'bg-blue-50 border-blue-200 text-blue-800',
        icon: (
            <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
        ),
    },
};

export default function Alert({ type = 'info', message, onClose }) {
    if (!message) return null;
    const { wrapper, icon } = VARIANTS[type] ?? VARIANTS.info;

    return (
        <div className={`flex items-start gap-2.5 px-4 py-3 rounded-lg border text-sm ${wrapper}`}>
            {icon}
            <span className="flex-1">{message}</span>
            {onClose && (
                <button onClick={onClose} className="ml-auto shrink-0 opacity-70 hover:opacity-100 transition">
                    ✕
                </button>
            )}
        </div>
    );
}
