# Estado actual del proyecto de licenciatura

**Proyecto:** Mírame

**Programa:** Licenciatura en Informática con Énfasis en Desarrollo Web, Universidad Nacional

**Fecha de corte:** 26 de agosto de 2026

**Versión de la evidencia empírica examinada:** `mirame-v58`, commit `4bbf05f`
**Naturaleza del documento:** estado técnico y científico de una prueba de concepto; no es un informe de validación clínica.

## 1. Dictamen ejecutivo

Mírame es actualmente una **prueba de concepto funcional e instrumentada**. La
aplicación integra en un mismo artefacto un comunicador de Comunicación
Aumentativa y Alternativa (CAA), captura facial en el dispositivo, clasificación
de perfiles faciales observables, registro temporal previo a la selección de
pictogramas, una vía separada para eventos faciales breves y herramientas de
evaluación independiente.

La integración técnica de extremo a extremo está demostrada en la computadora de
desarrollo. Esto significa que la cámara entrega datos, los modelos se ejecutan,
las mediciones se normalizan, las selecciones y eventos se almacenan y el registro
puede exportarse y analizarse. **No significa que las etiquetas faciales sean
todavía válidas respecto de una observación humana ni que el comportamiento del
sistema en la tablet y con el participante objetivo esté caracterizado.**

El estado científico actual es, por tanto, el siguiente:

> El artefacto permite realizar la evaluación propuesta, pero la evidencia
> recogida hasta la fecha caracteriza principalmente al instrumento y descubre
> sus limitaciones. Todavía no sostiene conclusiones sobre las expresiones del
> participante, asociaciones entre perfiles y pictogramas, usabilidad ni efecto
> del reordenamiento heurístico.

La etapa de Design Science Research más avanzada es **diseño y desarrollo**, con
una demostración técnica inicial. La **evaluación formal del estudio de caso
único no se ha completado**.

## 2. Relación con el Documento 18

El Documento 18 define la pregunta de investigación en términos de viabilidad
técnica de integrar clasificación facial observable, CAA, ejecución en tablet y
registro de asociaciones a lo largo de una serie de sesiones. Define además cinco
objetivos específicos: estado del arte, requerimientos, arquitectura, desarrollo
del clasificador y evaluación de la prueba de concepto.

El alcance aprobado impone límites que siguen vigentes:

- es una prueba de concepto, no un producto listo para distribución;
- describe configuraciones faciales observables y no emociones o estados internos;
- utiliza un diseño de caso único y no pretende generalización poblacional;
- no realiza validación clínica ni mide efectividad terapéutica;
- debe evaluarse en la tablet objetivo y con el participante previsto;
- requiere codificación independiente por una profesional externa;
- debe reportar las limitaciones del instrumento junto con cada resultado.

Este documento conserva esos límites. Ningún resultado técnico se presenta como
resultado clínico ni como inferencia emocional.

## 3. Cómo leer los estados de avance

Para evitar que el avance de software se confunda con evidencia científica, se
usan cuatro niveles distintos:

| Nivel | Significado en este proyecto |
|---|---|
| Implementado | Existe código ejecutable para la capacidad. |
| Verificado | Una prueba automatizada o inspección reproducible comprueba que el código se comporta como fue especificado. |
| Medido | Existe un valor obtenido de una sesión real y atribuible a una versión y un equipo. |
| Validado | La salida fue contrastada contra un criterio externo independiente y alcanzó criterios definidos antes del análisis. |

Una función puede estar implementada y verificada sin estar validada. Ese es el
caso actual del clasificador facial.

## 4. Estado por objetivo específico

| Objetivo | Estado actual | Evidencia | Trabajo que falta |
|---|---|---|---|
| OE1. Analizar el estado del arte | Terminado para el seguimiento actual | Capítulo II y Entregable 1 del Documento 18 | Mantener actualizada la revisión si se incorporan nuevas afirmaciones o métodos. |
| OE2. Especificar requerimientos | Terminado, con trazabilidad viva | 39 RF y 15 RNF; `docs/trazabilidad.md` | Cerrar RF-22, completar RF-23 y RF-24 y auditar 13 RNF. |
| OE3. Diseñar la arquitectura | Implementación técnica avanzada; entregable formal pendiente | Separación por módulos, procesamiento local, IndexedDB, dos vías temporales y degradación segura | Consolidar el documento de arquitectura y relacionarlo explícitamente con decisiones, riesgos y requisitos. |
| OE4. Desarrollar la clasificación | Prototipo funcional y probado; no validado | Clasificador tónico, vía fásica, análisis de sensibilidad, segundo clasificador y 105 comprobaciones automatizadas | Calibrar pesos y umbrales con evidencia externa; caracterizar tablet y participante; resolver baja cobertura basal. |
| OE5. Evaluar la prueba de concepto | No completado | Existe caracterización preliminar del instrumento sobre registros de desarrollo | Ejecutar protocolo de caso único, observación independiente, análisis de asociación, evaluación de usabilidad y resolución temporal en el dispositivo objetivo. |

