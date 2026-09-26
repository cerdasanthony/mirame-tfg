# Manual de codificación observacional

Versión 1.0 · 25 de septiembre de 2026

## Propósito

Producir una referencia independiente de **conducta facial visible** para
calibrar y evaluar el clasificador. La persona observadora no codifica emoción
sentida, intención, preferencia, dolor ni diagnóstico. La pantalla de
observación no muestra la salida del sistema para impedir que esta influya en el
criterio humano.

La estructura se adapta de FACES, instrumento dimensional que codifica valencia,
intensidad y duración de la conducta expresiva y cuya fiabilidad y validez se
evaluaron en cinco estudios y trece muestras
([Kring y Sloan, 2007](https://pubmed.ncbi.nlm.nih.gov/17563202/)). No se afirma
que este panel implemente FACES completo ni que la adaptación haya heredado sus
propiedades psicométricas.

## Categorías operativas

| Marca | Criterio observable |
|---|---|
| `positivo` | Cambio facial visible, respecto al reposo de esa sesión, cuya valencia expresiva global es juzgada positiva. Registrar la conducta, no su causa. |
| `neutro` | No se observa un cambio de valencia positiva o negativa respecto al reposo, con rostro suficientemente visible. No equivale a “no siente nada”. |
| `negativo leve` | Cambio facial de valencia expresiva negativa, visible pero de intensidad baja o moderada. |
| `negativo intenso` | Cambio facial de valencia expresiva negativa, claro y de intensidad alta o muy alta. |
| `sin dato` | El rostro no puede juzgarse por oclusión, salida de cuadro, pose, iluminación, fallo técnico o atención dividida de la persona observadora. |

Para entrenar la intensidad se usa una escala auxiliar ordenada de cuatro grados:
1 = baja, 2 = moderada, 3 = alta, 4 = muy alta. El estudio agrupa 1–2 como
“negativo leve” y 3–4 como “negativo intenso”. FACES inspira la codificación de
intensidad en cuatro grados; la frontera 1–2/3–4 es una adaptación explícita de
este proyecto y se evaluará, no una norma publicada.

## Procedimiento

1. Antes de cada sesión, observar brevemente el rostro en reposo y las condiciones de visibilidad.
2. Marcar una categoría cuando cambie el perfil visible; la marca permanece vigente hasta la siguiente transición.
3. Marcar `sin dato` inmediatamente cuando no sea posible juzgar el rostro y restablecer una categoría solo al recuperar visibilidad suficiente.
4. Registrar por separado vocalización, movimiento mandibular, cierre ocular y movimiento general. Estas condiciones no determinan la categoría; sirven para analizar posibles artefactos.
5. No usar el pictograma elegido, una conducta posterior ni información clínica para corregir retrospectivamente la marca facial.
6. No intentar seguir cada fotograma. La alineación y el submuestreo se realizan después con las marcas de tiempo guardadas.

## Entrenamiento y fiabilidad

- Preparar ejemplos de entrenamiento que no pertenezcan a las sesiones de evaluación.
- Discutir desacuerdos solo durante entrenamiento; una sesión evaluada no se recodifica para acercarla al sistema.
- En una muestra de sesiones, dos personas entrenadas deben observar simultánea e independientemente si se desea afirmar fiabilidad entre observadores.
- Con una sola observadora solo puede informarse concordancia sistema–observadora; no puede afirmarse fiabilidad interobservador.
- Reportar matriz de confusión, acuerdo observado, AC1 y kappa. Ningún escalar sustituye la matriz ni la cantidad de observaciones por categoría.

## Lenguaje permitido

Permitido: “se observó elevación de comisuras”, “conducta facial positiva”,
“cambio negativo de intensidad alta”, “sin dato por oclusión”.

No permitido: “estaba feliz”, “tenía miedo”, “sentía dolor”, “quería pedir
ayuda”. Esas frases atribuyen un estado interno que el rostro por sí solo no
identifica de manera específica
([Barrett et al., 2019](https://doi.org/10.1177/1529100619832930)).
