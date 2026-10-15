// server.js
// Backend for the Calorie Count website.
// Serves the frontend (public/) and a small REST API over the food dataset.

const express = require("express");
const path = require("path");
const fs = require("fs");
const { randomBytes, scryptSync, timingSafeEqual } = require("node:crypto");
const { DatabaseSync } = require("node:sqlite");

const app = express();
const PORT = process.env.PORT || 3000;

const db = new DatabaseSync(path.join(__dirname, "users.db"));

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    firstName TEXT NOT NULL,
    lastName TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    phone TEXT NOT NULL,
    password TEXT NOT NULL,
    goal TEXT,
    createdAt TEXT NOT NULL
  );
`);

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function isStrongPassword(password) {
  return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/.test(
    String(password || "")
  );
}

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(String(password), salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

function verifyPassword(password, storedPassword) {
  const stored = String(storedPassword || "");
  if (!stored.startsWith("scrypt$")) {
    return { valid: stored === String(password), needsRehash: true };
  }

  const [, salt, encodedHash] = stored.split("$");
  if (!/^[a-f\d]{32}$/i.test(salt || "") || !/^[a-f\d]{128}$/i.test(encodedHash || "")) {
    return { valid: false, needsRehash: false };
  }

  const expectedHash = Buffer.from(encodedHash, "hex");
  const actualHash = scryptSync(String(password), salt, expectedHash.length);
  return {
    valid: timingSafeEqual(actualHash, expectedHash),
    needsRehash: false,
  };
}

function validatePhone(phone) {
  return /^[+]?[(]?[0-9]{1,4}[)]?[-\s0-9]{8,15}$/.test(String(phone || ""));
}

function createUserRecord(user) {
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    phone: user.phone,
    goal: user.goal,
    createdAt: user.createdAt,
  };
}

// ---- Load food data once at startup ----
const DATA_PATH = path.join(__dirname, "foods.json");
const LEGACY_DATA_PATH = path.join(__dirname, "data", "foods.json");
let foods = [];

function loadFoods() {
  const dataFile = fs.existsSync(DATA_PATH) ? DATA_PATH : LEGACY_DATA_PATH;
  const raw = fs.readFileSync(dataFile, "utf-8");
  foods = JSON.parse(raw);
  console.log(`Loaded ${foods.length} food items from ${path.basename(dataFile)}`);
}
loadFoods();

// ---- Middleware ----
app.use(express.json());
app.use(express.static(__dirname));

// ---- API routes ----

// GET /api/foods                      -> list all items (summary fields only)
// GET /api/foods?type=fruit            -> filter by type (fruit, vegetable, dryfruit, meat, snack, fastfood)
// GET /api/foods?type=fruit&category=  -> also filter by the item's subtype/category
app.get("/api/foods", (req, res) => {
  const { type, category } = req.query;
  let list = foods;
  if (type) {
    list = list.filter((f) => f.type.toLowerCase() === type.toLowerCase());
  }
  if (category) {
    list = list.filter(
      (f) => f.category.toLowerCase() === category.toLowerCase()
    );
  }
  const summary = list.map(
    ({ id, name, emoji, color, type, category, caloriesPer100g }) => ({
      id,
      name,
      emoji,
      color,
      type,
      category,
      caloriesPer100g,
    })
  );
  res.json({ count: summary.length, foods: summary });
});

// GET /api/foods/search?q=mango&type=fruit -> search by name (partial, case-insensitive)
app.get("/api/foods/search", (req, res) => {
  const q = (req.query.q || "").trim().toLowerCase();
  const { type } = req.query;
  if (!q) {
    return res.status(400).json({ error: "Query parameter 'q' is required." });
  }
  let matches = foods.filter((f) => f.name.toLowerCase().includes(q));
  if (type) {
    matches = matches.filter((f) => f.type.toLowerCase() === type.toLowerCase());
  }
  res.json({ count: matches.length, foods: matches });
});

// GET /api/foods/:id  -> full detail for one item
app.get("/api/foods/:id", (req, res) => {
  const food = foods.find(
    (f) => f.id.toLowerCase() === req.params.id.toLowerCase()
  );
  if (!food) {
    return res.status(404).json({ error: `No food found with id '${req.params.id}'.` });
  }
  res.json(food);
});

// GET /api/types -> distinct top-level food types, for the main filter tabs
app.get("/api/types", (req, res) => {
  const types = [...new Set(foods.map((f) => f.type))];
  res.json({ types });
});

// GET /api/categories?type=fruit -> distinct sub-categories, optionally scoped to a type
app.get("/api/categories", (req, res) => {
  const { type } = req.query;
  let list = foods;
  if (type) list = list.filter((f) => f.type.toLowerCase() === type.toLowerCase());
  const categories = [...new Set(list.map((f) => f.category))].sort();
  res.json({ categories });
});

// POST /api/auth/register -> create a new user record in SQLite
app.post("/api/auth/register", (req, res) => {
  const { firstName, lastName, email, phone, password, goal } = req.body || {};

  if (!firstName || !lastName) {
    return res.status(400).json({ error: "First and last name are required." });
  }

  const cleanEmail = normalizeEmail(email);
  const cleanPhone = String(phone || "").trim();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    return res.status(400).json({ error: "Please provide a valid email address." });
  }

  if (!validatePhone(cleanPhone)) {
    return res.status(400).json({ error: "Please provide a valid phone number." });
  }

  if (!isStrongPassword(password)) {
    return res.status(400).json({
      error: "Password must contain at least 8 characters, including uppercase, lowercase, a number, and a symbol.",
    });
  }

  const existing = db
    .prepare("SELECT id FROM users WHERE email = ?")
    .get(cleanEmail);

  if (existing) {
    return res.status(409).json({ error: "This email is already registered." });
  }

  const insert = db.prepare(`
    INSERT INTO users (firstName, lastName, email, phone, password, goal, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const createdAt = new Date().toISOString();
  const result = insert.run(
    String(firstName).trim(),
    String(lastName).trim(),
    cleanEmail,
    cleanPhone,
    hashPassword(password),
    String(goal || "healthy-eating"),
    createdAt
  );

  const user = db
    .prepare("SELECT id, firstName, lastName, email, phone, goal, createdAt FROM users WHERE id = ?")
    .get(result.lastInsertRowid);

  return res.status(201).json({
    ok: true,
    message: "Account created successfully.",
    user: createUserRecord(user),
  });
});

