# Plan reproducible para ajustar reglas y umbrales

Versión 1.0 · 25 de septiembre de 2026

## Principio

Los cortes +1, −0,75 y −2 son valores iniciales del prototipo. No proceden de
FACS, FACES, MediaPipe ni de una norma clínica. Se sustituirán por estimaciones
del caso y quedarán identificados como parámetros del participante, dispositivo
y versión de reglas.

“Evaluación reservada” significa que sus etiquetas no participan en la elección
de reglas o cortes. No significa evaluación sin teoría. Usar los mismos datos
para elegir y medir el modelo produce estimaciones optimistas; la separación es
una práctica estándar para evitar fuga de información
([Varma y Simon, 2006](https://doi.org/10.1186/1471-2105-7-91),
[guía de scikit-learn](https://scikit-learn.org/stable/common_pitfalls.html#data-leakage)).

## 1. Decisiones que se fijan antes de analizar

- unidad de partición: sesión completa;
- intervalo de alineación y submuestreo;
- definiciones del manual observacional;
- modelos candidatos: núcleo AU12/AU4, compuesto extendido y ablaciones declaradas;
- métrica primaria: F1 macro de las cuatro categorías;
- desempate: menor error ordinal absoluto y luego menor complejidad;
- métricas secundarias: matriz, acuerdo observado, AC1, kappa y F1 por categoría;
- reglas de datos faltantes, exclusión técnica y colapso de categorías.

Las muestras consecutivas de una sesión son dependientes. Por eso una sesión
nunca se divide entre ajuste y evaluación. En datos repetidos, repartir segmentos
correlacionados entre ambos conjuntos constituye fuga y puede inflar el desempeño
([Kapoor y Narayanan, 2023](https://pmc.ncbi.nlm.nih.gov/articles/10499856/)).

## 2. Asignación de sesiones

1. Enumerar las sesiones elegibles sin consultar su rendimiento por categoría.
2. Asignar identificadores completos a `calibración` y `evaluación`.
3. Guardar esa asignación con fecha y versión antes de optimizar.
4. Verificar que cada sesión tenga una sola línea base y una sola instantánea de parámetros.
5. No mover una sesión después de conocer el resultado. Si se hace por una causa documentada, todo el análisis posterior se etiqueta exploratorio.

No se fija un porcentaje universal: con pocas sesiones importa más conservar
condiciones y categorías en ambos conjuntos. Se informará la cobertura. Si una
categoría no aparece en calibración, su corte no es estimable; si no aparece en
evaluación, su sensibilidad no es evaluable.

## 3. Ajuste con las sesiones de calibración

1. Alinear el puntaje continuo con las transiciones de la observación independiente.
2. Excluir `sin dato` y aplicar el intervalo de submuestreo predefinido.
3. Comparar el núcleo AU12/AU4, el compuesto extendido y las ablaciones.
4. Para cada modelo, probar ternas ordenadas de cortes tomadas de puntos medios entre puntajes observados. La restricción es `positivo > neutro > negativo leve`.
5. Elegir la terna con mayor F1 macro. En empate, preferir menor error ordinal; si persiste, el modelo con menos canales.
6. Examinar errores por sesión y condición técnica. No cambiar la regla por un caso aislado sin declarar una nueva iteración exploratoria.

F1 macro da el mismo peso a cada categoría y evita que una categoría frecuente
oculte el fracaso en otra. Como las categorías son ordenadas, el error ordinal se
usa además para distinguir un error adyacente de uno extremo. La matriz completa
se conserva porque ninguna métrica única muestra ambos aspectos.

## 4. Congelación

Antes de consultar el conjunto de evaluación se guardan:

- versión de reglas y código;
- canales y fórmula seleccionados;
- tres cortes;
- alfa de suavizado, histéresis, permanencia y retroceso;
- criterio de frontalidad;
- definición de categorías y submuestreo;
- sesiones de calibración y evaluación;
- todas las desviaciones del plan.

La aplicación registra una instantánea de estos parámetros dentro de cada
sesión. Cambiar un corte abre una sesión nueva y obliga a tomar una línea base
nueva, evitando mezclar dos instrumentos bajo un mismo identificador.

## 5. Evaluación

Aplicar una sola vez la configuración congelada al conjunto reservado y
reportar, sin volver a ajustar:

- número de sesiones y pares por categoría;
- matriz observadora → sistema;
- F1 por categoría y macro;
- error ordinal absoluto;
- acuerdo observado, AC1 y kappa;
- resultados por sesión, dispositivo y condición relevante;
- proporción `sin dato`, cobertura de canales y escalas sustituidas.

Si la separación “negativo leve/intenso” no tiene soporte o muestra acuerdo
inestable, se informa el resultado y se evalúa una salida de tres categorías en
una nueva iteración exploratoria. No se desplaza el corte hasta obtener un
resultado favorable. La separación entre análisis planeado y exploratorio sigue
las recomendaciones de transparencia y prerregistro
([Center for Open Science](https://www.cos.io/initiatives/prereg)).

## 6. Alcance del resultado

El resultado estima concordancia con conducta facial observada en este
participante y estas condiciones. No valida reconocimiento de emociones ni
autoriza generalización a otros niños, cámaras, contextos o poblaciones.
