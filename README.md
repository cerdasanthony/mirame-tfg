# Mírame

Comunicador de pictogramas con análisis automatizado de expresiones faciales.
Aplicación web progresiva. Todo el procesamiento ocurre en el dispositivo.

**Prueba de concepto de un Trabajo Final de Graduación. No es un producto clínico, no está validado y no debe usarse como herramienta de diagnóstico.**

---

## Qué hace

Un niño no verbal usa un tablero de pictogramas para pedir agua, comida o ayuda. El tablero registra *qué* tocó, pero descarta todo lo que ocurrió **antes** de que lo tocara.

Mírame agrega una cámara que describe, en términos medibles, cómo estaba el rostro en los segundos previos a cada selección, y guarda esa descripción junto al pictograma elegido. Con el tiempo, eso construye un registro de qué configuración facial acompaña a cada pictograma — un patrón que ninguna memoria humana sostiene a lo largo de semanas.

## Qué no hace

- No detecta emociones ni afirma saber lo que la persona siente
- No selecciona automáticamente ni afirma conocer qué quiere la persona; el reordenamiento opcional solo cambia la posición de un pictograma y mantiene todas las opciones disponibles
- No diagnostica nada
- No graba ni almacena video o imágenes
- No envía datos a ningún servidor
- No requiere conexión a internet después de la primera carga

El sistema observa y clasifica configuraciones faciales. **La interpretación de su significado corresponde a la persona cuidadora**, que conoce el contexto, la situación y a la persona usuaria.

---

## Arquitectura

```
Cámara (MediaDevices, 60 fps solicitados)
      ↓
requestVideoFrameCallback  ·  marca de tiempo de CAPTURA, no de repintado
      ↓
MediaPipe Face Landmarker  ·  puntos de referencia 3D + blendshapes
      ↓
      ├──────────────────────────────┬──────────────────────────────┐
      ↓                              ↓
  VÍA TÓNICA                     VÍA FÁSICA
  segundos                       milisegundos
      ↓                              ↓
  14 características             19 Unidades de Acción estimadas por proxy
      ↓                              ↓
  z contra línea base            z contra línea base de AU
      ↓                              ↓
  suavizado + histéresis         filtro adaptado a transitorios
  + dwell de 500 ms              (sin suavizar, canal por canal)
      ↓                              ↓
  positivo / neutro /            eventos con inicio, ápice y fin
  negativo leve / intenso        40–200 / 200–500 / >500 ms
      ↓                              ↓
      └──────────────┬───────────────┘
                     ↓
      Ventana de 5 s previos a la selección
                     ↓
      Registro: pictograma + estados + eventos  →  IndexedDB
                     ↓
      Consulta e interpretación por parte de la persona cuidadora
```

Las dos vías miden el mismo rostro a dos escalas de tiempo. La tónica describe
cómo estaba; la fásica, qué pasó por él. La segunda existe porque el dwell de
500 ms de la primera hace **estructuralmente imposible** registrar una
evento de la banda operativa más breve, definida entre 40 y 200 ms.

### Módulos

| Módulo | Responsabilidad | Archivo |
|---|---|---|
| Comunicador | Tablero de pictogramas, desplazamiento vertical, salida de voz | `js/board.js`, `js/speech.js` |
| A · Captura y detección | Cámara, Face Landmarker, blendshapes | `js/face.js` |
| A · Características | Catorce medidas observables y línea base | `js/features.js` |
| B · Clasificación | Reglas de umbral y ventana temporal | `js/classifier.js` |
| A′ · Unidades de Acción | correspondencias aproximadas con AU de FACS y perfil de expresividad | `js/facs.js` |
| B′ · Vía fásica | Detección de transitorios breves | `js/microexpresiones.js` |
| Persistencia | Sesiones, selecciones e índice de asociación | `js/storage.js` |
| Orquestación | Flujo de sesión y panel en vivo | `js/app.js` |

### Independencia funcional

Los módulos de análisis facial son **capas añadidas** sobre el comunicador. Si la cámara falla, el permiso se deniega o el modelo no carga, el tablero sigue funcionando como comunicador táctil. Esta es una decisión de diseño deliberada, no un caso de error.

---

## Ejecutar

Requiere servirse por HTTP: el acceso a la cámara y los módulos ES no funcionan desde `file://`.

```bash
python -m http.server 8000
```

Después, abrir `http://localhost:8000`. Para probar desde una tablet en la misma red hace falta HTTPS o `localhost`, porque `getUserMedia` solo opera en contextos seguros.

---

## Pruebas y reproducibilidad

La verificación completa es el punto de entrada habitual y es la misma que corre
GitHub Actions en cada cambio:

```bash
npm test
```