## 5. Estado de los requerimientos

La matriz de trazabilidad registra **39 requerimientos funcionales**:

- 35 implementados;
- 3 parciales: RF-17, RF-23 y RF-24;
- 1 pendiente: RF-22.

Las capacidades centrales de captura, clasificación, persistencia, detección de
eventos breves, reordenamiento y observación independiente están implementadas.
Los pendientes funcionales se concentran en administración y presentación:
configuración del conjunto de pictogramas, parámetros todavía no configurables y
exportación CSV.

En los requerimientos no funcionales solo se han auditado explícitamente RNF-05,
funcionamiento sin conexión, y RNF-15, cadencia de captura medida. **Los trece RNF
restantes no deben darse por cumplidos hasta que exista una auditoría reproducible.**

## 6. Arquitectura técnica implementada

### 6.1 Comunicador base

El tablero de pictogramas, la salida de voz y la selección táctil funcionan de
forma independiente del análisis facial. Si falla la cámara o el modelo, el
comunicador continúa disponible. Esta degradación segura protege la función
principal y evita que una capacidad experimental se convierta en un punto único
de fallo.

### 6.2 Captura y extracción

La cámara se solicita mediante `getUserMedia`. Los fotogramas se procesan con
`requestVideoFrameCallback` y se sellan con tiempo de captura. MediaPipe Face
Landmarker produce puntos de referencia, orientación y 52 coeficientes de
blendshape en el dispositivo. No se almacenan imágenes ni video.

El catálogo oficial de MediaPipe incluye coeficientes como `eyeWideLeft`,
`eyeWideRight`, `noseSneerLeft` y `noseSneerRight`; estos últimos representan
arrugamiento nasal y **no dilatación de las fosas nasales**. Una conducta no
representada por el modelo no debe incorporarse mediante una regla improvisada.

### 6.3 Vía tónica

La vía tónica describe configuraciones sostenidas. Extrae 14 características
observables, las normaliza contra una línea base de sesión y construye evidencia
positiva y negativa rectificada. La decisión final utiliza suavizado exponencial,
histéresis y permanencia mínima de 500 ms para reducir oscilaciones.

Los cuatro perfiles son ordinales: positivo, neutro, negativo leve y negativo
intenso. Neutro significa que el compuesto queda dentro de la banda que el
instrumento no distingue del reposo; **no significa ausencia de emoción**.

### 6.4 Vía fásica

La vía fásica opera en paralelo sobre unidades de acción sin suavizar. Busca
transitorios y registra inicio, ápice, fin, duración, amplitud, incertidumbre
temporal y resolubilidad. No sustituye la clasificación sostenida y no debe
presentarse como reconocimiento validado de microexpresiones.

La separación entre vías está justificada por sus respuestas temporales: los
filtros que estabilizan la vía tónica eliminan precisamente las variaciones que
la vía fásica intenta localizar.

### 6.5 Persistencia y evaluación

IndexedDB conserva sesiones, muestras derivadas, selecciones, eventos,
condiciones contextuales y observaciones. La exportación JSON incluye versión de
reglas, equipo, calidad de calibración y métricas. La observación independiente
oculta la salida del sistema para reducir sesgo y puede analizarse con matriz de
confusión, acuerdo observado, kappa de Cohen y AC1 de Gwet.

## 7. Evidencia automatizada

La batería completa contiene 105 comprobaciones y pasa sin fallos:

| Batería | Comprobaciones | Qué verifica |
|---|---:|---|
| Clasificación | 19 | cortes, puntuación, histéresis, suavizado y permanencia |
| Expresiones | 38 | correspondencia entre coeficientes, evidencia y estado esperado |
| Línea base | 24 | estimadores, sustitución de dispersión, normalización y calidad |
| Detección fásica | 13 | respuesta a señal sintética, ruido, duración y cadencia |
| Acuerdo con observación | 11 | alineación temporal, matriz, kappa, AC1 y condiciones observadas |

