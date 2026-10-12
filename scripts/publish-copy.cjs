// Turns the built page into what the published link expects: the page's own
// content without the outer document tags, which the host adds itself.
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'dist', 'index.html'), 'utf8');
const head = html.match(/<head>([\s\S]*?)<\/head>/)[1]
  .replace(/<meta charset[^>]*>/, '')
  .replace(/<meta name="viewport"[^>]*>/, '');
const body = html.match(/<body>([\s\S]*?)<\/body>/)[1];
const out = `${head.trim()}\n${body.trim()}\n`;
fs.mkdirSync(path.join(__dirname, '..', 'out'), { recursive: true });
fs.writeFileSync(path.join(__dirname, '..', 'out', 'popstage-buehne.html'), out);
console.log('popstage-buehne.html', (out.length / 1024 / 1024).toFixed(2), 'MB');
