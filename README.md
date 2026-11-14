# Portfolio web — Pedro Garzón

Web personal estática (HTML, CSS y JavaScript) desplegada en Netlify.

## Estructura

- `index.html`: contenido de la página
- `styles.css`: estilos
- `site.js`: interacciones
- `assets/docs/`: CV en PDF
- `assets/img/logos/`: logos de las universidades

## Desarrollo local

No necesita build. Abre `index.html` en el navegador, o sirve la carpeta con:

```
npx serve .
```

## Despliegue

El sitio se despliega automáticamente en Netlify con cada push a `main`
(sin build command; publish directory: `.`).