Estas pruebas demuestran coherencia interna del algoritmo contra casos diseñados.
No demuestran exactitud sobre un rostro real, porque la verdad de referencia de
las pruebas sintéticas fue construida por el mismo equipo de desarrollo.

## 8. Evidencia empírica más reciente

### 8.1 Procedencia

El registro `mirame-sesiones-2026-08-26 (2).json` fue exportado con
`mirame-v58`. Contiene dos sesiones, pero solo la sesión 177 dispone de métricas
actuales y entra en el análisis técnico. Procede de Windows, navegador Edge,
pantalla de 1536 × 864, cámara de 640 × 480 y un rostro adulto en la computadora
de desarrollo. **No caracteriza la tablet ni al participante del estudio.**

### 8.2 Captura y ejecución

| Medida | Resultado | Interpretación limitada |
|---|---:|---|
| Duración útil | aproximadamente 61 s | piloto técnico breve |
| Fotogramas procesados | 645 | volumen de ejecución, no observaciones independientes |
| Fotogramas con rostro | 644/645 = 99,84 % | detección alta en este equipo y este encuadre |
| Descartados por pose | 0 | la pose no fue el principal problema del registro |
| Recortes alineados | 92/92 = 100 % | alineación geométrica ejecutada |
| Corrección angular mediana | 0,76° | rostro casi frontal |
| Inferencia media | 22,01 ms | viable en la computadora de desarrollo |
| Inferencia p95 | 38,8 ms | existen fotogramas cuyo costo supera un intervalo de 30 fps |
| Cadencia implicada por resolución | 30,9 fps | insuficiente para describir toda la banda temporal de referencia |
| Incertidumbre temporal | 98 ms | limita eventos breves distinguibles |

La resolución observada deja fuera aproximadamente 36 % de la banda de 40 a
200 ms usada como referencia para eventos muy breves. Lo que no fue muestreado
no puede recuperarse mediante umbrales posteriores.

### 8.3 Calidad de la línea base tónica

La interfaz mostró 40 muestras y 99 % de quietud, pero las muestras estaban
fuertemente correlacionadas:

| Medida | Resultado |
|---|---:|
| Autocorrelación | 0,816 |
| Tamaño efectivo de muestra | 4,05 |
| Canales con dispersión medida | 3/14 = 21,4 % |
| Canales con dispersión sustituida | 11/14 = 78,6 % |

Los tres canales medidos fueron `cejasExternasArriba`, `tensionOcular` y
`labiosFruncidos`. `ojosAbiertos` y `narizArrugada`, entre otros, operaron con
una dispersión prestada de otros canales. Por ello, el texto “línea base
establecida” describe que el procedimiento terminó, no que la calibración haya
alcanzado calidad suficiente para validación.

La aplicación ejecutó además un análisis de sensibilidad: en 52 de 644
comparaciones, 8,07 %, el clasificador operativo y la variante que excluye los
canales con dispersión sustituida produjeron categorías distintas. La salida
depende de la decisión de sustitución en una proporción material que debe
reportarse y estratificarse.

### 8.4 Estados tónicos registrados

En 153 muestras guardadas de la sesión 177 se observó la siguiente distribución:

| Estado | Muestras | Proporción aproximada |
|---|---:|---:|
| Neutro | 99 | 64,7 % |
| Negativo leve | 26 | 17,0 % |
| Negativo intenso | 21 | 13,7 % |
| Positivo | 7 | 4,6 % |

Solo hubo una selección de pictograma y su ventana fue atribuida a neutro. Una
selección no satisface el mínimo de tres selecciones por pictograma que el plan
de análisis exige para reportar asociación. No existe todavía evidencia de una
relación entre perfiles y pictogramas.

### 8.5 Segundo clasificador

En 91 comparaciones de sesión, la proporción de coincidencia fue 60,44 % y el
kappa de Cohen fue −0,014. El acuerdo corregido por azar fue insignificante. El
segundo clasificador es un contraste, no una verdad de referencia, y fue
entrenado con imágenes de rostros adultos; su desacuerdo no permite decidir cuál
de las dos vías es correcta.

La interfaz actual reúne bajo la palabra “incierto” al menos dos causas:

