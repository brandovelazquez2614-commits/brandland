const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const HOST = "0.0.0.0";

const server = http.createServer((req, res) => {
    let requestedPath = req.url === "/"
        ? "index.html"
        : req.url.replace(/^\/+/, "");

    const filePath = path.normalize(
        path.join(__dirname, requestedPath)
    );

    if (!filePath.startsWith(__dirname)) {
        res.writeHead(403, {
            "Content-Type": "text/plain; charset=utf-8"
        });
        res.end("Acceso denegado");
        return;
    }

    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404, {
                "Content-Type": "text/plain; charset=utf-8"
            });
            res.end("Página no encontrada");
            return;
        }

        const ext = path.extname(filePath).toLowerCase();

        const contentTypes = {
            ".html": "text/html; charset=utf-8",
            ".css": "text/css; charset=utf-8",
            ".js": "application/javascript; charset=utf-8",
            ".json": "application/json; charset=utf-8"
        };

        res.writeHead(200, {
            "Content-Type":
                contentTypes[ext] || "application/octet-stream"
        });

        res.end(data);
    });
});

server.listen(PORT, HOST, () => {
    console.log(`BRANDLAND funcionando en http://${HOST}:${PORT}`);
});