const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const HOST = "0.0.0.0";

const SERVER_NAME = "brandland";
const MINEHUT_API = "https://api.minehut.com";

// Evita que alguien pulse el botón cientos de veces.
const cooldown = new Map();
const COOLDOWN_MS = 30000;

function json(res, status, data) {
    res.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*"
    });

    res.end(JSON.stringify(data));
}

async function minehutRequest(url, options = {}) {
    const response = await fetch(url, options);
    const text = await response.text();

    let data = text;

    try {
        data = text ? JSON.parse(text) : {};
    } catch {
        // La respuesta no era JSON.
    }

    if (!response.ok) {
        throw new Error(
            `Minehut respondió ${response.status}: ${
                typeof data === "string" ? data : JSON.stringify(data)
            }`
        );
    }

    return data;
}

async function getServer() {
    return minehutRequest(
        `${MINEHUT_API}/server/${encodeURIComponent(SERVER_NAME)}?byName=true`
    );
}

function getServerId(serverData) {
    return (
        process.env.MINEHUT_SERVER_ID ||
        serverData?._id ||
        serverData?.id ||
        serverData?.server?._id ||
        serverData?.server?.id
    );
}

async function startServer(serverId) {
    const token = process.env.MINEHUT_AUTH_TOKEN;
    const sessionId = process.env.MINEHUT_SESSION_ID;

    if (!token || !sessionId) {
        throw new Error(
            "Faltan MINEHUT_AUTH_TOKEN y MINEHUT_SESSION_ID en Render."
        );
    }

    return minehutRequest(
        `${MINEHUT_API}/server/${serverId}/start_service`,
        {
            method: "POST",
            headers: {
                "authorization": token,
                "x-session-id": sessionId
            }
        }
    );
}

const server = http.createServer(async (req, res) => {

    // Estado
    if (req.url === "/api/status" && req.method === "GET") {
        try {
            const data = await getServer();

            return json(res, 200, {
                ok: true,
                server: data
            });
        } catch (error) {
            console.error(error);

            return json(res, 500, {
                ok: false,
                error: error.message
            });
        }
    }

    // Arrancar servidor
    if (req.url === "/api/start" && req.method === "POST") {
        const clientIp =
            req.headers["x-forwarded-for"] ||
            req.socket.remoteAddress ||
            "unknown";

        const lastRequest = cooldown.get(clientIp);
        const now = Date.now();

        if (lastRequest && now - lastRequest < COOLDOWN_MS) {
            const seconds = Math.ceil(
                (COOLDOWN_MS - (now - lastRequest)) / 1000
            );

            return json(res, 429, {
                ok: false,
                error: `Espera ${seconds} segundos antes de volver a intentarlo.`
            });
        }

        cooldown.set(clientIp, now);

        try {
            const serverData = await getServer();
            const serverId = getServerId(serverData);

            if (!serverId) {
                throw new Error("No se pudo obtener el ID de brandland.");
            }

            const result = await startServer(serverId);

            return json(res, 200, {
                ok: true,
                message: "Solicitud de inicio enviada.",
                result
            });
        } catch (error) {
            console.error(error);

            return json(res, 500, {
                ok: false,
                error: error.message
            });
        }
    }

    // Archivos de la página
    let requestedPath =
        req.url === "/"
            ? "index.html"
            : req.url.replace(/^\/+/, "");

    const filePath = path.normalize(
        path.join(__dirname, requestedPath)
    );

    if (!filePath.startsWith(__dirname)) {
        res.writeHead(403);
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
    console.log(
        `BRANDLAND funcionando en http://${HOST}:${PORT}`
    );
});
