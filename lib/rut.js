/**
 * lib/rut.js
 *
 * Utilidades para el RUT chileno (formato XX.XXX.XXX-X).
 */

/**
 * Formatea un RUT mientras el usuario escribe.
 * Acepta entrada cruda (ej: "123456789") y devuelve "12.345.678-9".
 */
export function formatRut(value) {
    // Limpia todo excepto dígitos y K
    const clean = value.replace(/[^0-9kK]/g, '').toUpperCase();
    if (clean.length === 0) return '';
    if (clean.length === 1) return clean;

    const body = clean.slice(0, -1);  // todos menos el último (dígito verificador)
    const dv = clean.slice(-1);     // dígito verificador

    // Agrega puntos al cuerpo
    const withDots = body.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return `${withDots}-${dv}`;
}

/**
 * Retorna el RUT limpio (solo dígitos + K, sin puntos ni guión).
 * Ej: "12.345.678-9" → "123456789"
 */
export function cleanRut(rut) {
    return (rut ?? '').replace(/[^0-9kK]/g, '').toUpperCase();
}

/**
 * Valida si un RUT chileno es correcto (algoritmo módulo 11).
 */
export function validateRut(rut) {
    const clean = cleanRut(rut);
    if (clean.length < 2) return false;

    const body = clean.slice(0, -1);
    const dv = clean.slice(-1);

    // Calcula el dígito verificador esperado
    let sum = 0;
    let multiplier = 2;
    for (let i = body.length - 1; i >= 0; i--) {
        sum += parseInt(body[i], 10) * multiplier;
        multiplier = multiplier === 7 ? 2 : multiplier + 1;
    }

    const remainder = 11 - (sum % 11);
    let expectedDv;
    if (remainder === 11) expectedDv = '0';
    else if (remainder === 10) expectedDv = 'K';
    else expectedDv = String(remainder);

    return dv === expectedDv;
}

/**
 * Normaliza un RUT al formato estándar de almacenamiento: "12.345.678-9".
 * Lanza un error si el RUT es inválido.
 */
export function normalizeRut(rut) {
    if (!validateRut(rut)) throw new Error('RUT inválido');
    return formatRut(cleanRut(rut));
}