Incluye sintaxis de todos los módulos, clasificación, expresiones sintéticas,
línea base robusta, detección fásica y acuerdo con observación independiente.

Los análisis que necesitan un registro exportado se ejecutan aparte porque
responden preguntas empíricas y no pueden fabricar datos durante una prueba:

```bash
node pruebas/deteccion-fasica.mjs
```

Caracteriza el **algoritmo** sobre señal sintética, donde sí existe verdad de
referencia porque la señal se construye. Mide sensibilidad, especificidad, error
de duración y el efecto de la cadencia, sobre 40 realizaciones independientes de
ruido por condición — una sola corrida ilustra, no caracteriza.

```bash
node pruebas/analisis-sesion.mjs <export.json>
```

Caracteriza el **instrumento** sobre un registro real exportado desde la
aplicación. No puede saber si un evento ocurrió de veras; sí puede establecer si
el registro tiene la calidad necesaria para que la pregunta tenga sentido.

```bash
node pruebas/analisis-observaciones.mjs <export.json>
```

Contrasta las muestras del sistema con la codificación independiente registrada
en `#observacion`. Reporta matriz de confusión, acuerdo observado, kappa y AC1;
por defecto toma una muestra por segundo para reducir la pseudorreplicación de
vectores registrados cada 250 ms. También reconstruye los intervalos marcados
como vocalización, movimiento mandibular, cierre ocular o movimiento general y
calcula qué eventos y canales ocurrieron dentro de cada condición.

## Estado de la calibración y de la medición

⚠️ **Los pesos y umbrales de `js/classifier.js` siguen siendo valores iniciales
sin calibrar.** Están puestos para que el flujo funcione de extremo a extremo, no
porque hayan sido validados con nadie.

### Lo que se ha medido sobre señal sintética

Con transitorios de duración y amplitud conocidas, sobre 40 realizaciones:

| Condición | Resultado |
|---|---|
| Ruido puro, 26 s | ningún evento espurio |
| 130 ms · 3 σ · 60 fps | 100 % de detección, error de duración 23 ms |
| 130 ms · 3 σ · 30 fps | **0 % de detección** |
| 130 ms · 1,2 σ · 60 fps | 45 % de detección |
| Expresión sostenida de 3 s | correctamente ignorada por la vía fásica |

A 30 fps el evento no se mide peor: la anchura medida no alcanza el mínimo
resoluble y se rechaza entero, sin dejar rastro. Para la banda operativa de
40 a 200 ms, una cadencia mayor amplía la parte que el instrumento puede describir.

La sensibilidad del 45 % ante un gesto débil es el precio del criterio de
umbral, y hay que declararlo: **una ventana sin eventos no demuestra que no hubo
expresión.** Solo dice que no se detectó.

### Lo que se ha medido sobre registros reales

La evidencia más reciente es la sesión técnica 177 del archivo exportado el
26-08-2026. Procede de una computadora de desarrollo y un rostro adulto; no
caracteriza la tablet ni al participante del estudio.

| Medida | Resultado | Lectura limitada |
|---|---:|---|
| Duración útil | aproximadamente 61 s | piloto técnico breve |
| Detección facial | 644/645 = 99,84 % | este equipo y este encuadre |
| Inferencia media / p95 | 22,01 / 38,8 ms | viable en la computadora de desarrollo |
| Cadencia implicada | 30,9 fps | resolución temporal aproximada de 98 ms |
| Dispersión tónica sustituida | 11 de 14 canales | calibración de cobertura reducida |
| Umbrales fásicos sustituidos | 18 de 19 canales | los eventos dependen de una escala prestada |
| Eventos | 29, aproximadamente 28/min | candidatos del instrumento, no expresiones confirmadas |
| Kappa entre modelos | −0,014 | acuerdo corregido por azar insignificante |
| Observación independiente | 0 marcas | no existe verdad de referencia humana |

Este registro demuestra ejecución de extremo a extremo y permite caracterizar
limitaciones del instrumento. No sostiene exactitud de clasificación ni una
descripción concluyente de la expresión facial del participante.

### Lo que falta, en orden

1. **Cuantificar habla, mandíbula y parpadeo contra observación independiente.**
   La aplicación ya permite registrar estos eventos sin mostrar la salida de la
   máquina. Solo después de medir su coincidencia se podrá decidir qué canales o
   ventanas excluir; hacerlo antes convertiría una sospecha en regla.
2. **Caracterizar la tablet objetivo.** Las cifras actuales describen sobre todo
   la computadora de desarrollo y un rostro adulto. Cadencia, resolución,
   detección y recorrido de canales deben repetirse en la tablet y el
   participante previstos antes de usarse como resultados del estudio.
