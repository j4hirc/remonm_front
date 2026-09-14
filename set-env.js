const fs = require('fs');

const dir = './src/environments';
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

const envConfigFile = `export const environment = {
  production: true,
  apiUrl: '${process.env.API_URL || "https://api-rojas-remodeling.onrender.com/api/v1"}'
};
`;

fs.writeFileSync('./src/environments/environment.ts', envConfigFile);
console.log(`Archivo environment.ts generado correctamente con la API URL.`);