/**
 * Salida de voz mediante la Web Speech API.
 *
 * Si el navegador no la soporta, la aplicación continúa sin voz: la salida
 * visual del pictograma es suficiente para comunicar.
 */

const disponible = "speechSynthesis" in window;

export function hablar(texto) {
  if (!disponible) return false;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(texto);
  u.lang = "es-CR";
  u.rate = 0.9;
  window.speechSynthesis.speak(u);
  return true;
}

export const vozDisponible = disponible;
