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
- No decide ni sugiere qué quiere el usuario
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
  7 características              16 Unidades de Acción (FACS)
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
microexpresión, que según Ekman dura entre 40 y 200 ms.

### Módulos

| Módulo | Responsabilidad | Archivo |
|---|---|---|
| Comunicador | Tablero de pictogramas, paginación, salida de voz | `js/board.js`, `js/speech.js` |
| A · Captura y detección | Cámara, Face Landmarker, blendshapes | `js/face.js` |
| A · Características | Siete medidas observables y línea base | `js/features.js` |
| B · Clasificación | Reglas de umbral y ventana temporal | `js/classifier.js` |
| A′ · Unidades de Acción | AU de FACS, valencia y perfil de expresividad | `js/facs.js` |
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

## Pruebas

Dos programas, que responden dos preguntas distintas.

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
| 130 ms · 1,2 σ · 60 fps | 48 % de detección |
| Expresión sostenida de 3 s | correctamente ignorada por la vía fásica |

A 30 fps el evento no se mide peor: la anchura medida no alcanza el mínimo
resoluble y se rechaza entero, sin dejar rastro. Para la banda estricta de Ekman,
60 fps no es una mejora deseable sino la condición para que exista la medición.

La sensibilidad del 48 % ante un gesto débil es el precio del criterio de
umbral, y hay que declararlo: **una ventana sin eventos no demuestra que no hubo
expresión.** Solo dice que no se detectó.

### Lo que se ha medido sobre un registro real

Registro del 24-08-2026: 22 sesiones, 66 selecciones, 367 eventos.

| Medida | Valor | Lectura |
|---|---|---|
| Resolución temporal | 194 ms (≈ 15,6 fps) | 96 % de la banda de Ekman fuera de alcance |
| Eventos con umbral derrumbado | 163 / 367 (44 %) | ruido numérico, ya corregido |
| Entropía del reparto por canal | 0,973 | prácticamente uniforme: firma de ruido |
| Kappa de Cohen entre clasificadores | mediana −0,016 | peor que el azar |
| Tasa de validez de la ventana | 55 % | casi la mitad de los fotogramas se descarta |
| Estado tónico predominante | neutro en 45 de 57 | el problema del «todo neutro» |

**Ese registro no sostiene ninguna conclusión sobre la expresión facial del
participante**, y decirlo es parte del resultado. Sirve como evidencia de que el
sistema corre de extremo a extremo y como caracterización del instrumento, que
es exactamente lo que hacía falta para saber qué corregir.

De ahí salieron dos correcciones ya aplicadas: el piso `SIGMA_D_MINIMA`, que
evita que un canal inmóvil durante la calibración quede con umbral cero, y la
persistencia periódica de las métricas de instrumento, porque 11 de las 22
sesiones habían quedado sin cerrar y por tanto sin procedencia.

Queda pendiente y sin resolver la cadencia: **15,6 fps está muy lejos de los 60
necesarios.** Hasta que se establezca si la causa es la cámara, el delegado de
inferencia o la segunda opinión compitiendo por la GPU —estaba activa durante
esas sesiones— el sistema no puede afirmar detección de microexpresiones en este
dispositivo.

---

## Privacidad

- El video se procesa fotograma a fotograma y **nunca se almacena**
- Solo se guardan las medidas derivadas y los registros de selección
- Todo permanece en IndexedDB, en el dispositivo
- No hay servidor, ni cuentas, ni telemetría
- «Borrar todo» elimina los registros de forma definitiva

Los archivos de sesión exportados contienen datos del participante y están excluidos del control de versiones en `.gitignore`.

---

## Contexto académico

Trabajo Final de Graduación · Licenciatura en Informática con Énfasis en Desarrollo Web
Escuela de Informática y Computación · Universidad Nacional, Costa Rica

**Título:** Aplicación web progresiva de Comunicación Aumentativa y Alternativa basada en el análisis automatizado de expresiones faciales mediante visión por computadora, para un niño no verbal en edad preescolar

Anthony Steven Cerdas Chacón · 2026

---

## Dependencias

Una sola, cargada desde CDN:

- [`@mediapipe/tasks-vision`](https://www.npmjs.com/package/@mediapipe/tasks-vision) — paquete oficial de Google para ejecutar Face Landmarker en el navegador mediante WebAssembly

La versión está fijada en `js/face.js`. Conviene verificar si hay una más reciente antes de avanzar.
