# Protocolo de validación técnica y científica

Versión 1.1 · 25 de septiembre de 2026

Este protocolo separa tres preguntas que no deben confundirse:

1. ¿El software funciona de forma reproducible en el dispositivo objetivo?
2. ¿Las salidas del instrumento concuerdan con una codificación humana independiente?
3. ¿El comunicador y su reordenamiento son utilizables y apoyan la interacción del participante?

Una respuesta favorable a la primera pregunta no demuestra las otras dos. El
prototipo describe configuraciones faciales; no reconoce emociones, intenciones,
dolor ni diagnósticos. Esta restricción es coherente con la evidencia de que la
relación entre movimiento facial y emoción es variable, contextual y no
unívoca ([Barrett et al., 2019](https://doi.org/10.1177/1529100619832930)).

## 1. Diseño y unidad de análisis

El proyecto es una evaluación instrumental y de viabilidad con un participante.
Cada **sesión**, definida por una sola línea base y un solo dispositivo, es la
unidad mínima de análisis. Los fotogramas dentro de una sesión están
autocorrelacionados y no se tratarán como observaciones independientes.

Las conclusiones se limitarán al participante, dispositivo y condiciones
observadas. No se emplearán pruebas paramétricas de grupo ni lenguaje causal. Si
se desea evaluar causalmente el reordenamiento, hará falta un diseño de caso
único con manipulación y replicación de fases; una comparación simple antes y
después no basta. Los estándares de caso único distinguen expresamente los
criterios de diseño de la evidencia de una relación funcional
([WWC, 2010](https://ies.ed.gov/ncee/wwc/Document/229)).

## 2. Resultados y métricas predefinidas

| Dominio | Resultado | Cálculo | Unidad |
|---|---|---|---|
| Captura | tasa de detección facial | fotogramas con rostro / fotogramas nuevos procesados | sesión |
| Pose | tasa de descarte | fotogramas descartados por pose / fotogramas con rostro | sesión |
| Rendimiento | latencia de inferencia | mediana, p95 y máximo de `detectForVideo` | sesión y dispositivo |
| Cadencia | intervalo de entrega | mediana y máximo entre marcas de captura | sesión y dispositivo |
| Ventana | validez previa a selección | fotogramas faciales válidos / fotogramas de la ventana | selección |
| Calibración | cobertura de escala | canales con dispersión medida / canales totales | sesión |
| Robustez | sensibilidad a sustitución | proporción de clasificaciones que cambia al excluir canales con escala sustituida | sesión |
| Concordancia | acuerdo observado, kappa y AC1 | sistema frente a observación independiente | sesión y conjunto |
| Clasificación | matriz, sensibilidad, especificidad y F1 macro | sistema frente a codificación independiente | conjunto de evaluación |
| Interacción | selección, latencia y aceptación de sugerencia | eventos del comunicador | selección y sesión |
| Usabilidad | problemas observados y valoración de cuidador/profesional | instrumento definido antes de la prueba | persona evaluadora |

Kappa se reportará junto al acuerdo observado y AC1, no aisladamente, porque la
prevalencia alta de una categoría puede producir valores de kappa contraintuitivos
([revisión metodológica](https://pmc.ncbi.nlm.nih.gov/articles/PMC5712640/)).

## 3. Fases de evaluación

### Fase 0 · verificación reproducible del software

- Ejecutar `npm test` en cada cambio y conservar el resultado de integración continua.
- Registrar versión de aplicación, versión de reglas y versión del esquema exportado.
- Verificar funcionamiento sin cámara: el tablero, la voz y el registro de selección deben continuar.
- Verificar que «Nueva sesión» cierre la anterior y produzca un identificador distinto.
- Confirmar que cada sesión contenga como máximo una calibración.

### Fase 1 · banco técnico en el dispositivo objetivo

Realizar sesiones breves en combinaciones controladas de iluminación, distancia,
pose y movimiento. No usar estas corridas para estimar exactitud emocional. Para
cada condición se reportan tasa de detección, descarte por pose, latencia p95,
cadencia medida, resolución temporal y cobertura de canales.

MediaPipe entrega 478 puntos y 52 coeficientes *blendshape*, pero la llamada web
`detectForVideo` es síncrona y bloquea el hilo de interfaz. Por eso la necesidad
de un *Web Worker* se decidirá a partir de la ocupación medida, no por suposición
([documentación oficial de MediaPipe](https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker/web_js)).

### Fase 2 · calibración del clasificador

- Usar sesiones distintas de las reservadas para evaluación.
- Seguir `docs/plan-ajuste-umbrales.md` y registrar la asignación de sesiones antes de optimizar.
- Comparar el núcleo AU12/AU4 con el compuesto extendido y sus ablaciones; más canales no implican mayor validez.
- Ajustar umbrales solo con el subconjunto de calibración.
- Congelar la versión de reglas y los umbrales antes de abrir el conjunto de evaluación.
- Documentar toda exclusión y todo cambio. Si se cambia una regla después de ver
  los resultados, esa corrida vuelve a ser exploratoria.
- No optimizar contra el segundo clasificador: su acuerdo es contraste interno,
  no verdad de referencia.

### Fase 3 · concordancia con observación independiente

La persona observadora usa `#observacion`, que oculta la salida del sistema. Las
marcas se alinean después por tiempo mediante
`node pruebas/analisis-observaciones.mjs <export.json>`.
Las instrucciones y categorías se fijan en
`docs/manual-codificacion-observacional.md`.

Antes de recolectar se fijan por escrito:

- definiciones observables de cada categoría, sin nombres de emociones;
- tolerancia temporal para emparejar marcas;
- reglas de «sin dato», oclusión, habla, parpadeo y movimiento mandibular;
- criterio de exclusión de sesiones por baja cobertura o fallo técnico;
- intervalo de submuestreo para evitar pseudorreplicación.

Se reportará la matriz completa y no solo un escalar. Los intervalos de confianza
se obtendrán remuestreando sesiones o bloques temporales, nunca fotogramas sueltos.

### Fase 4 · viabilidad de interacción

Primero se observa el comunicador con el reordenamiento desactivado. El modo
heurístico solo se prueba después de que el tablero base sea estable. La variable
independiente es «reordenamiento desactivado/activado»; las salidas faciales no
son la intervención.

Resultados descriptivos:

- número de selecciones intencionales confirmado por cuidador;
- latencia entre selecciones, informada con mediana y rango intercuartílico;
- proporción de sugerencias aceptadas, ignoradas y sin datos faciales suficientes;
- errores de toque, abandonos y necesidad de ayuda;
- incidentes en los que el reordenamiento obstaculizó una selección.

Con una sola fase A y una sola fase B solo se hablará de viabilidad, no de
eficacia. Una afirmación causal requeriría fases replicadas, medición estable y
un plan compatible con estándares de caso único.

## 4. Criterios de calidad y reglas de decisión

Los umbrales de aceptación se fijarán antes de la fase confirmatoria, después del
piloto técnico y sin consultar sus etiquetas de evaluación. Como mínimo:

- no analizar clasificación cuando la ventana sea insuficiente;
- estratificar por dispositivo y versión de reglas;
- declarar cuántos canales usaron escala sustituida;
- no llamar microexpresión a un transitorio solo por su duración;
- no interpretar ausencia de evento como ausencia de expresión;
- no combinar sesiones si cambió la línea base, el dispositivo o el clasificador;
- conservar resultados negativos y fallos de calibración.

## 5. Ética, privacidad y seguridad

- Consentimiento informado de la persona responsable y asentimiento del
  participante cuando sea aplicable.
- Uso del análisis facial siempre opcional; el comunicador continúa sin cámara.
- Procesamiento local sin guardar video ni imágenes.
- Exportaciones tratadas como datos sensibles, con custodia, plazo de retención y
  eliminación definidos por el protocolo institucional.
- La sugerencia nunca selecciona por la persona ni elimina opciones.
- Ante incomodidad, fatiga o rechazo se detiene la prueba sin penalización.
- Ninguna salida se usa para diagnóstico, dolor, emoción o toma de decisiones clínicas.

## 6. Informe mínimo por corrida

Cada resultado deberá identificar:

- fecha, dispositivo, resolución, navegador y versión de aplicación;
- versión de reglas, umbrales y estado de la segunda opinión;
- instantánea de suavizado, histéresis, permanencia y retroceso;
- duración, número de selecciones y cantidad de datos faltantes;
- calidad de línea base, cobertura de canales y sensibilidad a sustituciones;
- latencia, cadencia y resolución temporal reales;
- desviaciones del protocolo y motivo de exclusión, si corresponde.

El archivo exportado declara `esquema: "mirame-export"` y
`versionEsquema: 1`. Un análisis debe rechazar o migrar explícitamente una versión
desconocida en lugar de asumir que todos los JSON tienen la misma estructura.
