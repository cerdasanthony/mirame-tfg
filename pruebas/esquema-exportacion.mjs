/** Compatibilidad explícita para los archivos analizados fuera del navegador. */
export const ESQUEMA = "mirame-export";
export const VERSIONES_COMPATIBLES = new Set([1]);

export function validarEsquema(datos) {
  if (datos?.esquema == null && datos?.versionEsquema == null) {
    return "Exportación histórica sin versión de esquema; se procesa en modo compatible.";
  }
  if (datos.esquema !== ESQUEMA) {
    throw new Error(`Esquema no reconocido: ${String(datos.esquema)}`);
  }
  if (!VERSIONES_COMPATIBLES.has(datos.versionEsquema)) {
    throw new Error(`Versión de exportación no compatible: ${String(datos.versionEsquema)}`);
  }
  return null;
}
