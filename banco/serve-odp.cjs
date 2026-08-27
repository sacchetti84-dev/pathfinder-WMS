/* Passacarte del banco: serve un file solo, con CORS, perche' la maschera
   «Da Ordine (XLSX)» prenda l'ordine di prova senza una finestra di sistema.
   Sta acceso quanto dura la prova. */
const http = require('http'), fs = require('fs');
const file = process.argv[2];
http.createServer((_, res) => {
  res.writeHead(200, {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  fs.createReadStream(file).pipe(res);
}).listen(4300, '127.0.0.1', () => console.log('passacarte su 4300:', file));
