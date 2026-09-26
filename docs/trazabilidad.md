# Trazabilidad de requerimientos

Cruce entre los requerimientos especificados y lo que el prototipo implementa hoy.
Se mantiene en el repositorio, junto al código, para que la coherencia entre
objetivos, requerimientos y avances sea verificable y no declarativa.

Estado a **25 de septiembre de 2026**.

| Estado | Significado |
|---|---|
| ✅ | implementado y verificable en el código |
| 🟡 | implementado en parte; la diferencia se indica |
| ⬜ | no implementado |

---

## Módulo base · comunicador por pictogramas

| RF | Estado | Dónde | Nota |
|---|---|---|---|
| RF-01 | ✅ | `js/board.js` | tablero en cuadrícula con desplazamiento vertical |
| RF-02 | ✅ | `js/board.js` | |
| RF-03 | ✅ | `js/board.js`, `js/speech.js` | ampliación, etiqueta y voz sintetizada |
| RF-04 | ✅ | `js/board.js` | recorrido vertical mediante desplazamiento táctil |
| RF-05 | ✅ | `js/app.js`, `js/face.js` | cada selección conserva el intervalo desde la selección anterior; `detectForVideo` se cronometra por separado y la sesión reporta latencia media, percentil 95 y máxima, además del intervalo con que la cámara entrega |

## Módulo A · captura y detección facial

| RF | Estado | Dónde | Nota |
|---|---|---|---|
| RF-06 | ✅ | `js/face.js` | |
| RF-07 | ✅ | `js/face.js` | se solicita la mayor cadencia disponible |
| RF-08 | ✅ | `js/face.js` | MediaPipe Face Landmarker |
| RF-09 | ✅ | `js/features.js`, `js/facs.js` | 14 agregaciones de blendshapes con nombre observable; pose por landmarks/matriz y correspondencia aproximada con 19 unidades de acción |
| RF-10 | ✅ | `js/features.js` | mediana y estimador Qn; sustitución trazable de dispersión no medible y estimadores clásicos conservados para reportar quietud |
| RF-11 | ✅ | `js/face.js`, `js/app.js` | distingue «sin fotograma nuevo» de «fotograma sin rostro» |
| RF-12 | ✅ | `index.html`, `js/app.js` | |

## Módulo B · distribución de características faciales

| RF | Estado | Dónde | Nota |
|---|---|---|---|
| RF-13 | ✅ | `js/classifier.js` | ventana de 5 s con ponderación por cercanía |
| RF-14 | ✅ | `js/classifier.js` | histéresis y permanencia con retroceso gradual |
| RF-15 | ✅ | `js/classifier.js` | |
| RF-16 | ✅ | `js/app.js`, `js/storage.js` | |
| RF-17 | 🟡 | `index.html` | el panel presenta el compuesto en sigmas, no en la escala −1 a +1 que especifica el requerimiento |
| RF-26 | ✅ | `js/storage.js` | |
| RF-27 | ✅ | `js/classifier.js` | «datos insuficientes» en lugar de atribuir perfil |
| RF-30 | ✅ | `js/segunda-opinion.js` | capacidad opcional de acuerdo y kappa de Cohen; desactivada por defecto por costo de ejecución y no usada como verdad de referencia |
| RF-31 | ✅ | `js/app.js`, `js/storage.js` | guarda vector crudo y vector de unidades de acción |

## Módulo B′ · vía fásica

| RF | Estado | Dónde | Nota |
|---|---|---|---|
| RF-32 | ✅ | `js/app.js` | línea base propia sobre canales de unidades de acción |
| RF-33 | ✅ | `js/microexpresiones.js` | filtro adaptado a transitorios, multiescala, sin suavizar |
| RF-34 | ✅ | `js/microexpresiones.js` | umbral del ruido medido; sustitución empírica cuando no es medible |
| RF-35 | ✅ | `js/microexpresiones.js` | los no resolubles se marcan, no se descartan |
| RF-36 | ✅ | `js/microexpresiones.js` | cadencia medida, no supuesta |
| RF-37 | ✅ | `js/microexpresiones.js` | `contradiceNeutro` |
| RF-38 | ✅ | `js/microexpresiones.js` | coincidencia con cierre de ojos; se marca |
| RF-39 | ✅ | `js/app.js`, `js/storage.js` | escritura periódica cada 10 s |

