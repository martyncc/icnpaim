// server/index.js
// Servidor Express para LTI 1.3 + APIs + SPA React en producción
// Sí, futuro-yo: el orden de los middlewares importa. No lo rompas otra vez.

const path = require("path");
const express = require("express");
const session = require("express-session");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const compression = require("compression");
const dotenv = require("dotenv");

// Servicios (stubs de ejemplo)
// import { getUnitsForStudent, getUserProfile } from "./services/courseService.js";
// import { ltiLogin, ltiLaunch } from "./services/ltiService.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Seguridad / utilidades
app.use(helmet({
  contentSecurityPolicy: false, // ajusta si usas CSP estricta
}));
app.use(compression());
app.use(morgan("dev"));
app.use(cors({
  origin: process.env.CORS_ORIGIN?.split(",") || ["http://localhost:3000"],
  credentials: true,
}));

// Body parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Sesión (asegúrate de configurar SESSION_SECRET en producción)
app.use(
  session({
    name: "sid",
    secret: process.env.SESSION_SECRET || "dev_secret_change_me",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 1000 * 60 * 60 * 8, // 8h
    },
  })
);

// -----------------
// Rutas LTI primero
// -----------------

// Placeholders: reemplaza con tu lógica real
app.get("/lti/login", (req, res) => {
  // ltiLogin(req, res)
  res.status(200).send("LTI login OK (placeholder)");
});

app.post("/lti/launch", (req, res) => {
  // ltiLaunch(req, res)
  // Según el rol, redirige al frontend:
  // p.ej.: res.redirect("/student-dashboard");
  res.status(200).send("LTI launch OK (placeholder)");
});

// -----------------
// APIs bajo /api/**
// -----------------

const api = express.Router();

api.get("/health", (_req, res) => res.json({ ok: true }));

// api.get("/user", async (req, res, next) => {
//   try {
//     const data = await getUserProfile(req.session.userId);
//     res.json(data);
//   } catch (err) { next(err); }
// });

// api.get("/student/units", async (req, res, next) => {
//   try {
//     const data = await getUnitsForStudent(req.session.userId);
//     res.json(data);
//   } catch (err) { next(err); }
// });

app.use("/api", api);

// --------------------------------------------------------
// SPA React estática (PROD): SERVIR DESDE client/build
// --------------------------------------------------------
// ⚠️ Clave del bug que ves: si sirves /client/public o pones este bloque
// antes de /api, Express devuelve index.html para TODO (incluyendo /api),
// por eso ves HTML en lugar de JSON.

const clientBuildPath = path.join(__dirname, "../client/build");
app.use(express.static(clientBuildPath));

// Catch‑all del SPA (después de /api y /lti):
app.get("*", (req, res, next) => {
  // No capturar rutas de API ni LTI
  if (req.path.startsWith("/api") || req.path.startsWith("/lti")) {
    return next();
  }
  res.sendFile(path.join(clientBuildPath, "index.html"));
});

// ---------------------------------
// Manejadores de error holi
// ---------------------------------
app.use((req, res, _next) => {
  // 404 explícito para APIs (que no termine en HTML del SPA)
  if (req.path.startsWith("/api") || req.path.startsWith("/lti")) {
    return res.status(404).json({ error: "Not found" });
  }
  return res.status(404).send("Not found");
});

app.use((err, _req, res, _next) => {
  console.error("[ERROR]", err);
  const status = err.status || 500;
  const payload = {
    error: err.message || "Internal Server Error",
  };
  res.status(status).json(payload);
});

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
  console.log("NODE_ENV:", process.env.NODE_ENV);
  console.log("Serving React from:", clientBuildPath);
});