3. **Medir la dependencia de la dispersión sustituida.** La versión 10 ejecuta
   un clasificador paralelo que excluye los canales cuyo ruido basal no se pudo
   medir y guarda la proporción de discrepancia. Si ambas variantes divergen de
   forma material, los resultados deben estratificarse o declararse no robustos.
4. **Aumentar la cadencia solo si el cuello de botella es el cómputo.** A 30,9 fps
   queda fuera el 36 % de la banda temporal de referencia. Antes de mover la
   inferencia a un Web Worker se comparan latencia de inferencia e intervalo de
   entrega: si la cámara es el límite, cambiar de hilo no recuperará fotogramas.

## Privacidad

- El video se procesa fotograma a fotograma y **nunca se almacena**
- Solo se guardan las medidas derivadas y los registros de selección
- Todo permanece en IndexedDB, en el dispositivo
- No hay servidor, ni cuentas, ni telemetría
- «Borrar todo» elimina los registros de forma definitiva

La aplicación crea una sesión al abrirse y completa su cabecera cuando termina la
calibración, sin generar un registro provisional separado. «Nueva sesión» cierra
el registro vigente, reinicia las métricas y toma otra línea base; por tanto, dos
calibraciones no se mezclan bajo un mismo identificador. Las métricas se
actualizan periódicamente para reducir la pérdida ante un cierre abrupto.

Los archivos de sesión exportados contienen datos del participante y están excluidos del control de versiones en `.gitignore`.

---

## Trazabilidad

El cruce entre los requerimientos especificados y lo que el prototipo implementa
está en [`docs/trazabilidad.md`](docs/trazabilidad.md), con lo que falta y por qué
importa. Se mantiene junto al código para que la coherencia sea verificable y no
declarativa.

El dictamen consolidado sobre avance académico, estado técnico, evidencia
empírica, fundamento científico, amenazas a la validez y trabajo pendiente está
en [`docs/estado-actual-licenciatura.md`](docs/estado-actual-licenciatura.md).

El diseño de evaluación, las unidades de análisis, métricas, fases, reglas de
decisión y salvaguardas éticas están predefinidos en
[`docs/protocolo-validacion.md`](docs/protocolo-validacion.md). Su propósito es
impedir que una prueba técnica favorable se presente como exactitud clínica o
como mejora causal de la comunicación.

## Contexto académico

Trabajo Final de Graduación · Licenciatura en Informática con Énfasis en Desarrollo Web
Escuela de Informática y Computación · Universidad Nacional, Costa Rica

**Título:** Aplicación web progresiva de Comunicación Aumentativa y Alternativa basada en el análisis automatizado de expresiones faciales mediante visión por computadora, para un niño no verbal en edad preescolar

Anthony Steven Cerdas Chacón · 2026

---

## Pictogramas

El tablero usa pictogramas de **ARASAAC**, el repertorio del Gobierno de Aragón,
que es el de uso extendido en comunicación aumentativa en español. Se eligió
frente a dibujos hechos para la ocasión por dos motivos: son concretos y a color,
que es lo que un niño puede reconocer sin que se lo expliquen, y son un
repertorio contrastado con la práctica, lo que hace la decisión defendible en el
informe.

Las imágenes están descargadas en `assets/pictogramas/` y no se piden a la red,
porque sin ellas el tablero es inutilizable sin conexión. El identificador de
cada una en ARASAAC queda registrado en `js/pictogramas.js` y en
`assets/pictogramas/fuente.json`, para poder rastrear su origen o sustituirlas
sin repetir la búsqueda.

> Pictogramas: Sergio Palao. Origen: ARASAAC (arasaac.org).
> Propiedad del Gobierno de Aragón. Licencia CC BY-NC-SA.

La atribución es obligatoria por licencia y aparece también en el panel del
cuidador. La licencia es no comercial, lo que es compatible con el carácter
académico de este trabajo pero condiciona cualquier uso posterior.

## Dependencias

Dos dependencias de visión cargadas desde CDN, una de ellas opcional:

- [`@mediapipe/tasks-vision`](https://www.npmjs.com/package/@mediapipe/tasks-vision) — paquete oficial de Google para ejecutar Face Landmarker en el navegador mediante WebAssembly
- [`@vladmandic/face-api`](https://www.npmjs.com/package/@vladmandic/face-api) — segundo clasificador por píxeles, desactivado por defecto y reservado para sesiones de contraste

La versión de MediaPipe está fijada en `js/face.js`; el segundo clasificador se carga solo cuando la persona cuidadora lo habilita.

`detectForVideo` es síncrono en la API web y actualmente corre en el hilo de la
interfaz. La aplicación registra latencia, intervalo de entrega y ocupación para
decidir con datos del dispositivo objetivo si mover la inferencia a un Web
Worker; no se asume que el cómputo sea el cuello de botella.
