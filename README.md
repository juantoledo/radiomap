# Radiomap

[![Deploy](https://github.com/juantoledo/radiomap/actions/workflows/deploy.yml/badge.svg)](https://github.com/juantoledo/radiomap/actions/workflows/deploy.yml)
[![Version](https://img.shields.io/github/v/tag/juantoledo/radiomap?label=version&sort=semver)](https://github.com/juantoledo/radiomap/tags)
[![License: CC BY-NC-SA 4.0](https://img.shields.io/badge/license-CC%20BY--NC--SA%204.0-lightgrey.svg)](LICENSE)
[![Leaflet](https://img.shields.io/badge/Leaflet-1.9.4-199900?logo=leaflet&logoColor=white)](https://leafletjs.com/)
[![Python](https://img.shields.io/badge/data%20pipeline-Python-3776AB?logo=python&logoColor=white)](scripts/csv-to-datajs.py)
[![GitHub Pages](https://img.shields.io/badge/hosted-GitHub%20Pages-222?logo=githubpages&logoColor=white)](https://www.radiomap.cl/)

Mapa interactivo de repetidoras, Echolink y DMR en Chile.  
Sitio estático — sin framework, sin bundler. Leaflet + vanilla JS.

🌐 **[radiomap.cl](https://www.radiomap.cl/)**

---

¿Te sirve Radiomap? Invítame un café en Ko-fi y ayuda a mantener el proyecto:  
[![Invítame un café en Ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/J6F024AKJE)

## Funcionalidades

| Función | Descripción |
|---|---|
| **Mapa** | Marcadores y círculos de cobertura ilustrativos por banda. Filtros por banda, tipo, conferencia y región. |
| **Lista** | Tabla completa con búsqueda y los mismos filtros. |
| **Cerca de mí** | Filtra por distancia desde tu ubicación o cualquier punto del mapa. |
| **Ruta** | Ingresa origen y destino y ajusta el corredor; el mapa resalta las repetidoras en el trayecto. |
| **Propagación** | Capas de cobertura calculadas con Signal-Server sobre terreno SRTM (donde hay datos). |
| **Mis Estaciones** | Agrega, edita y elimina estaciones propias. Se almacenan en el navegador (`localStorage`); exporta el CSV desde el diálogo de importar/exportar para conservarlas. Las estaciones personalizadas son responsabilidad del operador. |
| **Exportar** | CSV con las estaciones visibles o para radios específicas (CHIRP, Yaesu FT5DR, FTM-150, OpenGD77 — experimental). |
| **Compartir** | URL con los filtros activos codificados en el query string. |
| **Stats** | Distribución de estaciones por banda, tipo, región y red. |

## Datos

- Fuente: [`data/curated_stations.csv`](data/curated_stations.csv) — curación manual sobre registros públicos de la SUBTEL.
- Generado: [`data/data.js`](data/data.js) — producido por [`scripts/csv-to-datajs.py`](scripts/csv-to-datajs.py).
- Los datos **no reemplazan** la ficha oficial del titular ni la autorización SUBTEL.

## Desarrollo local

```bash
python -m http.server 8080
# Abre http://localhost:8080/
```

> Sirve sobre HTTP (no `file://`) para que localStorage sea compartido entre páginas.

## Colaborar

Correcciones de datos o pull requests:  
📧 [cd3dxz@gmail.com](mailto:cd3dxz@gmail.com) — indicativo, campo a corregir, fuente si la tienes.  
🐙 [github.com/juantoledo/radiomap](https://github.com/juantoledo/radiomap)

## Licencia

Código y datos bajo [Creative Commons Atribución-NoComercial-CompartirIgual 4.0 (CC BY-NC-SA 4.0)](LICENSE) ([resumen en español](https://creativecommons.org/licenses/by-nc-sa/4.0/deed.es)).

Uso, copia y modificación libres con atribución, siempre que no sea con fines comerciales; las versiones derivadas deben compartirse bajo la misma licencia. Para uso comercial, solicita permiso previo: 📧 [cd3dxz@gmail.com](mailto:cd3dxz@gmail.com).

Desarrollado por [CD3DXZ](https://cd3dxz.radio).