1. puntaje cercano a un corte de decisión;
2. desacuerdo entre el clasificador geométrico y el clasificador por píxeles.

La baja cobertura de calibración es una tercera fuente de incertidumbre, pero no
se diferencia todavía en esa etiqueta. Para que la salida sea interpretable,
las causas deben presentarse y persistirse por separado.

### 8.6 Eventos fásicos

El análisis actual considera 29 eventos de la sesión instrumentada:

- 23 fueron temporalmente resolubles;
- 7 se marcaron como posibles parpadeos;
- la tasa fue de aproximadamente 28 eventos por minuto;
- la entropía normalizada por canal fue 0,829;
- 18 de 19 umbrales de AU, 94,7 %, fueron sustituidos y no medidos.

La tasa ya no presenta los cientos de eventos por minuto de versiones previas,
pero la dependencia de umbrales sustituidos impide interpretar los recuentos
como expresiones confirmadas. Son candidatos producidos por el instrumento.

### 8.7 Ausencia de verdad de referencia

El archivo contiene `observaciones: []`. No existe codificación independiente
contra la cual comparar las 153 muestras. En consecuencia, no pueden calcularse
matriz de confusión, precisión, exhaustividad, F1, kappa ni AC1 respecto de una
observadora humana.

**Veredicto del registro:** demuestra ejecución completa y aporta métricas de
instrumento. No demuestra exactitud de clasificación ni describe de forma
concluyente la expresión facial del participante.

## 9. Justificación científica de las decisiones principales

### 9.1 Describir acciones observables y no emociones

El Facial Action Coding System organiza movimientos musculares observables en
unidades de acción. Una unidad de acción no determina por sí sola un estado
interno. El proyecto adopta por ello un vocabulario descriptivo y limita sus
afirmaciones a la configuración medida.

### 9.2 Modelo dimensional y escala ordinal

Los perfiles se organizan sobre valencia y no sobre categorías emocionales
discretas. El marco dimensional procede del modelo circumplejo de Russell. La
separación negativo intenso/negativo leve es una discretización ordinal de
intensidad y debe colapsarse a tres categorías si los datos independientes no
respaldan su separación.

Al ser ordinales, los perfiles deben resumirse mediante frecuencias, moda o
mediana. No corresponde promediarlos como si las distancias entre categorías
fueran iguales.

### 9.3 Línea base individual

La normalización por sesión intenta expresar cuánto se aparta una configuración
del reposo de esa misma persona. La mediana y el estimador robusto Qn reducen la
influencia de valores atípicos. Esta adaptación solo es defendible en canales
cuya dispersión se midió; cuando se sustituye debe declararse como análisis de
sensibilidad y no ocultarse como calibración individual.

### 9.4 Combinación de unidades de acción

La evidencia positiva conserva AU12 y registra en paralelo el marcador AU6+AU12.
La evidencia negativa agrupa regiones y conserva, también en paralelo, la
estructura de Prkachin y Solomon. Estas combinaciones publicadas se usan como
evidencia descriptiva, no como certificación de alegría, dolor o autenticidad.

La apertura ocular, AU5, solo aporta al lado negativo hasta la intensidad del
descenso de cejas, AU4. La razón es que ojos abiertos sin AU4 también aparecen en
configuraciones como sorpresa, cuya valencia el proyecto no declara. Del mismo
modo, `noseSneer` aproxima AU9, arrugamiento nasal, y no dilatación de las fosas.

### 9.5 Resolución temporal

Para describir inicio, ápice y final se necesitan al menos tres muestras. Con una
cadencia `f`, el piso instrumental es del orden de `3/f`. Esta limitación es de
muestreo: un evento ausente del registro no puede reconstruirse después. Por eso
cada sesión debe informar la cadencia realmente obtenida y la incertidumbre de
duración.

### 9.6 Contraste independiente

El segundo clasificador utiliza un modelo y una representación diferentes, pero
no constituye verdad de referencia. El criterio externo previsto es la
observación independiente sin acceso a la salida del sistema. El acuerdo debe
reportarse con proporción observada, kappa y AC1, acompañado de la matriz y del
soporte por categoría.

### 9.7 Diseño de caso único

El estudio de caso único es coherente con una población heterogénea y con la
pregunta centrada en un participante. Permite describir una trayectoria mediante
medidas repetidas, pero no autoriza generalización estadística. El aprendizaje
del uso de pictogramas es además una variable temporal concurrente que debe
documentarse en la interpretación.