## Módulo C · reordenamiento heurístico

| RF | Estado | Dónde | Nota |
|---|---|---|---|
| RF-18 | ✅ | `js/heuristica.js` | con tolerancia a huecos breves |
| RF-19 | ✅ | `js/heuristica.js`, `js/board.js` | |
| RF-20 | ✅ | `js/app.js` | registra «se sugirió X, se eligió Y» |
| RF-21 | ✅ | `js/heuristica.js` | desactivado por defecto, para la fase de línea base |

## Módulo de administración

| RF | Estado | Dónde | Nota |
|---|---|---|---|
| RF-22 | ⬜ | — | el conjunto de pictogramas está fijo en `js/board.js`; no hay configuración |
| RF-23 | 🟡 | `js/app.js` | se configuran umbrales y frontalidad; no la ventana temporal ni la frecuencia de análisis |
| RF-24 | 🟡 | `js/storage.js` | exporta JSON; falta CSV |
| RF-25 | ✅ | `js/storage.js` | |
| RF-28 | ✅ | `js/storage.js`, `index.html`, `js/app.js` | segmentos observados y condiciones concurrentes de contexto —vocalización, movimiento mandibular, parpadeo, cansancio informado y alimentación reciente— viajan con muestras y selecciones sin alterar el clasificador |
| RF-29 | ✅ | `index.html`, `js/app.js`, `js/storage.js`, `pruebas/analisis-observaciones.mjs` | pantalla completa sin salida de la máquina; registra transiciones de perfil y condiciones puntuales con dos relojes; análisis posterior por alineación temporal |

---

## Lo que falta, por consecuencia

**El tablero no utiliza paginación.** La implementación actual usa una cuadrícula
responsiva con desplazamiento vertical. El documento 18 y la matriz se redactan
con esta decisión porque es la interacción que existe en `js/board.js` y evita
documentar controles que no están presentes en la interfaz.

**Cada identificador de sesión usa una sola línea base.** `arrancar()` crea el
registro y, al terminar la calibración, completa esa misma cabecera. «Nueva
sesión» cierra el registro vigente, reinicia latencia, cadencia, alineación y
acuerdo, crea otro identificador y solo entonces calibra de nuevo. Un cierre
abrupto todavía puede dejar `fin` nulo, pero conserva la última actualización de
métricas escrita durante la sesión.

**La evaluación independiente ya es ejecutable, pero todavía no está realizada.**
RF-29 permite recoger la codificación sin mostrar la salida del sistema y el
script de análisis calcula acuerdo observado, matriz de confusión, kappa y AC1.
Estas métricas no constituyen evidencia hasta que existan sesiones codificadas
por la profesional prevista en el protocolo.

**RF-28 quedó cerrado como capacidad de registro, no como explicación causal.**
Las condiciones de contexto se adjuntan a los datos para estratificar el análisis;
el clasificador no las consume ni atribuye a ellas los cambios observados.

**RF-05** quedó cerrado con dos magnitudes diferenciadas: `latenciaMs` en una
selección representa el intervalo entre selecciones; la latencia de inferencia
se cronometra en `face.js` y se guarda en las métricas de sesión. Confundirlas
produciría una conclusión técnica incorrecta.

**RF-22, RF-23 y RF-24** son de comodidad y no bloquean el estudio.

## Auditoría del 26 de agosto de 2026

La auditoría de interfaz confirmó que el tablero funciona en escritorio y en un
viewport móvil con el panel fijado: el panel pasa a la parte inferior, no aparece
desbordamiento horizontal y los pictogramas conservan una cuadrícula táctil. La
prueba automatizada completa mantiene 105 comprobaciones aprobadas. La cámara
física de un teléfono todavía debe verificarse durante la ejecución del protocolo
con el dispositivo objetivo.

