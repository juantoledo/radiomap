# Onda corta (EiBi)

Datos de la capa **Onda corta** del mapa: emisoras internacionales de onda corta probablemente al aire ahora.
Van separados de `curated_stations.csv` / `NODES`.

- **Fuente:** [EiBi](http://www.eibispace.de/dx/) de Eike Bierwirth. Según su README, las listas son libres para descargar, usar, copiar y distribuir. La UI muestra atribución.
- **Pipeline:** `source/sked-*.csv` + `source/README.TXT` → [`scripts/eibi-to-shortwavejs.py`](../../scripts/eibi-to-shortwavejs.py) → `data/shortwave.js` (global `SHORTWAVE`).
- **Cuándo corre:** en cada deploy (`deploy.yml`, con `--strict`, precedido por los tests) y con `./scripts/sync-data.sh`.

## Archivos

| Archivo | Qué es |
|---|---|
| `source/sked-<a\|b><yy>.csv` | Horario EiBi **crudo**, byte a byte. Latin-1, CRLF. Debe haber **exactamente uno**. `a` = temporada de verano boreal (fin de marzo a fin de octubre), `b` = invierno. |
| `source/README.TXT` | README crudo de EiBi. Aporta las coordenadas de los transmisores (§ «IV) Transmitter site codes») y los nombres de idiomas, países y zonas objetivo. |
| `site_overrides.csv` | Correcciones manuales de sitios (`itu,code,lat,lon,name,note`). Tienen prioridad sobre el README. |
| `utility_patterns.txt` | Una expresión regular por línea sobre el nombre de la emisora. Si coincide, la emisora se considera utilitaria (aeronáutica, marítima, meteo, balizas, números…) y se excluye. |

## Mapeo de columnas (robusto a cambios de EiBi)

La cabecera se normaliza: se quita el sufijo de ancho `:75`, se quita `(UTC)` y se pasa a minúsculas. Luego se mapea **por nombre** con `COLUMN_ALIASES` en el generador. Así:

- no importa el orden de las columnas;
- las columnas desconocidas se ignoran con un aviso;
- si falta una requerida (`freq`, `time`, `itu`, `station`, `site`, `persistence`), el script termina con error y el deploy falla.

Si EiBi renombra una columna, solo hay que agregar el alias.

| Columna EiBi | Campo | Notas |
|---|---|---|
| `kHz` | `freq` | Solo se conservan valores entre 1711 y 30000 kHz. |
| `Time(UTC)` | `time` | `HHMM-HHMM`. `2400` = fin del día; si el fin es menor que el inicio, cruza medianoche. |
| `Days` | `days` | Formatos aceptados: vacío = diario; `Mo-Fr`, `We-Mo`, `Tu,Th`, `SaSu`, `156` (1 = lunes); `1.Sa`, `Last7`, `15Sep`. `irr`, `test`, `tent`, `Ram` y `Haj` se tratan como cualquier emisión programada (al aire en su horario). `alt`, `harm`, `imod`, `spur`, `LSB` y `USB` se excluyen. |
| `ITU` | `itu` | País de la emisora. |
| `Station` | `station` | |
| `Lng` | `lang` | Los códigos `-CW`, `-HF`, `-TS` y `-TY` son utilitarios y se excluyen. `-MX` (música) se conserva. |
| `Target` | `target` | Zona objetivo (se muestra en el popup). |
| `Remarks` | `site` | Sitio de transmisión: vacío, `k`, `/CYP` o `/OMA-a`. |
| `P` | `persistence` | Ver la tabla de códigos más abajo. |
| `Start` / `Stop` | `start` / `stop` | `DDMM`. En `Stop`, un sufijo `[MMYY]` indica la fecha de la última escucha. |

**Códigos `P`:**

| Código | Significado | Tratamiento |
|---|---|---|
| 0, 1 | Normal | Se incluye siempre. |
| 2, 3 | Cambio de horario de verano | Igual que 1. |
| 4 | Solo en invierno boreal | El navegador lo evalúa según la fecha actual. |
| 5 | Solo en verano boreal | El navegador lo evalúa según la fecha actual. |
| 6 | Válido solo entre `Start` y `Stop` | Se aplica ese rango de fechas. |
| 8 | Inactivo | Se excluye. |
| ≥ 90 | Utilitaria | Se excluye. |

## Ubicación de los transmisores

Cada fila se ubica así:

1. `site_overrides.csv`.
2. El sitio `(país, código)` del README.
3. El sitio por defecto del país (línea sin código).
4. El primer sitio conocido del país. La precisión queda como `country`: se dibuja con borde punteado y se rotula con el país. Es el caso de, por ejemplo, Sound of Hope.
5. Si no hay coordenadas (p. ej. `XUU`), la fila se omite y se informa en el reporte.

## Filtros (mapa y lista)

El panel de onda corta solo muestra lo que está **al aire ahora** y permite filtrar por:

- **Dirigidas a:** zonas objetivo EiBi agrupadas por región (`TARGET_GROUPS` en `scripts/shortwave-live.js`). Las zonas sin mapear quedan en «Otras / sin zona». Si EiBi agrega una zona, súmela al grupo que corresponda.
- **Banda:** bandas de radiodifusión de la UIT (`BANDS`), de 120 m a 11 m. Lo que queda fuera de ellas aparece como «Fuera de banda».
- **Idioma.**

Cada filtro es de selección múltiple: dentro de un filtro, los valores elegidos se suman (O); entre filtros, se combinan (Y). Los conteos de cada desplegable consideran los otros filtros y la búsqueda del mapa. Los filtros se guardan en la URL con `swtgt`, `swband` y `swlang`, como listas separadas por comas (p. ej. `swband=49m,31m`), y en la sesión del navegador, así que la selección se mantiene al pasar del mapa a la lista y viceversa. Código: `scripts/shortwave-filters.js`. Tests: `node scripts/ci/test_shortwave_live.js`.

## Vista Lista

Con el mismo botón de onda corta, `lista.html` agrega al final la zona **ONDA CORTA** (`scripts/shortwave-list.js`). Muestra lo que está al aire ahora, en una subsección por banda ordenada por kHz, y además una subsección «Comienzan en la próxima hora». La filtran el buscador y los mismos tres filtros del mapa (barra bajo la cabecera de la zona); los filtros de repetidoras no aplican. Se actualiza cada minuto. El estado se comparte con el mapa (`sw=1` y la sesión del navegador).

## Actualizar

- **Automático:** `.github/workflows/sync-shortwave.yml` corre cada lunes y también con *Run workflow*.
  - Calcula la temporada vigente y descarga `sked-<s><yy>.csv` y `README.TXT` por **http**, porque el certificado https de eibispace.de está vencido.
  - Si algo cambió, reemplaza los archivos de `source/` y regenera `data/shortwave.js`.
  - Abre un PR en `bot/shortwave-sync`. Revise el reporte del generador que aparece en el PR.
- **Manual:**
  1. Reemplace el `sked-*.csv` de `source/`, dejando uno solo, y `README.TXT`.
  2. Corra `python scripts/ci/test_eibi_mapper.py && python scripts/eibi-to-shortwavejs.py --strict`.
  3. Revise el reporte (filas omitidas, días no reconocidos, sitios sin coordenadas).
