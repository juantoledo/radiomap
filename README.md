# Repetidoras Radioaficionados — Chile

Visualización de repetidoras de radioaficionados en Chile, con mapa de cobertura y lista detallada. Datos oficiales de SUBTEL/DGMN.

## Fuente de datos

Los datos se extraen de los documentos oficiales de la **Subsecretaría de Telecomunicaciones (SUBTEL)**:

- [Listado RAF Repetidoras 29-10-2025](https://www.subtel.gob.cl/wp-content/uploads/2025/10/Listado_RAF_Repetidoras_29_10_2025.xlsx)

## Características

### Mapa de cobertura (`index.html`)

- **Mapa interactivo** con Leaflet y tiles CARTO (modo oscuro/claro)
- **Círculos de cobertura** teóricos por repetidora (VHF/UHF, EIRP)
- **Marcadores** con tooltip: señal, club, comuna, banda
- **Filtros**: vista (círculos/marcadores/ambos), banda (VHF/UHF), zona, búsqueda
- **Sidebar** al seleccionar un punto: datos completos, vecinos con solapamiento
- **Descarga CSV** de vecinos con solapamiento desde el menú lateral
- **Leyenda** de zonas con colores
- **Metodología** de cálculo de cobertura visible (EIRP, base VHF/UHF, factores)

### Lista de repetidores (`lista.html`)

- **Tabla** agrupada por zona con todos los repetidores
- **Filtros**: búsqueda (señal, club, comuna), banda, zona
- **Columnas**: señal, banda, RX/TX, tono, potencia, club/titular, comuna, ubicación, vencimiento
- **Badges** de banda (VHF/UHF) y estado de vencimiento

### Funcionalidades compartidas

- **Tema claro/oscuro** persistente (cookies)
- **Descarga CSV** de la lista completa o filtrada desde el header
- **Footer** fijo con versión y créditos
- **Enlace** al desarrollador [CD3DXZ](https://cd3dxz.radio)

## Estructura del proyecto

```
├── data.js              # Datos centralizados (REPEATERS, DATA, ZONE_ORDER, ZONE_COLORS, VERSION)
├── theme.js             # Toggle tema claro/oscuro
├── theme.css            # Variables CSS y estilos compartidos
├── export-csv.js        # Exportación a CSV
├── index.html
├── lista.html
└── README.md
```

## Uso

Abrir los archivos HTML directamente en el navegador o servir con un servidor local:

```bash
python -m http.server 8080
```

Luego visitar `http://localhost:8080/` o `http://localhost:8080/lista.html`.

> **Nota:** Para que el tema y las preferencias persistan correctamente, se recomienda usar un servidor local en lugar de abrir los archivos con `file://`.

## Zonas

Las zonas se derivan del indicativo (3ª letra de la señal: CE1, CE2, CE3, etc.), siguiendo la estructura de SUBTEL.

## Mejoras en el radar

1. **Nodos EchoLink de conferencias** — Agregar RedChile, Echolink Chile, RCDR, etc.
2. **Otras bandas** — Incluir bandas adicionales además de VHF/UHF.
3. **Estimación de alcance** — Mejorar el cálculo de cobertura teórica.
4. **Carga automática de nuevos datos** — Optimizar la actualización desde fuentes oficiales.

---

*Agénticamente desarrollado por [CD3DXZ](https://cd3dxz.radio)*