**Sensibilidad a la dispersión sustituida.** La vía tónica conserva el criterio
operativo anterior para no volver invisibles acciones unipolares que permanecen
en cero durante el reposo. En paralelo ejecuta la misma cadena excluyendo los
canales cuya dispersión no pudo medirse. Cada muestra, selección y sesión informa
la proporción de categorías que cambia entre ambas variantes. Es un análisis de
sensibilidad: no presenta ninguna de las dos como verdad de referencia.

**Observación independiente.** Se restauró RF-29 como una vista que cubre por
completo el panel del sistema. Las marcas de perfil se interpretan como
transiciones vigentes y las condiciones como eventos puntuales. El análisis toma
como máximo una muestra por segundo por defecto para no tratar el muestreo de
250 ms como observaciones independientes.

**Migración de datos.** IndexedDB pasa a versión 5. La versión 4 solo creaba el
almacén de observaciones si también debía crear el de selecciones; una base que
ya tuviera selecciones podía actualizarse sin recibir RF-29. La migración queda
ahora independiente e idempotente.

---

## Auditoría del 25 de septiembre de 2026

**Fundamento externo por regla.** `docs/fundamento-cientifico-clasificador.md`
separa evidencia directa, antecedente contextual y decisión del prototipo. AU12
y AU4 forman el núcleo con respaldo externo; las regiones adicionales quedan
como hipótesis que debe superar una comparación por ablación. El mapeo
MediaPipe→AU se declara aproximado conforme a la ficha del modelo y al marco de
Turrisi et al. (2026), no como intensidad FACS certificada.

**Calibración reproducible.** Cada sesión conserva una instantánea de umbrales,
suavizado, histéresis y permanencia. Cambiar un corte rota la sesión y repite la
línea base. `pruebas/calibrar-umbrales.mjs` ajusta tres cortes ordenados solo en
sesiones de calibración y evalúa después en identificadores distintos; también
compara el compuesto operativo con el núcleo AU12/AU4 guardado en paralelo.

**Observación definida.** `docs/manual-codificacion-observacional.md` convierte
positivo, neutro, negativo leve, negativo intenso y sin dato en criterios
observables. El manual prohíbe inferir emoción sentida, intención o dolor y
distingue concordancia sistema–observadora de fiabilidad interobservador.

---

## Auditoría del 10 de septiembre de 2026

**Integridad de la unidad experimental.** Se eliminó la pareja de sesión
provisional/sesión calibrada. La calibración completa la sesión existente y una
recalibración abre una sesión nueva, de modo que el identificador, la línea base
y las métricas del instrumento describen el mismo intervalo.

**Métricas aisladas por sesión.** Los acumuladores de latencia, cadencia,
alineación, acuerdo y recorrido de canales se reinician al rotar la sesión. Antes
podían incluir observaciones de toda la vida de la página y atribuirlas a la
última sesión.

**Reproducibilidad.** La exportación declara nombre y versión de esquema. Se
añadió una prueba de sintaxis sobre todos los módulos y un flujo de GitHub Actions
que ejecuta `npm test`. El protocolo científico queda versionado en
`docs/protocolo-validacion.md`.

---

## Auditoría del 24 de agosto de 2026

Se revisó la coherencia entre lo que los documentos afirman, lo que el código
hace y lo que los datos reales sostienen. Nueve hallazgos, todos resueltos.

**La escala en sigmas no provenía del participante en la mayoría de canales.**
Sobre once sesiones reales, 60 de 77 canales de línea base terminaban exactamente
en el piso constante de 0,02, y la mediana de la dispersión medida era ese piso.
En la línea base de unidades de acción la proporción llegaba al 88 %. Para esos
canales la puntuación z dividía por una constante elegida a mano y no por la
dispersión del participante. Corregido con el mismo criterio que ya usaba la vía
fásica: sustitución por la mediana de los canales medibles de esa sesión. La
proporción de canales gobernados por la constante bajó del 78 % al 18 %, y los
que quedan son sesiones en las que ningún canal resultó medible.

