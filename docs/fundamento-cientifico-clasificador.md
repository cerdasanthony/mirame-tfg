# Fundamento científico de las reglas del clasificador

Revisión de alcance · 25 de septiembre de 2026

## 1. Constructo que realmente mide el prototipo

La salida se interpreta como **valencia de la conducta facial observada**, no
como emoción sentida, intención, necesidad, dolor ni diagnóstico. FACS aporta un
vocabulario para describir movimientos faciales. FACES, que es otro instrumento,
demostró que personas entrenadas pueden codificar valencia positiva/negativa e
intensidad de la conducta expresiva. Ninguna de esas dos cosas autoriza a deducir
de forma directa el estado interno de una persona.

La distinción es necesaria porque una misma configuración puede aparecer en
contextos distintos y una emoción puede expresarse mediante configuraciones
distintas. La revisión de Barrett et al. concluye que la inferencia inversa desde
el rostro necesita evidencia de fiabilidad, especificidad, generalización y
validez que no puede suponerse ([Barrett et al., 2019](https://doi.org/10.1177/1529100619832930)).

El sistema conserva por separado evidencia positiva y negativa. Esto es
coherente con el modelo del espacio evaluativo, según el cual positividad y
negatividad son sistemas separables y pueden coactivarse; reducirlas a una sola
diferencia es una compresión operacional del prototipo, no una consecuencia
obligatoria de la teoría ([Norris et al., 2010](https://pmc.ncbi.nlm.nih.gov/articles/PMC2894997/)).

## 2. Matriz de respaldo y límites

| Elemento del prototipo | Evidencia externa | Qué permite afirmar | Qué no permite afirmar | Estado |
|---|---|---|---|---|
| Catálogo de movimientos AU | FACS describe acciones faciales observables | nombrar y comparar movimientos | asignar emoción o valencia a una AU aislada | vocabulario de referencia |
| MediaPipe → AU | Un mapeo de 2026 entre 52 *blendshapes* y AU obtuvo 88 % de acuerdo unánime y 98 % de mayoría entre diez expertos | usar correspondencias semánticas como aproximación documentada | tratar el coeficiente como intensidad FACS certificada o asumir exactitud en este participante | proxy que debe verificarse |
| AU12 / sonrisa | EMG y análisis automatizado en adultos relacionan *zygomaticus major*/AU12 con valencia más positiva | usar AU12 como indicador principal de conducta facial positiva | asegurar alegría, autenticidad o un corte universal | núcleo con respaldo directo |
| AU4 / ceja descendida | EMG y análisis automatizado en adultos relacionan *corrugator*/AU4 con valencia más negativa | usar AU4 como indicador principal de conducta facial negativa | distinguir esfuerzo, concentración, iluminación o una emoción concreta | núcleo con respaldo directo y baja especificidad |
| AU6 + AU12 | describe una sonrisa con elevación de mejilla | registrar una configuración conjunta | certificar una sonrisa genuina; intensidad y duración explican buena parte de la supuesta ventaja de AU6 | descriptor auxiliar |
| AU4 + max(AU6,AU7) + max(AU9,AU10) + AU43 | índice PSPI de expresión de dolor | justificar que esas acciones y máximos por pares son relevantes en dolor | convertir el índice en negatividad general ni eliminar AU43 y conservar la validez original | antecedente específico, no validación del compuesto |
| AU1, AU7, AU9, AU10, AU15, AU17, AU18, AU20 y AU24 con signo negativo | aparecen en configuraciones publicadas y algunas asociaciones exploratorias | formular hipótesis de canales adicionales | atribuirles valencia invariable fuera de la configuración y el contexto | extensión exploratoria |
| Diferencia positiva − negativa | diseño interpretable sobre dos señales normalizadas | ordenar el resultado en una escala operacional | afirmar que la teoría exige una escala bipolar o que las distancias son psicológicas | decisión del prototipo |
| Mediana y Qn por sesión | Qn es un estimador robusto de escala | reducir influencia de atípicos y expresar cambio respecto al reposo de la sesión | convertir +1, −0,75 o −2 en valores publicados o clínicos | normalización respaldada; cortes no respaldados |
| +1, −0,75 y −2 | no existe fuente que establezca esos valores para MediaPipe, FACS, FACES o esta población | mantenerlos como valores iniciales para que el prototipo funcione | presentarlos como norma, hallazgo o criterio validado | deben estimarse y congelarse |
| “negativo leve/intenso” | FACES codifica intensidad observable en cuatro grados | usar una referencia observacional ordenada | afirmar que la frontera 1–2/3–4 o el corte del puntaje provienen de FACES | adaptación predefinida del estudio |
| Suavizado, histéresis y permanencia de 500 ms | principios de ingeniería para estabilizar una señal | reducir oscilaciones y registrar su configuración exacta | atribuirles validez psicológica o universal | parámetros técnicos a caracterizar |

Fuentes directas para esta matriz:

- [Kring y Sloan (2007), desarrollo y validación de FACES](https://pubmed.ncbi.nlm.nih.gov/17563202/): cinco estudios y trece muestras; valencia, intensidad y duración son juicios de conducta expresiva realizados por observadores.
- [Larsen, Norris y Cacioppo (2003)](https://doi.org/10.1111/1469-8986.00078): en 68 mujeres adultas, los estímulos agradables produjeron más actividad cigomática y menos corrugadora; el efecto lineal fue más fuerte en corrugador.
- [Kawamura et al. (2024)](https://pmc.ncbi.nlm.nih.gov/articles/PMC11341571/): en 23 personas adultas japonesas, AU12 se asoció positivamente y AU4 negativamente con valencia subjetiva dinámica. Se utilizó FaceReader, no MediaPipe, y el propio estudio advierte efectos de iluminación y tamaño muestral.
- [Turrisi et al. (2026)](https://doi.org/10.1016/j.chbr.2026.101125): primer marco estandarizado publicado de correspondencias entre *blendshapes* de MediaPipe y AU, validado por consenso experto. Respalda el mapeo conceptual, no la equivalencia numérica de intensidades.
- [Ficha técnica oficial del modelo de *blendshapes*](https://storage.googleapis.com/mediapipe-assets/Model%20Card%20Blendshape%20V2.pdf): el modelo entrega 52 coeficientes aproximados, fue diseñado principalmente para entretenimiento AR y es sensible a distancia, iluminación, movimiento, oclusión y entradas fuera de distribución.
- [Girard et al. (2021)](https://doi.org/10.1007/s42761-020-00030-w): 751 sonrisas de 136 participantes contradicen el uso de la constricción ocular como certificado general de disfrute genuino.
- [Prkachin y Solomon (2008)](https://pubmed.ncbi.nlm.nih.gov/18502049/): la combinación AU4, AU6/7, AU9/10 y AU43 fue validada para intensidad de dolor, no para valencia negativa general.
- [Rousseeuw y Croux (1993)](https://doi.org/10.1080/01621459.1993.10476408): fundamento estadístico de Qn como escala robusta; no propone cortes de clasificación facial.

## 3. Transferencia al participante y al dispositivo

La mayor parte de la evidencia de AU4/AU12 procede de personas adultas y de EMG
o extractores diferentes. En autismo se han observado subgrupos hipoexpresivos e
hiperexpresivos; una menor expresión positiva visible no implica ausencia de
experiencia positiva ([Carpenter et al., 2020](https://pmc.ncbi.nlm.nih.gov/articles/PMC7212683/)).
Por eso no se importarán coeficientes, medias ni cortes poblacionales. La línea
base y los cortes se ajustarán al participante y al dispositivo, y la conclusión
se limitará a concordancia con conducta facial observada.

La ficha del modelo de Google informa resultados de laboratorio por género
percibido y tono de piel, pero no presenta una validación clínica infantil ni una
validación FACS del participante. El protocolo debe medir en la tableta objetivo
la cobertura de cada canal, el efecto de la pose, la luz, la distancia y el
movimiento.

## 4. Hipótesis comparables, no una regla incuestionable

La calibración comparará, usando solo las sesiones destinadas a ajuste:

1. **Núcleo externo:** AU12 como evidencia positiva y AU4 como evidencia negativa.
2. **Compuesto extendido:** la regla regional actual, que añade configuraciones y canales exploratorios.
3. **Ablaciones:** retirar cada región adicional para comprobar si mejora de verdad el resultado o solo ajusta ruido.

La selección se hará por concordancia con observación independiente. Si el
compuesto extendido no supera de manera estable al núcleo, se conservará el
modelo más simple. Esto evita presentar una lista más larga de AU como si una
mayor complejidad equivaliera a mayor fundamento.

## 5. Regla de interpretación

Una salida válida se redacta así: “el sistema clasificó la configuración facial
observada como positiva/neutra/negativa leve/negativa intensa y obtuvo X de
concordancia con la codificación independiente”. No se redacta como “el niño
estaba feliz, triste, incómodo o con dolor”.
