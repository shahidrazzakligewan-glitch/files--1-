// server.js
// Backend for the Calorie Count website.
// Serves the frontend (public/) and a small REST API over the food dataset.

const express = require("express");
const path = require("path");
const fs = require("fs");
const { randomBytes, scryptSync, timingSafeEqual } = require("node:crypto");

const app = express();
const PORT = process.env.PORT || 3000;
const USER_DATA_PATH = path.join(__dirname, "user-data.json");

function nextRecordId(records) {
  return records.reduce((maximum, record) => Math.max(maximum, Number(record.id) || 0), 0) + 1;
}

function loadUserData() {
  if (!fs.existsSync(USER_DATA_PATH)) {
    const emptyData = {
      users: [],
      contactMessages: [],
      nextUserId: 1,
      nextContactMessageId: 1,
    };
    fs.writeFileSync(USER_DATA_PATH, `${JSON.stringify(emptyData, null, 2)}\n`, { flag: "wx" });
    return emptyData;
  }

  const data = JSON.parse(fs.readFileSync(USER_DATA_PATH, "utf-8"));
  if (!data || !Array.isArray(data.users) || !Array.isArray(data.contactMessages)) {
    throw new Error("user-data.json must contain users and contactMessages arrays.");
  }

  return {
    users: data.users,
    contactMessages: data.contactMessages,
    nextUserId: Math.max(Number(data.nextUserId) || 1, nextRecordId(data.users)),
    nextContactMessageId: Math.max(
      Number(data.nextContactMessageId) || 1,
      nextRecordId(data.contactMessages)
    ),
  };
}

let userData = loadUserData();

function saveUserData() {
  const temporaryPath = `${USER_DATA_PATH}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(userData, null, 2)}\n`);
  fs.renameSync(temporaryPath, USER_DATA_PATH);
}

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
app.use(
  [
    "/user-data.json",
    "/user-data.json.tmp",
    "/users.db",
    "/users.db-journal",
    "/users.db-shm",
    "/users.db-wal",
  ],
  (req, res) => res.sendStatus(404)
);
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

// POST /api/auth/register -> create a new user record in user-data.json
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

  const existing = userData.users.some((user) => user.email === cleanEmail);

  if (existing) {
    return res.status(409).json({ error: "This email is already registered." });
  }

  const createdAt = new Date().toISOString();
  const user = {
    id: userData.nextUserId,
    firstName: String(firstName).trim(),
    lastName: String(lastName).trim(),
    email: cleanEmail,
    phone: cleanPhone,
    password: hashPassword(password),
    goal: String(goal || "healthy-eating"),
    createdAt,
  };

  userData.users.push(user);
  userData.nextUserId += 1;

  try {
    saveUserData();
  } catch (error) {
    userData.users.pop();
    userData.nextUserId = user.id;
    console.error("Could not save new account:", error);
    return res.status(500).json({ error: "Could not save your account right now. Please try again." });
  }

  return res.status(201).json({
    ok: true,
    message: "Account created successfully.",
    user: createUserRecord(user),
  });
});

// POST /api/auth/login -> validate a user stored in user-data.json
app.post("/api/auth/login", (req, res) => {
  const { email, password } = req.body || {};
  const cleanEmail = normalizeEmail(email);

  if (!cleanEmail || !String(password || "")) {
    return res.status(400).json({ error: "Email and password are required." });
  }

  const user = userData.users.find((record) => record.email === cleanEmail);

  if (!user) {
    return res.status(401).json({ error: "No account matches this email." });
  }

  const passwordCheck = verifyPassword(password, user.password);
  if (!passwordCheck.valid) {
    return res.status(401).json({ error: "Incorrect password." });
  }

  if (passwordCheck.needsRehash) {
    const previousPassword = user.password;
    user.password = hashPassword(password);
    try {
      saveUserData();
    } catch (error) {
      user.password = previousPassword;
      console.error("Could not update account password:", error);
      return res.status(500).json({ error: "Could not sign in right now. Please try again." });
    }
  }

  return res.status(200).json({
    ok: true,
    message: "Login successful.",
    user: createUserRecord(user),
  });
});

// POST /api/contact -> validate and save contact form submissions in user-data.json
app.post("/api/contact", (req, res) => {
  const { name, email, message } = req.body || {};
  const cleanName = String(name || "").trim();
  const cleanEmail = normalizeEmail(email);
  const cleanMessage = String(message || "").trim();

  if (!cleanName || !cleanEmail || !cleanMessage) {
    return res.status(400).json({ error: "Name, email, and message are all required." });
  }

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailPattern.test(cleanEmail)) {
    return res.status(400).json({ error: "Please provide a valid email address." });
  }

  if (cleanName.length > 100 || cleanEmail.length > 254 || cleanMessage.length > 5000) {
    return res.status(400).json({ error: "Please keep the name, email, and message within the allowed length." });
  }

  const createdAt = new Date().toISOString();
  const contactMessage = {
    id: userData.nextContactMessageId,
    name: cleanName,
    email: cleanEmail,
    message: cleanMessage,
    createdAt,
  };

  try {
    userData.contactMessages.push(contactMessage);
    userData.nextContactMessageId += 1;
    saveUserData();

    return res.status(201).json({
      ok: true,
      message: "Thanks — your message has been saved.",
      createdAt,
    });
  } catch (error) {
    if (userData.contactMessages.at(-1) === contactMessage) {
      userData.contactMessages.pop();
      userData.nextContactMessageId = contactMessage.id;
    }
    console.error("Could not save contact form submission:", error);
    return res.status(500).json({ error: "Could not save your message right now. Please try again." });
  }
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
