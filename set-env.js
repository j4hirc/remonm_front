const fs = require('node:fs');
const path = require('node:path');

const dir = path.join(__dirname, 'src', 'environments');

const apiUrl = (
  process.env.API_URL?.trim() ||
  'https://api-rojas-remodeling.onrender.com/api/v1'
).replace(/\/+$/, '');

const configuration = {
  production: true,
  apiUrl
};

const envConfigFile =
  '// Generado automáticamente por set-env.js.\n' +
  `export const environment = ${JSON.stringify(configuration, null, 2)} as const;\n`;

fs.mkdirSync(dir, { recursive: true });

fs.writeFileSync(
  path.join(dir, 'environment.ts'),
  envConfigFile,
  'utf8'
);

console.log('environment.ts generado correctamente.');
console.log(`API configurada: ${apiUrl}`);