## 10. Amenazas actuales a la validez

### Validez de constructo

- Los blendshapes son aproximaciones del modelo, no codificación FACS humana.
- Los cuatro perfiles dependen de pesos y bandas todavía no calibrados.
- “Incierto” mezcla causas distintas.
- MediaPipe no representa todas las acciones de interés, como la dilatación de
  las fosas nasales.

### Validez interna

- La persona investigadora también es responsable legal del participante.
- No hay observaciones independientes en el registro reciente.
- Habla, parpadeo, alimentación, cansancio y movimiento mandibular pueden
  confundirse con actividad expresiva si no se estratifican.

### Validez del instrumento

- Solo 3/14 canales tónicos y 1/19 umbrales fásicos dispusieron de dispersión
  propia en la sesión reciente.
- Las muestras consecutivas presentan fuerte autocorrelación.
- El acuerdo entre clasificadores fue insignificante.
- Parte de los eventos breves queda fuera de la resolución temporal.

### Validez externa

- La evidencia reciente procede de una computadora y un rostro adulto.
- No se ha caracterizado el instrumento en la tablet, soporte, distancia,
  iluminación y participante definidos por el protocolo.
- Un diseño N = 1 no permite generalizar a otras personas.

### Validez estadística

- Los fotogramas no son réplicas independientes.
- Existe una sola selección interpretable en el archivo reciente.
- No existe soporte por categoría para calcular desempeño contra observación.
- Los resultados exploratorios no deben usarse para fijar y evaluar umbrales
  sobre los mismos datos sin separar calibración y evaluación.

## 11. Decisiones que no deben tomarse todavía

- No asignar valencia a la dilatación nasal mediante un umbral inventado.
- No declarar correcto un perfil por coincidir con la impresión de quien prueba.
- No eliminar canales por intuición antes de contrastarlos con observación.
- No presentar 40 fotogramas basales como 40 observaciones independientes.
- No usar el segundo clasificador como verdad de referencia.
- No reportar asociaciones con menos del soporte definido en el protocolo.
- No atribuir al participante métricas obtenidas con un rostro adulto.
- No ajustar pesos y evaluar su desempeño con la misma sesión.

## 12. Trabajo prioritario para completar la licenciatura

### Prioridad 1. Definir el protocolo de validez antes de recoger resultados

1. Congelar versión, definiciones, categorías y plan de análisis.
2. Definir con el comité los criterios de aceptación y de fallo de calibración.
   Los valores deben derivarse de repetibilidad, incertidumbre y necesidades del
   protocolo, no de conseguir que la salida “se vea correcta”.
3. Definir qué proporción de sesiones tendrá codificación independiente y cómo
   se resolverán categorías con soporte insuficiente.
4. Separar datos destinados a ajuste de los destinados a evaluación.

### Prioridad 2. Caracterizar el dispositivo y contexto objetivo

1. Repetir la caracterización en la tablet, soporte, distancia e iluminación del
   estudio.
2. Medir cadencia, inferencia, detección, frontalidad, tamaño efectivo de muestra,
   cobertura de dispersión y recorrido de cada AU.
3. Establecer si la vía fásica es técnicamente resoluble en ese dispositivo.
4. Registrar por sesión cualquier desviación del protocolo.

### Prioridad 3. Hacer interpretable la incertidumbre

1. Mostrar por separado “cerca del umbral”, “clasificadores en desacuerdo” y
   “calibración con cobertura reducida”.
2. Persistir cada causa junto con la muestra y la selección.
3. Evitar que “línea base establecida” se interprete como calidad suficiente;
   reportar cobertura y tamaño efectivo en el estado de calibración.

### Prioridad 4. Ejecutar la observación independiente

1. Realizar sesiones sin mostrar la salida de la máquina a la observadora.
2. Registrar perfiles y condiciones de vocalización, mandíbula, cierre ocular y
   movimiento general.
3. Analizar a una cadencia que reduzca pseudorreplicación y reportar matriz,
   acuerdo, kappa, AC1 y métricas por categoría con sus soportes.
4. Evaluar por separado la vía tónica y los eventos fásicos.

### Prioridad 5. Evaluar las decisiones del clasificador

1. Contrastar la variante operativa y la variante que excluye dispersiones
   sustituidas.
2. Determinar con datos independientes si negativo leve e intenso son
   separables; si no, reportar tres categorías, como prevé el Documento 18.
