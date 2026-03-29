# Mapas de propagación (datos en repo)

Raster de cobertura por estación bajo `data/propagation/<señal>/`. La app los incrusta vía `csv-to-datajs.py` (`hasPropagation`, `propagationPgw`, `propagationDcf`).

## Archivos por señal

| Archivo | Rol |
|---------|-----|
| `{señal}.png` | Imagen georreferenciada (overlay en el mapa). |
| `{señal}.pgw` | WorldFile (requerido con el PNG). |
| `{señal}.dcf` | Opcional: paleta dBm → color para la leyenda flotante. |

Los `README.md` dentro de cada carpeta de señal documentan **corridas concretas** (parámetros, fechas, notas).

## Motor y datos de elevación

- **Motor de propagación:** [Signal-Server](https://github.com/juantoledo/Signal-Server) (fork con ajustes para este proyecto).
- **Elevación del terreno:** típicamente **SRTM** (Shuttle Radar Topography Mission). Misma cita que en el sitio:

  *Dataset Citation: NASA Shuttle Radar Topography Mission (SRTM) (2013). Shuttle Radar Topography Mission (SRTM) Global. Distributed by [OpenTopography](https://www.opentopography.org/).*

## Estado experimental

La capa es **orientativa y experimental**. Mejora cuando se refinan:

- datos de transmisor y antena en el CSV (radioclubes),
- umbrales de la leyenda (dBm / colores),
- y la configuración del motor Signal-Server.

No sustituye mediciones de campo ni el criterio del operador.

## Documentación en el sitio

Texto completo para usuarios (leyenda, limitaciones, enlaces): **[`propagacion.html`](../../propagacion.html)** en el repo; en producción: `https://www.radiomap.cl/propagacion.html` (también enlazado desde el mapa como «Sobre propagación»).

## Desarrollo

Tras añadir o cambiar archivos bajo `data/propagation/`, ejecutar desde la raíz del repo:

```bash
python scripts/csv-to-datajs.py
```

Servir por HTTP (p. ej. `./scripts/serve.sh`), no `file://`.