**Los fotogramas no son observaciones independientes.** La autocorrelación medida
a 250 ms es 0,787, que extrapolada al intervalo entre fotogramas da cerca de 0,97
y un tiempo de decorrelación de 1,1 s. Una línea base de tres segundos abarca dos
o tres de esos tiempos. No se corrige, porque reunir veinte observaciones
efectivas exigiría más de veinte segundos de rostro quieto y el participante es
un niño en edad preescolar. Se mide y se reporta con cada sesión.

**Capacidades documentadas que no se ejecutaban.** `asimetria()` estaba escrita y
argumentada pero nadie la invocaba; ahora se registra por muestra. La proporción
de recortes alineados decía reportarse y no se calculaba; ahora se acumula por
sesión. La restricción con que se abrió la cámara no llegaba a las métricas.

**Menores.** El backlog pedía línea base de cinco segundos y el código usaba
tres. La atribución de ARASAAC estaba en tres copias y ninguna viajaba con los
datos exportados; ahora la exportación la incluye. Cuatro exportaciones sin
consumidor: dos recibieron uno, una se retiró y otra pasó a normalizar la
evidencia negativa, que es para lo que estaba escrita.

**Verificado correcto.** El kappa de Cohen, la cobertura de RF-39, la
correspondencia documentada entre las características faciales y sus unidades de
acción estimadas por proxy, los 478 puntos de referencia, la concordancia entre
citas y referencias, y la visibilidad de la atribución exigida por la licencia.

## Advertencia sobre la procedencia de las metricas

Las sesiones registradas hasta el 25 de agosto de 2026 proceden en su mayoria de
la **computadora de desarrollo**, no de la tablet prevista para el estudio. Las
cifras de cadencia, resolucion temporal, tasa de deteccion y canales sin
recorrido describen ese equipo y ese rostro adulto, y no deben leerse como
caracterizacion del dispositivo objetivo.

Las sesiones anteriores no identifican el equipo, de modo que ya no es posible
separarlas con certeza. A partir de la version v38 cada sesion registra en que
equipo corrio, y desde ahi las metricas quedan atribuibles.

## Evidencias verificables

| Qué | Cómo comprobarlo |
|---|---|
| **Toda la batería de una vez** | `npm test` — 150 comprobaciones en nueve baterías |
| Sintaxis de todos los módulos | `npm run check` — 29 archivos |
| Contrato de interfaz y recursos | `node pruebas/estructura.mjs` — IDs requeridos, duplicados y archivos locales |
| Contrato de exportación | `node pruebas/esquema.mjs` — versión vigente, legado y rechazo de versiones desconocidas |
| Regla de clasificación sobre puntuaciones z | `node pruebas/clasificacion.mjs` — 22 comprobaciones |
| Cada expresión, del coeficiente al estado | `node pruebas/expresiones.mjs` — 38 comprobaciones |
| La referencia contra la que se mide todo | `node pruebas/linea-base.mjs` — 24 comprobaciones |
| Caracterización del algoritmo sobre señal sintética | `node pruebas/deteccion-fasica.mjs` — 13 comprobaciones |
| Caracterización del instrumento sobre registros reales | `node pruebas/analisis-sesion.mjs <export.json>` |
| Acuerdo con codificación independiente | `node pruebas/analisis-observaciones.mjs <export.json>`; su batería tiene 11 comprobaciones e incluye eventos por condición observada |
| Ajuste separado de cortes | `node pruebas/calibrar-umbrales.mjs <export.json> --calibracion=... --evaluacion=...`; su batería tiene 7 comprobaciones |
| Generación del juego de iconos | `python pruebas/generar-iconos.py <origen>` |
| Historial de decisiones | mensajes de commit, que documentan qué se probó y qué salió peor |

## Requerimientos no funcionales

Solo se han verificado dos de forma explícita:

- **RNF-05** (funcionamiento sin conexión): se había roto al incorporar los módulos
  nuevos, que no estaban en la precarga del service worker. Corregido, y la precarga
  pasó a ser tolerante a fallos individuales.
- **RNF-15** (cadencia de captura): nuevo. La aplicación pide la mayor disponible,
  funciona con la que reciba y reporta la que obtuvo.

Los trece restantes **no están auditados**. Conviene revisarlos antes de la entrega
en lugar de darlos por cumplidos.
