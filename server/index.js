// server/index.js (CommonJS)
// Express + LTI + APIs + SPA React (sirviendo /client/build)
// Nota para tu yo del futuro: no redefinas __filename/__dirname en CJS.

const path = require("path");
const express = require("express");
const session = require("express-session");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const compression = require("compression");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3001;

// Seguridad / utilidades
app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());
app.use(morgan("dev"));
app.use(
  cors({
    origin: (process.env.CORS_ORIGIN || "http://localhost:3000").split(","),
    credentials: true,
  })
);

// Body parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Sesión
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
      maxAge: 1000 * 60 * 60 * 8,
    },
  })
);

// -----------------
// Rutas LTI primero
// -----------------
app.get("/lti/login", (req, res) => {
  res.status(200).send("LTI login OK (placeholder)");
});

app.post("/lti/launch", (req, res) => {
  // Aquí normalmente setearías la sesión y redirigirías según rol
  // p.ej.: res.redirect("/student-dashboard");
  res.status(200).send("LTI launch OK (placeholder)");
});

// -----------------
// APIs bajo /api/**
// -----------------
const api = express.Router();

api.get("/health", (_req, res) => res.json({ ok: true }));
// api.get("/user", async (req, res, next) => { /* ... */ });
// api.get("/student/units", async (req, res, next) => { /* ... */ });

app.use("/api", api);

// --------------------------------------------------------
// SPA React estática (PROD): SERVIR DESDE client/build
// --------------------------------------------------------
const clientBuildPath = path.join(__dirname, "../client/build");
app.use(express.static(clientBuildPath));

// Catch‑all del SPA (después de /api y /lti)
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api") || req.path.startsWith("/lti")) return next();
  res.sendFile(path.join(clientBuildPath, "index.html"));
});

// 404 explícito para APIs/LTI
app.use((req, res, _next) => {
  if (req.path.startsWith("/api") || req.path.startsWith("/lti")) {
    return res.status(404).json({ error: "Not found" });
  }
  return res.status(404).send("Not found");
});

// Error handler
app.use((err, _req, res, _next) => {
  console.error("[ERROR]", err);
  res.status(err.status || 500).json({ error: err.message || "Internal Server Error" });
});

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
  console.log("NODE_ENV:", process.env.NODE_ENV);
  console.log("Serving React from:", clientBuildPath);
});