3. Analizar el efecto de habla, parpadeo, mandíbula y contextos registrados antes
   de modificar canales o reglas.
4. Estimar estabilidad entre sesiones y no solo ajuste dentro de una sesión.

### Prioridad 6. Completar la evaluación del artefacto

1. Reunir el soporte mínimo de selecciones por pictograma definido en el plan.
2. Construir el índice de asociación solo cuando exista soporte suficiente.
3. Evaluar aceptación o rechazo de sugerencias del Módulo C sin retirar el
   control de selección al participante.
4. Aplicar la evaluación de usabilidad a personas cuidadoras y profesionales en
   terapia del lenguaje.
5. Auditar los trece RNF pendientes.

## 13. Criterios actuales para afirmar resultados

| Afirmación | Estado |
|---|---|
| La PWA integra comunicador y análisis facial en el dispositivo | Sostenida por implementación y pruebas. |
| El flujo completo puede registrar y exportar sesiones | Sostenida por el JSON y los analizadores. |
| La ejecución es viable en la computadora de desarrollo | Sostenida para ese equipo y contexto. |
| La ejecución es viable en la tablet objetivo | Pendiente de medición. |
| Las cuatro etiquetas corresponden a observación humana | No demostrado. |
| La vía fásica detecta microexpresiones reales | No demostrado; solo detecta transitorios candidatos. |
| Existe asociación entre perfil y pictograma | No demostrada; una selección es insuficiente. |
| El reordenamiento mejora la comunicación | No evaluado y fuera de una afirmación clínica. |
| El instrumento es generalizable | No; diseño de caso único. |

## 14. Reproducción del estado técnico

Desde la raíz del repositorio:

```bash
node pruebas/todas.mjs
node pruebas/analisis-sesion.mjs <export.json>
node pruebas/analisis-observaciones.mjs <export.json>
```

La primera orden verifica coherencia interna. La segunda caracteriza calidad y
resolución del instrumento. La tercera solo produce métricas de validez cuando el
archivo contiene observaciones independientes alineables.

## 15. Fuentes científicas y técnicas principales

- Bradley, M. M., y Lang, P. J. (1994). *Measuring emotion: The
  Self-Assessment Manikin and the semantic differential*.
  <https://doi.org/10.1016/0005-7916(94)90063-9>
- Ekman, P., y Friesen, W. V. (1978). *Facial Action Coding System: A
  technique for the measurement of facial movement*.
- Girard, J. M., Cohn, J. F., Yin, L., y Morency, L.-P. (2021).
  *Reconsidering the Duchenne smile*.
  <https://doi.org/10.1007/s42761-020-00030-w>
- Google. *Face Landmarker: blendshape model card*.
  <https://storage.googleapis.com/mediapipe-assets/Model%20Card%20Blendshape%20V2.pdf>
- Google AI Edge. *Face Landmarker blendshape catalog*.
  <https://ai.google.dev/edge/api/mediapipe/python/mp/tasks/vision/drawing_styles/face_landmarker/Blendshapes>
- Kring, A. M., y Sloan, D. M. (2007). *The Facial Expression Coding
  System: Development, validation, and utility*.
  <https://doi.org/10.1037/1040-3590.19.2.210>
- Lugaresi, C., et al. (2019). *MediaPipe: A framework for building
  perception pipelines*. <https://doi.org/10.48550/arXiv.1906.08172>
- Prkachin, K. M., y Solomon, P. E. (2008). *The structure, reliability and
  validity of pain expression*.
  <https://doi.org/10.1016/j.pain.2008.04.010>
- Russell, J. A. (1980). *A circumplex model of affect*.
  <https://doi.org/10.1037/h0077714>
- Stevens, S. S. (1946). *On the theory of scales of measurement*.
  <https://doi.org/10.1126/science.103.2684.677>

## 16. Regla de actualización

Este documento debe actualizarse cuando cambie cualquiera de estos elementos:

- versión de reglas, pesos, umbrales o canales;
- protocolo, objetivos o alcance académico;
- dispositivo o contexto de captura;
- resultados de pruebas automatizadas;
- evidencia de sesión que cambie el dictamen;
- disponibilidad de observación independiente;
- estado de RF o RNF.

Cada actualización debe indicar fecha, versión del software, procedencia de los
datos y qué afirmaciones nuevas quedan sostenidas o dejan de estarlo.
