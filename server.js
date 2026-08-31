const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = process.env.PORT || 3000;
const HOST = "0.0.0.0";

const ADMIN_PASSWORD =
    process.env.BRANDLAND_ADMIN_PASSWORD;

const BEDROCK_SERVER =
    "brandland.bedrock.minehut.gg";

const MCSTATUS_URL =
    `https://api.mcstatus.io/v2/status/bedrock/${BEDROCK_SERVER}`;

function sendJson(res, status, data) {
    res.writeHead(status, {
        "Content-Type":
            "application/json; charset=utf-8",
        "Cache-Control": "no-store"
    });

    res.end(JSON.stringify(data));
}

function passwordMatches(input) {
    if (
        !ADMIN_PASSWORD ||
        typeof input !== "string"
    ) {
        return false;
    }

    const a = Buffer.from(input);
    const b = Buffer.from(ADMIN_PASSWORD);

    if (a.length !== b.length) {
        return false;
    }

    return crypto.timingSafeEqual(a, b);
}

const attempts = new Map();

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 60 * 1000;

async function obtenerEstado() {
    const respuesta = await fetch(
        `${MCSTATUS_URL}?timeout=3`
    );

    if (!respuesta.ok) {
        throw new Error(
            `mcstatus respondió ${respuesta.status}`
        );
    }

    const datos = await respuesta.json();

    return {
        online: datos.online === true
    };
}

const server = http.createServer(
    async (req, res) => {

        // --------------------------------
        // ESTADO DEL SERVIDOR
        // --------------------------------
        if (
            req.url === "/api/status" &&
            req.method === "GET"
        ) {
            try {

                const datos =
                    await obtenerEstado();

                return sendJson(
                    res,
                    200,
                    {
                        online: datos.online
                    }
                );

            } catch (error) {

                console.error(
                    "Error de estado:",
                    error.message
                );

                return sendJson(
                    res,
                    200,
                    {
                        online: false
                    }
                );
            }
        }

        // --------------------------------
        // ADMINISTRACIÓN
        // --------------------------------
        if (
            req.url === "/api/admin" &&
            req.method === "POST"
        ) {
            let body = "";

            req.on(
                "data",
                chunk => {
                    body += chunk.toString();

                    if (
                        body.length > 5000
                    ) {
                        req.destroy();
                    }
                }
            );

            req.on(
                "end",
                () => {

                    try {

                        const ip =
                            req.headers[
                                "x-forwarded-for"
                            ] ||
                            req.socket.remoteAddress ||
                            "unknown";

                        const now =
                            Date.now();

                        const record =
                            attempts.get(ip);

                        if (
                            !record ||
                            now - record.time >
                                WINDOW_MS
                        ) {
                            attempts.set(
                                ip,
                                {
                                    time: now,
                                    count: 0
                                }
                            );
                        }

                        const current =
                            attempts.get(ip);

                        if (
                            current.count >=
                            MAX_ATTEMPTS
                        ) {
                            return sendJson(
                                res,
                                429,
                                {
                                    ok: false,
                                    error:
                                        "Demasiados intentos. Espera un minuto."
                                }
                            );
                        }

                        current.count++;

                        let data;

                        try {

                            data =
                                JSON.parse(body);

                        } catch {

                            return sendJson(
                                res,
                                400,
                                {
                                    ok: false,
                                    error:
                                        "Solicitud inválida."
                                }
                            );
                        }

                        if (
                            !passwordMatches(
                                data.password
                            )
                        ) {
                            return sendJson(
                                res,
                                401,
                                {
                                    ok: false,
                                    error:
                                        "Contraseña incorrecta."
                                }
                            );
                        }

                        attempts.delete(ip);

                        return sendJson(
                            res,
                            200,
                            {
                                ok: true,
                                dashboard:
                                    "https://dashboard.minehut.com/"
                            }
                        );

                    } catch (error) {

                        console.error(error);

                        return sendJson(
                            res,
                            500,
                            {
                                ok: false,
                                error:
                                    "Error interno del servidor."
                            }
                        );
                    }
                }
            );

            return;
        }

        // --------------------------------
        // ARCHIVOS DE LA PÁGINA
        // --------------------------------

        let requestedPath =
            req.url === "/"
                ? "index.html"
                : req.url.replace(
                    /^\/+/,
                    ""
                );

        const filePath =
            path.normalize(
                path.join(
                    __dirname,
                    requestedPath
                )
            );

        if (
            !filePath.startsWith(
                __dirname
            )
        ) {
            res.writeHead(403);
            res.end(
                "Acceso denegado"
            );
            return;
        }

        fs.readFile(
            filePath,
            (err, data) => {

                if (err) {

                    res.writeHead(
                        404,
                        {
                            "Content-Type":
                                "text/plain; charset=utf-8"
                        }
                    );

                    res.end(
                        "Página no encontrada"
                    );

                    return;
                }

                const ext =
                    path.extname(
                        filePath
                    ).toLowerCase();

                const contentTypes = {
                    ".html":
                        "text/html; charset=utf-8",

                    ".css":
                        "text/css; charset=utf-8",

                    ".js":
                        "application/javascript; charset=utf-8",

                    ".json":
                        "application/json; charset=utf-8"
                };

                res.writeHead(
                    200,
                    {
                        "Content-Type":
                            contentTypes[
                                ext
                            ] ||
                            "application/octet-stream"
                    }
                );

                res.end(data);
            }
        );
    }
);

server.listen(
    PORT,
    HOST,
    () => {
        console.log(
            `BRANDLAND funcionando en http://0.0.0.0:${PORT}`
        );
    }
);
