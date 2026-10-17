const ADMIN_SESSION_KEY = "calorieCountAdminSession";
const ADMIN_EMAIL_KEY = "calorieCountAdminEmail";
const ADMIN_THEME_KEY = "calorieCountAdminTheme";

const adminLoginForm = document.getElementById("admin-login-form");
const adminLoginScreen = document.getElementById("admin-login-screen");
const adminDashboard = document.getElementById("admin-dashboard");
const adminStatus = document.getElementById("admin-status");
const foodForm = document.getElementById("food-form");
const foodStatus = document.getElementById("food-status");
const contactList = document.getElementById("contact-list");
const adminEmailBadge = document.getElementById("admin-email");
const adminLogoutButton = document.getElementById("admin-logout");

const statFoods = document.getElementById("stat-foods");
const statMessages = document.getElementById("stat-messages");
const statUsers = document.getElementById("stat-users");
const statUpdated = document.getElementById("stat-updated");

function setStatus(element, message, type = "") {
  if (!element) return;
  element.textContent = message || "";
  element.className = "status";
  if (type) element.classList.add(type);
}

function applyAdminTheme(theme) {
  const resolvedTheme = theme === "dark" ? "dark" : "light";
  document.body.setAttribute("data-theme", resolvedTheme);
  document.querySelectorAll("[data-admin-theme-toggle]").forEach((button) => {
    const icon = button.querySelector(".theme-icon");
    const label = button.querySelector(".theme-label");
    const isDark = resolvedTheme === "dark";

    if (icon) icon.textContent = isDark ? "☀" : "☾";
    if (label) label.textContent = isDark ? "Light" : "Dark";
    button.setAttribute("aria-label", `Switch to ${isDark ? "light" : "dark"} mode`);
  });
  localStorage.setItem(ADMIN_THEME_KEY, resolvedTheme);
}

function initAdminTheme() {
  const storedTheme = localStorage.getItem(ADMIN_THEME_KEY);
  applyAdminTheme(storedTheme || "light");
}

function isAdminLoggedIn() {
  return sessionStorage.getItem(ADMIN_SESSION_KEY) === "true";
}

function setAdminLoggedIn(isLoggedIn, email = "") {
  if (isLoggedIn) {
    sessionStorage.setItem(ADMIN_SESSION_KEY, "true");
    if (email) sessionStorage.setItem(ADMIN_EMAIL_KEY, email);
  } else {
    sessionStorage.removeItem(ADMIN_SESSION_KEY);
    sessionStorage.removeItem(ADMIN_EMAIL_KEY);
  }
}

function toggleAdminViews() {
  const loggedIn = isAdminLoggedIn();
  if (adminLoginScreen) adminLoginScreen.classList.toggle("hidden", loggedIn);
  if (adminDashboard) adminDashboard.classList.toggle("hidden", !loggedIn);

  const email = sessionStorage.getItem(ADMIN_EMAIL_KEY) || "admin";
  if (adminEmailBadge) {
    adminEmailBadge.textContent = loggedIn ? email : "Not signed in";
  }
}

async function parseJsonResponse(response, fallbackMessage = "The server returned an invalid response.") {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    const text = await response.text();
    throw new Error(text || fallbackMessage);
  }

  try {
    return await response.json();
  } catch {
    throw new Error(fallbackMessage);
  }
}

async function handleAdminLogin(event) {
  event.preventDefault();
  const formData = new FormData(adminLoginForm);
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");

  if (!email || !password) {
    setStatus(adminStatus, "Email and password are required.", "is-error");
    return;
  }

  try {
    const response = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await parseJsonResponse(response, "Admin login failed.");

    if (!response.ok) {
      throw new Error(data.error || "Admin login failed.");
    }

    setAdminLoggedIn(true, data.admin.email);
    toggleAdminViews();
    await loadAdminDashboard();
    setStatus(adminStatus, data.message || "Admin login successful.", "is-success");
    adminLoginForm.reset();
  } catch (error) {
    setStatus(adminStatus, error.message || "Unable to sign in.", "is-error");
  }
}

