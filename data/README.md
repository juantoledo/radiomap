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

Los datos provienen del [listado oficial SUBTEL](https://www.subtel.gob.cl/) y pueden curarse en `curated_stations.csv` para corregir errores de la fuente (coordenadas, frecuencias, nombres, etc.).

---

## Pipeline

`data.js` se genera automáticamente con:

```bash
python scripts/csv-to-datajs.py
```

El script lee `curated_stations.csv` y produce `data.js`. Se ejecuta en CI antes del deploy.

Tras editar el CSV en local, conviene regenerar `data.js` antes de probar la app.

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
| `range_km` | Radio de cobertura teórica usado en el mapa (km). |
| `potencia`, `ganancia` | Potencia (W) y ganancia de antena según registro. |
| `banda` | Banda de servicio (ej. `VHF/FM`, `UHF/FM`). |
| `rx`, `tx` | Frecuencias de recepción y transmisión (MHz). |
| `tono` | Tono subaudible / DCS si aplica. |
| `region` | Región (texto alineado a división SUBTEL/DGMN). |
| `otorga`, `vence` | Fechas de otorgamiento y vencimiento de la autorización. |
| `isEcholink` | `1`, `true` o `yes` = nodo Echolink; vacío u otro = no. |
| `echoLinkConference` | Nombre de la conferencia o red Echolink (ej. `Red Chile`, `RCDR`, `SUR`). Vacío si no aplica. |
| `website` | URL pública del club o red asociada a esa fila (ver abajo). |

### `isEcholink` y `echoLinkConference`

- **`isEcholink`**: valor verdadero con `1`, `true` o `yes` (insensible a mayúsculas).
- **`echoLinkConference`**: texto libre para agrupar nodos de la misma conferencia o red.

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

---

## Referencia rápida de columnas (una línea)

`signal`, `nombre`, `comuna`, `ubicacion`, `lat`, `lon`, `range_km`, `potencia`, `ganancia`, `banda`, `rx`, `tx`, `tono`, `region`, `otorga`, `vence`, `isEcholink`, `echoLinkConference`, `website`.