// POST /api/auth/login -> validate user against the backend database
app.post("/api/auth/login", (req, res) => {
  const { email, password } = req.body || {};
  const cleanEmail = normalizeEmail(email);

  if (!cleanEmail || !String(password || "")) {
    return res.status(400).json({ error: "Email and password are required." });
  }

  const user = db
    .prepare("SELECT * FROM users WHERE email = ?")
    .get(cleanEmail);

  if (!user) {
    return res.status(401).json({ error: "No account matches this email." });
  }

  const passwordCheck = verifyPassword(password, user.password);
  if (!passwordCheck.valid) {
    return res.status(401).json({ error: "Incorrect password." });
  }

  if (passwordCheck.needsRehash) {
    db.prepare("UPDATE users SET password = ? WHERE id = ?").run(
      hashPassword(password),
      user.id
    );
  }

  return res.status(200).json({
    ok: true,
    message: "Login successful.",
    user: createUserRecord(user),
  });
});

// POST /api/contact -> accepts a contact form submission
// There is no email service wired up here; submissions are logged server-side
// so the route is easy to swap for a real mailer or database later.
app.post("/api/contact", (req, res) => {
  const { name, email, message } = req.body || {};

  if (!name || !email || !message) {
    return res.status(400).json({ error: "Name, email, and message are all required." });
  }
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailPattern.test(email)) {
    return res.status(400).json({ error: "Please provide a valid email address." });
  }

  console.log("New contact form submission:", {
    name,
    email,
    message,
    receivedAt: new Date().toISOString(),
  });

  res.status(200).json({ ok: true, message: "Thanks — your message has been received." });
});

app.use("/api", (req, res) => {
  res.status(404).json({ error: `API route not found: ${req.method} ${req.originalUrl}` });
});

// Fallback: send the SPA's index.html for any unmatched non-API route
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api/")) return next();
  res.sendFile(path.join(__dirname, "index.html"));
});

app.listen(PORT, () => {
  console.log(`Calorie Count server running at http://localhost:${PORT}`);
});
