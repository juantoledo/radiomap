# Datos — Cobertura Radial Chile

Archivos de datos para el mapa y la lista de repetidoras.

---

## Archivos

| Archivo | Descripción |
|---------|-------------|
| `curated_stations.csv` | Fuente de verdad. Listado de repetidoras curado. |
| `data.js` | Generado desde el CSV. Contiene `NODES`, `VERSION` y `REGION_COLORS`. |

---

## Origen y curación

Los datos parten de **registros públicos de regulación** del espectro en Chile y pueden curarse en `curated_stations.csv` para corregir errores (coordenadas, frecuencias, nombres, etc.).

Adicionalmente, el workflow [`sync-node-sources.yml`](../.github/workflows/sync-node-sources.yml) corre a diario (y manualmente vía `workflow_dispatch`): por cada `name,url` listado en [`.github/sync-sources.csv`](../.github/sync-sources.csv) (ej. Red Chile, RCDR), renderiza esa URL, usa Claude ([`anthropics/claude-code-action`](https://github.com/anthropics/claude-code-action), prompt en [`.github/prompts/sync-node-sources.md`](../.github/prompts/sync-node-sources.md)) para proponer altas/cambios en las filas de esa red (matching por `nombre`/`conference`), valida la estructura con `scripts/ci/validate-csv.py`, y abre un único **pull request** combinado (nunca hace push directo a `main`). Todo cambio propuesto por el bot requiere revisión humana antes de mergear. **Para agregar una fuente nueva, basta con agregar una fila a `.github/sync-sources.csv`.** Requiere el secret `ANTHROPIC_API_KEY`; el paso pasa `github_token` explícitamente para que `claude-code-action` use el token del propio workflow en vez de requerir la Claude Code GitHub App instalada en el repo.

---

## Pipeline

`data.js` se genera automáticamente con:

```bash
python scripts/csv-to-datajs.py
```

El script lee `curated_stations.csv` y produce `data.js`. Se ejecuta en CI antes del deploy. Incrusta metadatos de **mapas de propagación** (`hasPropagation`, `propagationPgw`, `propagationDcf` opcional) cuando existen en `data/propagation/<señal>/`.

Tras editar el CSV en local, conviene regenerar `data.js` antes de probar la app.

---

## Mapas de propagación (`data/propagation/`)

Por estación, carpeta `data/propagation/<señal>/` con **`{señal}.png`** + **`{señal}.pgw`** (WorldFile); opcional **`{señal}.dcf`** (paleta dBm para la leyenda flotante). El generador incrusta `hasPropagation`, `propagationPgw` y `propagationDcf` cuando existen.

- **Motor** — [Signal-Server](https://github.com/juantoledo/Signal-Server) (fork/ajustes del proyecto).
- **Elevación** — Típicamente **SRTM** (NASA SRTM, distribuido por [OpenTopography](https://www.opentopography.org/)); la cita exacta figura en [`propagacion.html`](../propagacion.html).
- **Estado** — Funcionalidad **experimental**: la calidad depende de los datos de TX/antena en el CSV, de los umbrales dBm/colores y de la configuración del motor; puede refinarse con el tiempo.
- **Documentación** — Texto orientado al usuario y limitaciones: [`propagacion.html`](../propagacion.html). Detalle para quien mantiene el repo: [`data/propagation/README.md`](propagation/README.md).

Los `README.md` dentro de cada carpeta de señal documentan corridas concretas (parámetros, fechas); no sustituyen la página anterior.

---

## Formato de curated_stations.csv

### Columnas (orden del encabezado)

| Columna | Descripción |
|---------|-------------|
| `signal` | Indicativo de la estación / repetidor. |
| `nombre` | Club, titular o red (ej. «Radio Club de Concepción», «Red Chile - Temuco»). |
| `comuna` | Comuna. |
| `ubicacion` | Lugar o referencia de emplazamiento. |
| `lat`, `lon` | Latitud y longitud (grados decimales). |
| `potencia`, `ganancia` | Potencia (W) y ganancia de antena según registro (datos; el mapa no deriva de ellos un radio por estación). |
| `banda` | Banda de servicio (ej. `VHF/FM`, `UHF/FM`). |
| `rx`, `tx` | Frecuencias de recepción y transmisión (MHz). |
| `tono` | Tono subaudible / DCS si aplica. |
| `region` | Región (texto alineado a la división administrativa chilena). Usar `GLOBAL` para estaciones/redes no atadas a una región específica, sea de alcance nacional (redes HF nacionales, estaciones móviles) o internacional (frecuencias de encuentro con otros países); distinto de `ATC — NACIONAL (Chile)`, reservado para frecuencias aeronáuticas ATC de alcance nacional. |
| `otorga`, `vence` | Fechas de otorgamiento y vencimiento de la autorización. |
| `isEcholink` | `1`, `true` o `yes` = nodo Echolink; vacío u otro = no. |
| `conference` | Nombre de la **conferencia o red** (Echolink, DMR u otro): ej. `Red Chile`, `RCDR`, `SUR`, `Zona DMR CL`. Vacío si no aplica. |
| `isDMR` | `1`, `true` o `yes` = estación / repetidor DMR; vacío u otro = no. |
| `serviceType` | Servicio / icono especial en mapa y lista: `atc` (ATC / aeronáutico), `fire` (bomberos), `ambulance` (ambulancia / emergencia médica), `sea` (marítimo / costa). **Un valor como máximo**; vacío = repetidor genérico. En `data.js` se deriva `isAir === true` cuando `serviceType` es `atc` (compatibilidad con propagación y filtros). |
| `color` | Código o etiqueta de **color** (CC) DMR. Vacío si no aplica. Varios valores: **separar con espacio** (ej. `1`). |
| `slot` | **Slot** de tiempo DMR. Varios slots: **solo espacios** (ej. `1 2`), sin «y». |
| `tg` | **Talkgroups** DMR. Varios TG: **solo espacios** (ej. `730 7300444 7301`), sin guiones. Sin filtro dedicado en la app. |
| `website` | URL pública del club o red asociada a esa fila (ver abajo). |
| `notes` | Notas libres de curación (texto). Vacío si no aplica. En la app solo se muestran en el **detalle de estación** (lista) cuando hay contenido; entran en búsqueda y en la exportación CSV. |
| `labels` | Identificadores internos (texto). Varios valores: **solo espacios** entre tokens (ej. `red-a demo`). No son filtros en la UI; entran en **búsqueda** por texto, exportación CSV, y se muestran en detalle de estación (lista) y panel lateral del mapa si hay contenido. |

### `isEcholink` y `conference`

- **`isEcholink`**: valor verdadero con `1`, `true` o `yes` (insensible a mayúsculas).
- **`conference`**: texto libre para agrupar nodos de la misma conferencia o red (no solo Echolink: también DMR, p. ej. red [Zona DMR CL](https://zonadmr.cl/nodos/)).

### `isDMR`, `color`, `slot` y `tg`

- **`isDMR`**: misma convención booleana que `isEcholink`.
- **`color`**, **`slot`** y **`tg`**: texto libre; en la interfaz se muestran como **chips** separando por espacios. Participan en la **búsqueda** y en la exportación CSV. Si `isDMR` está vacío, suelen dejarse vacíos.

### `website` — sitio web del club o red

Columna opcional. Si está vacía, la interfaz no muestra enlace junto a la señal.

**Formato**

- Una sola URL absoluta por celda, preferentemente **HTTPS**.
- Sin espacios; sin comillas en el CSV salvo que el propio CSV las exija por el contenido del campo.
- Ejemplos: `https://www.ce5ja.cl`, `https://www.qrz.com/db/CE4BZI`.

**Criterios de curación**

1. **Titular único** — La URL debe corresponder al **club o red** del campo `nombre` (mismo titular para todas las filas de ese club cuando comparten web).
2. **Fuente oficial o reconocida** — Priorizar el sitio del propio radio club (dominio `.cl` habitual), página institucional o, si no existe web propia, un perfil estable (**p. ej. QRZ**) vinculado al indicativo del club.
3. **Redes Echolink** — Para nodos bajo una red nacional (ej. «Red Chile», «RCDR», «Conferencia Sur»), usar la URL oficial de esa red si está publicada y es mantenida.
4. **Una URL por criterio** — No rellenar con buscadores, agregadores genéricos ni enlaces rotos; si no hay URL fiable, dejar vacío.
5. **Coherencia** — Misma base de datos que el resto del CSV: si cambia el dominio del club, actualizar todas las filas de ese titular.

**Uso en la aplicación**

- En mapa y lista solo se enlazan URLs **`http:`** o **`https:`** validadas en el cliente.
- El campo participa en la **búsqueda por texto** y se incluye en la **exportación CSV** desde la app.
- Los campos DMR (`isDMR`, `color`, `slot`, `tg`): el **tipo** DMR se elige en el mismo desplegable que Echolink/radioclubes; `color`, `slot` y `tg` entran en **búsqueda** y **exportación CSV**, sin filtros dedicados (tampoco en enlaces compartidos). La columna **`conference`** tiene filtro y parámetro de URL `conference` (enlaces antiguos pueden usar `echolinkConference`).

---

## Referencia rápida de columnas (una línea)

`signal`, `nombre`, `comuna`, `ubicacion`, `lat`, `lon`, `potencia`, `ganancia`, `banda`, `rx`, `tx`, `tono`, `region`, `otorga`, `vence`, `isEcholink`, `conference`, `isDMR`, `serviceType`, `color`, `slot`, `tg`, `website`, `notes`.
