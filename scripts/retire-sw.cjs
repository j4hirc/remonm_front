const { copyFileSync } = require('node:fs');
const { resolve } = require('node:path');

// Publicar el worker de recuperación oficial de Angular
// en la misma URL que utilizan las instalaciones existentes.
copyFileSync(
  resolve(
    __dirname,
    '../node_modules/@angular/service-worker/safety-worker.js'
  ),
  resolve(
    __dirname,
    '../dist/remonm_front/browser/ngsw-worker.js'
  )
);

console.log(
  'Worker de recuperación publicado. Caché offline desactivada temporalmente.'
);