async function loadAdminDashboard() {
  try {
    const [summaryResponse, messagesResponse] = await Promise.all([
      fetch("/api/admin/summary"),
      fetch("/api/admin/contact-messages"),
    ]);

    const summary = await parseJsonResponse(summaryResponse, "Summary request failed.");
    const messagesData = await parseJsonResponse(messagesResponse, "Messages request failed.");

    if (!summaryResponse.ok) {
      throw new Error(summary.error || "Summary request failed.");
    }
    if (!messagesResponse.ok) {
      throw new Error(messagesData.error || "Messages request failed.");
    }

    if (statFoods) statFoods.textContent = summary.totalFoods ?? 0;
    if (statMessages) statMessages.textContent = summary.totalMessages ?? 0;
    if (statUsers) statUsers.textContent = summary.totalUsers ?? 0;
    if (statUpdated) {
      const updated = summary.lastUpdated ? new Date(summary.lastUpdated) : null;
      statUpdated.textContent = updated ? updated.toLocaleString() : "—";
    }

    renderMessages(messagesData.messages || []);
  } catch (error) {
    console.error(error);
    if (contactList) {
      contactList.innerHTML = `<div class="empty-note">Could not load contact submissions right now.</div>`;
    }
  }
}

function renderMessages(messages) {
  if (!contactList) return;

  if (!messages.length) {
    contactList.innerHTML = '<div class="empty-note">No contact messages have been submitted yet.</div>';
    return;
  }

  contactList.innerHTML = messages
    .map((message) => `
      <article class="message-card">
        <header>
          <strong>${escapeHtml(message.name || "Anonymous")}</strong>
          <span class="meta">${formatDate(message.createdAt)}</span>
        </header>
        <div class="meta">${escapeHtml(message.email || "No email")}</div>
        <p>${escapeHtml(message.message || "No message provided.")}</p>
      </article>
    `)
    .join("");
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatDate(value) {
  if (!value) return "Just now";
  return new Date(value).toLocaleString([], {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

async function handleFoodSubmit(event) {
  event.preventDefault();
  const formData = new FormData(foodForm);
  const payload = {
    name: String(formData.get("name") || "").trim(),
    id: String(formData.get("id") || "").trim(),
    type: String(formData.get("type") || "").trim(),
    category: String(formData.get("category") || "").trim(),
    emoji: String(formData.get("emoji") || "🍽️").trim(),
    color: String(formData.get("color") || "#E2790C").trim(),
    caloriesPer100g: Number(formData.get("caloriesPer100g") ?? 0),
    protein: Number(formData.get("protein") ?? 0),
    carbs: Number(formData.get("carbs") ?? 0),
    fat: Number(formData.get("fat") ?? 0),
    fiber: Number(formData.get("fiber") ?? 0),
    sugar: Number(formData.get("sugar") ?? 0),
    vitaminC: Number(formData.get("vitaminC") ?? 0),
    potassium: Number(formData.get("potassium") ?? 0),
    water: Number(formData.get("water") ?? 0),
    description: String(formData.get("description") || "").trim(),
    benefits: String(formData.get("benefits") || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  };

  if (!payload.name || !payload.type || !payload.category || !payload.caloriesPer100g) {
    setStatus(foodStatus, "Name, type, category, and calories are required.", "is-error");
    return;
  }

  try {
    const response = await fetch("/api/admin/foods", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await parseJsonResponse(response, "Failed to add food item.");

    if (!response.ok) {
      throw new Error(data.error || "Failed to add food item.");
    }

    setStatus(foodStatus, data.message || "Food item added successfully.", "is-success");
    foodForm.reset();
    await loadAdminDashboard();
  } catch (error) {
    setStatus(foodStatus, error.message || "Unable to save food item.", "is-error");
  }
}

if (adminLoginForm) {
  adminLoginForm.addEventListener("submit", handleAdminLogin);
}

if (foodForm) {
  foodForm.addEventListener("submit", handleFoodSubmit);
}

if (adminLogoutButton) {
  adminLogoutButton.addEventListener("click", () => {
    setAdminLoggedIn(false);
    toggleAdminViews();
    setStatus(adminStatus, "You have been signed out.", "is-success");
  });
}

document.querySelectorAll("[data-admin-theme-toggle]").forEach((button) => {
  button.addEventListener("click", () => {
    const nextTheme = document.body.getAttribute("data-theme") === "dark" ? "light" : "dark";
    applyAdminTheme(nextTheme);
  });
});

initAdminTheme();
toggleAdminViews();
if (isAdminLoggedIn()) {
  loadAdminDashboard();
}
