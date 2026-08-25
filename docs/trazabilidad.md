# Trazabilidad de requerimientos

Cruce entre los requerimientos especificados y lo que el prototipo implementa hoy.
Se mantiene en el repositorio, junto al código, para que la coherencia entre
objetivos, requerimientos y avances sea verificable y no declarativa.

Estado a **24 de agosto de 2026**.

| Estado | Significado |
|---|---|
| ✅ | implementado y verificable en el código |
| 🟡 | implementado en parte; la diferencia se indica |
| ⬜ | no implementado |

---

## Módulo base · comunicador por pictogramas

| RF | Estado | Dónde | Nota |
|---|---|---|---|
| RF-01 | ✅ | `js/board.js` | tablero en cuadrícula con paginación |
| RF-02 | ✅ | `js/board.js` | |
| RF-03 | ✅ | `js/board.js`, `js/speech.js` | ampliación, etiqueta y voz sintetizada |
| RF-04 | ✅ | `js/board.js` | |
| RF-05 | ✅ | `js/app.js`, `js/face.js` | `detectForVideo` cronometrado; la sesión reporta latencia media, percentil 95 y máxima, y por separado el intervalo con que la cámara entrega, para distinguir un límite de cómputo de uno de iluminación |

## Módulo A · captura y detección facial

| RF | Estado | Dónde | Nota |
|---|---|---|---|
| RF-06 | ✅ | `js/face.js` | |
| RF-07 | ✅ | `js/face.js` | se solicita la mayor cadencia disponible |
| RF-08 | ✅ | `js/face.js` | MediaPipe Face Landmarker |
| RF-09 | ✅ | `js/features.js`, `js/facs.js` | medidas con nombre anatómico, trazables a unidades de acción |
| RF-10 | ✅ | `js/features.js` | mediana y desviación absoluta mediana; se conservan los estimadores clásicos para reportar la quietud de la calibración |
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
| RF-30 | ✅ | `js/segunda-opinion.js` | acuerdo y kappa de Cohen |
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
| RF-28 | 🟡 | `js/storage.js`, `index.html` | marcado de segmentos observados (reposo, sonrisa, puchero, malestar) que viaja con cada muestra; falta el marcado de condiciones contextuales como cansancio o alimentación reciente |
| RF-29 | ✅ | `js/storage.js`, `index.html`, `js/app.js` | pantalla propia en la ruta #observacion que registra la codificación de una profesional externa y **no muestra la clasificación del sistema**, para que la observación sea independiente |

---

## Lo que falta, por consecuencia

**RF-29 quedó implementado.** El Capítulo II resuelve el problema de independencia
de la observación, dado que la persona investigadora es también la responsable
legal del participante, mediante la codificación independiente de una profesional en terapia
del lenguaje. RF-29 es el requerimiento que hace ejecutable esa solución. Sin él,
el diseño de estudio descrito no puede llevarse a cabo tal como está redactado.

**RF-28** condiciona la interpretación: sin marcar cansancio, alimentación reciente
o malestar, las diferencias entre sesiones no tienen contexto al que atribuirse.

**RF-05** quedó cerrado: la latencia de inferencia se cronometra y se reporta junto a la cadencia de entrega, que son dos límites distintos y se corrigen de forma distinta.
Reportar el valor actual como latencia de procesamiento sería un dato incorrecto.

**RF-22, RF-23 y RF-24** son de comodidad y no bloquean el estudio.

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
correspondencia una a una entre las siete características y sus unidades de
acción, los 478 puntos de referencia, la concordancia entre citas y referencias,
y la visibilidad de la atribución exigida por la licencia.

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
| Caracterización del algoritmo sobre señal sintética | `node pruebas/deteccion-fasica.mjs` — 13 comprobaciones |
| Caracterización del instrumento sobre registros reales | `node pruebas/analisis-sesion.mjs <export.json>` |
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
