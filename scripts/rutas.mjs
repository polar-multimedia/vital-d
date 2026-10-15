// GitHub Pages solo sirve archivos: se copia index.html a cada ruta del evento
// para que /vital-d/acapulco/, /vital-d/queretaro/ y /vital-d/staff/ abran directo.
import fs from 'fs';
const html = fs.readFileSync('docs/index.html', 'utf8');
for (const r of ['acapulco', 'queretaro', 'staff']) {
  fs.mkdirSync(`docs/${r}`, { recursive: true });
  fs.writeFileSync(`docs/${r}/index.html`, html);
}
fs.writeFileSync('docs/404.html', html);
fs.writeFileSync('docs/.nojekyll', '');
console.log('Rutas listas: /acapulco/ /queretaro/ /staff/');
