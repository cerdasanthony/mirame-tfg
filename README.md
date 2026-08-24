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
Cámara (MediaDevices)
      ↓
MediaPipe Face Landmarker  ·  puntos de referencia 3D + blendshapes
      ↓
Características observables  ·  7 medidas con nombre
      ↓
Normalización contra la línea base de la sesión
      ↓
Clasificación descriptiva  ·  positivo / neutro / negativo leve / negativo intenso
      ↓
Ventana temporal de 8 s previos a la selección
      ↓
Registro: pictograma + distribución de estados  →  IndexedDB
      ↓
Consulta e interpretación por parte de la persona cuidadora
```

### Módulos

| Módulo | Responsabilidad | Archivo |
|---|---|---|
| Comunicador | Tablero de pictogramas, paginación, salida de voz | `js/board.js`, `js/speech.js` |
| A · Captura y detección | Cámara, Face Landmarker, blendshapes | `js/face.js` |
| A · Características | Siete medidas observables y línea base | `js/features.js` |
| B · Clasificación | Reglas de umbral y ventana temporal | `js/classifier.js` |
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

## Estado de la calibración

⚠️ **Los pesos y umbrales de `js/classifier.js` son valores iniciales sin calibrar.** Están puestos para que el flujo funcione de extremo a extremo, no porque hayan sido validados con nadie. Se ajustan con las grabaciones de calibración y el procedimiento debe quedar documentado en el informe.

Cualquier resultado obtenido antes de esa calibración es una prueba de que el sistema corre, no de que clasifique correctamente.

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
