// script.js — talks to the Express API, renders the food UI, and handles auth flows.

const grid = document.getElementById("fruit-grid");
const resultsMeta = document.getElementById("results-meta");
const emptyState = document.getElementById("empty-state");
const filtersNav = document.getElementById("filters");
const searchForm = document.getElementById("search-form");
const searchInput = document.getElementById("search-input");

const drawer = document.getElementById("drawer");
const drawerBackdrop = document.getElementById("drawer-backdrop");
const drawerContent = document.getElementById("drawer-content");
const drawerClose = document.getElementById("drawer-close");

const contactForm = document.getElementById("contact-form");
const contactStatus = document.getElementById("contact-status");
const authTabs = document.querySelectorAll(".auth-tab");
const authPanels = document.querySelectorAll(".auth-panel");
const authMessage = document.getElementById("auth-message");
const loginForm = document.getElementById("login-form");
const signupForm = document.getElementById("signup-form");
const nutritionProfileForm = document.getElementById("nutrition-profile-form");
const nutritionPlanResults = document.getElementById("nutrition-plan-results");

let activeType = "all";
let currentQuery = "";

const TYPE_LABELS = {
  fruit: "Fruit",
  vegetable: "Vegetables",
  dryfruit: "Dry fruits & nuts",
  meat: "Meat & fish",
  snack: "Snacks",
  fastfood: "Fast food",
};

const MACRO_MAX = { protein: 32, carbs: 80, fat: 70, fiber: 18, sugar: 65 };

const foodAppReady = Boolean(grid && searchForm && filtersNav && searchInput);

if (foodAppReady) {
  initFoodApp();
}

if (authTabs.length || loginForm || signupForm) {
  initAuthFlow();
}

function initFoodApp() {
  loadTypes();
  loadFoods();

  searchForm.addEventListener("submit", (e) => {
    e.preventDefault();
    currentQuery = searchInput.value.trim();
    loadFoods();
  });

  if (drawerClose) drawerClose.addEventListener("click", closeDrawer);
  if (drawerBackdrop) drawerBackdrop.addEventListener("click", closeDrawer);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeDrawer();
  });

  document.querySelectorAll("[data-motion-toggle]").forEach((button) => {
    button.addEventListener("click", () => {
      const nextMode = document.documentElement.dataset.motion === "reduced" ? "full" : "reduced";
      setMotionMode(nextMode);
    });
  });

  updateMotionToggle();

  if (contactForm) {
    contactForm.addEventListener("submit", handleContactSubmit);
  }

  initNutritionPlanner();

  initContactReveal();
}

const NUTRITION_PROFILE_KEY = "calorieCountNutritionProfile";

function initNutritionPlanner() {
  if (!nutritionProfileForm || !nutritionPlanResults) return;

  const savedProfile = getNutritionProfile();
  if (savedProfile) {
    Object.entries(savedProfile).forEach(([key, value]) => {
      const field = nutritionProfileForm.elements.namedItem(key);
      if (field) field.value = value;
    });
    showNutritionPlan(savedProfile);
  }

  nutritionProfileForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!nutritionProfileForm.reportValidity()) return;

    const formData = new FormData(nutritionProfileForm);
    const profile = Object.fromEntries(formData.entries());
    profile.age = Number(profile.age);
    profile.height = Number(profile.height);
    profile.weight = Number(profile.weight);
    profile.activity = Number(profile.activity);
    localStorage.setItem(NUTRITION_PROFILE_KEY, JSON.stringify(profile));
    await showNutritionPlan(profile);
  });

  document.getElementById("clear-nutrition-profile")?.addEventListener("click", () => {
    localStorage.removeItem(NUTRITION_PROFILE_KEY);
    nutritionProfileForm.reset();
    nutritionPlanResults.hidden = true;
    nutritionPlanResults.innerHTML = "";
  });
}

function getNutritionProfile() {
  try {
    return JSON.parse(localStorage.getItem(NUTRITION_PROFILE_KEY) || "null");
  } catch {
    return null;
  }
}

async function showNutritionPlan(profile) {
  nutritionPlanResults.classList.remove("is-ready");
  nutritionPlanResults.hidden = false;
  nutritionPlanResults.innerHTML = '<p class="nutrition-plan__loading">Finding food ideas for your profile…</p>';

  try {
    const response = await fetch("/foods.json");
    if (!response.ok) throw new Error("Could not load food recommendations.");
    const data = await response.json();

    const bmr = 10 * profile.weight + 6.25 * profile.height - 5 * profile.age +
      (profile.sex === "male" ? 5 : profile.sex === "female" ? -161 : -78);
    const maintenanceCalories = Math.round(bmr * profile.activity);
    const bmi = profile.weight / ((profile.height / 100) ** 2);
    const goalLabels = {
      lose: "gradual weight loss",
      gain: "gradual weight gain",
      maintain: "weight maintenance",
      protein: "higher-protein choices",
      fiber: "higher-fiber choices",
      "low-sugar": "lower-sugar choices",
    };

    if (profile.goal === "lose" && bmi < 18.5) {
      nutritionPlanResults.innerHTML = `
        <div class="nutrition-plan__summary">
          <p class="nutrition-plan__eyebrow">Personalized estimate</p>
          <h3>Let's choose a different goal</h3>
          <p>Your entered height and weight produce a BMI below 18.5. This tool won't suggest weight loss for that profile. Consider discussing goals with a qualified health professional.</p>
        </div>`;
      return;
    }

    const targetCalories = Math.round(maintenanceCalories + (profile.goal === "lose" ? -300 : profile.goal === "gain" ? 250 : 0));
    const preferenceTypes = {
      plant: ["fruit", "vegetable", "dryfruit"],
      fruit: ["fruit"],
      vegetable: ["vegetable"],
      dryfruit: ["dryfruit"],
      meat: ["meat"],
      snack: ["snack"],
      fastfood: ["fastfood"],
    };
    const allowedTypes = preferenceTypes[profile.preference];
    const eligibleFoods = (Array.isArray(data) ? data : []).filter((food) =>
      !allowedTypes || allowedTypes.includes(food.type)
    );
    const scoredFoods = eligibleFoods.map((food) => ({ ...food, score: scoreRecommendation(food, profile.goal) }));
    scoredFoods.sort((first, second) => second.score - first.score);
    const initialCount = Math.min(12, scoredFoods.length);
    const goalText = goalLabels[profile.goal] || goalLabels.maintain;
    const planNote = ["protein", "fiber", "low-sugar"].includes(profile.goal)
      ? "Daily energy stays at your maintenance estimate; food ideas are ranked by your selected nutrition focus."
      : "This is a starting estimate, not a prescribed intake.";
    nutritionPlanResults.innerHTML = `
      <div class="nutrition-plan__summary">
        <div>
          <p class="nutrition-plan__eyebrow">Your direction · ${goalText}</p>
          <h3>${targetCalories.toLocaleString()} <span>estimated kcal / day</span></h3>
          <p>Estimated maintenance: ${maintenanceCalories.toLocaleString()} kcal/day. ${planNote}</p>
        </div>
        <div class="nutrition-plan__bmi"><span>Profile BMI</span><strong>${bmi.toFixed(1)}</strong></div>
      </div>
      <h3 class="nutrition-plan__picks-title">Food ideas for you</h3>
      <div class="nutrition-plan__picks" id="nutrition-plan-picks"></div>
      <div class="nutrition-plan__more-row">
        <span id="nutrition-plan-count" aria-live="polite"></span>
        <button class="nutrition-plan__more" id="nutrition-plan-more" type="button">Show more foods</button>
      </div>
      <p class="nutrition-plan__fineprint">Food ideas are ranked from the available dataset; they are not a meal plan. Portions and total intake depend on your full diet and needs.</p>`;

    nutritionPlanResults.classList.add("is-ready");
    let visibleCount = initialCount;
    let renderedCount = 0;
    const picksContainer = document.getElementById("nutrition-plan-picks");
    const moreButton = document.getElementById("nutrition-plan-more");
    const countLabel = document.getElementById("nutrition-plan-count");
    const renderVisibleFoods = () => {
      renderNutritionPicks(picksContainer, scoredFoods.slice(renderedCount, visibleCount), profile.goal);
      renderedCount = visibleCount;
      countLabel.textContent = `Showing ${visibleCount} of ${scoredFoods.length} matching foods`;
      moreButton.hidden = visibleCount >= scoredFoods.length;
    };

    renderVisibleFoods();
    moreButton.addEventListener("click", () => {
      visibleCount = Math.min(visibleCount + 12, scoredFoods.length);
      renderVisibleFoods();
    });
  } catch (error) {
    nutritionPlanResults.innerHTML = `<p class="nutrition-plan__error">${error.message || "Could not create suggestions. Please try again."}</p>`;
  }
}

function scoreRecommendation(food, goal) {
  const calories = Number(food.caloriesPer100g) || 0;
  const protein = Number(food.protein) || 0;
  const fiber = Number(food.fiber) || 0;
  if (goal === "lose") return (fiber * 3) + (protein * 2) - (calories * 0.04);
  if (goal === "gain") return (calories * 0.06) + (protein * 3) + (fiber * 0.4);
  if (goal === "protein") return (protein * 4) + (fiber * 0.35) - (calories * 0.005);
  if (goal === "fiber") return (fiber * 4) + (protein * 0.25) - (calories * 0.002);
  if (goal === "low-sugar") return -((Number(food.sugar) || 0) * 3) + (fiber * 0.8) + (protein * 0.3);
  return (protein * 2) + (fiber * 2) - (Math.abs(calories - 100) * 0.015);
}

function recommendationReason(food, goal) {
  const calories = Number(food.caloriesPer100g) || 0;
  const protein = Number(food.protein) || 0;
  const fiber = Number(food.fiber) || 0;
  const water = Number(food.water) || 0;
  const sugar = Number(food.sugar) || 0;

  if (goal === "protein") return `${protein}g protein per 100g; ranked for protein content.`;
  if (goal === "fiber") return `${fiber}g fiber per 100g; ranked for fiber content.`;
  if (goal === "low-sugar") return `${sugar}g sugar per 100g; lower-sugar foods rank higher.`;
  if (goal === "lose") {
    if (fiber >= 3) return "Higher fiber per 100g, with calories considered in the ranking.";
    if (water >= 85) return "High water content and relatively few calories per 100g.";
    return "Lower-calorie option to add variety to your food choices.";
  }
  if (goal === "gain") {
    if (protein >= 8) return "Higher-protein option, ranked for gradual energy gain.";
    if (calories >= 200) return "More energy-dense per 100g, useful when building a higher-energy meal.";
    return "Adds energy and variety; combine with other foods for a full meal.";
  }
  if (protein >= 8 && fiber >= 3) return "Provides both protein and fiber per 100g.";
  if (fiber >= 3) return "Higher fiber per 100g, among your selected food types.";
  if (protein >= 5) return "A higher-protein option among your selected food types.";
  return calories <= 100 ? "A moderate-energy choice among your selected food types." : "An energy-rich choice for a varied diet.";
}

function renderNutritionPicks(container, foods, goal) {
  if (!foods.length) return;
  container.insertAdjacentHTML("beforeend", foods.map((food, index) => `
    <button class="nutrition-pick" type="button" data-food-id="${food.id}" style="--pick-accent:${food.color || "var(--citrus)"};--pick-index:${index}">
      <span class="nutrition-pick__top"><span>${food.emoji || "🍽️"}</span><span>${TYPE_LABELS[food.type] || capitalize(food.type)}</span></span>
      <strong>${food.name}</strong>
      <span class="nutrition-pick__cal">${food.caloriesPer100g} kcal / 100g</span>
      <span class="nutrition-pick__reason">${recommendationReason(food, goal)}</span>
    </button>`).join(""));

  [...container.querySelectorAll("[data-food-id]")].slice(-foods.length).forEach((button) => {
    button.addEventListener("click", () => openDrawer(button.dataset.foodId));
  });
}

function initContactReveal() {
  const revealItems = document.querySelectorAll("[data-reveal]");

  if (!("IntersectionObserver" in window)) {
    revealItems.forEach((item) => item.classList.add("is-visible"));
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.18 });

  revealItems.forEach((item) => observer.observe(item));
}

function initAuthFlow() {
  authTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const mode = tab.dataset.mode;
      authTabs.forEach((btn) => btn.classList.toggle("is-active", btn === tab));
      authPanels.forEach((panel) => {
        panel.classList.toggle("is-visible", panel.dataset.panel === mode);
      });
    });
  });

  document.querySelectorAll(".social-button").forEach((button) => {
    button.addEventListener("click", () => {
      const provider = button.dataset.provider || button.textContent.trim();
      showAuthMessage(`${provider} sign-in is ready for OAuth integration.`, "info");
      button.classList.add("is-selected");
      setTimeout(() => button.classList.remove("is-selected"), 600);
    });
  });

  if (loginForm) {
    loginForm.addEventListener("submit", handleLoginSubmit);
  }

  if (signupForm) {
    signupForm.addEventListener("submit", handleSignupSubmit);
  }

}

function initHeaderAuth() {
  const logoutButton = document.getElementById("logout-button");
  if (logoutButton) {
    logoutButton.addEventListener("click", () => {
      clearCurrentUser();
      updateHeaderUser();
      window.location.href = "login.html";
    });
  }
  updateHeaderUser();
}

const AUTH_USERS_KEY = "calorieCountUsers";
const CURRENT_USER_KEY = "calorieCountCurrentUser";
const THEME_STORAGE_KEY = "calorieCountTheme";
const MOTION_STORAGE_KEY = "calorieCountMotion";

initTheme();
initHeaderAuth();

function initTheme() {
  const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
  const theme = savedTheme === "dark" ? "dark" : "light";
  const savedMotion = localStorage.getItem(MOTION_STORAGE_KEY);
  const motion = savedMotion === "reduced" ? "reduced" : "full";

  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.motion = motion;

  document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
    const nextTheme = theme === "dark" ? "light" : "dark";
    button.setAttribute("aria-label", `Switch to ${nextTheme} theme`);
    button.setAttribute("aria-pressed", String(theme === "dark"));
    button.querySelector(".theme-toggle__icon").textContent = theme === "dark" ? "☀" : "☾";
    button.querySelector(".theme-toggle__label").textContent = theme === "dark" ? "Light" : "Dark";

    button.addEventListener("click", () => {
      const updatedTheme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
      localStorage.setItem(THEME_STORAGE_KEY, updatedTheme);
      document.documentElement.dataset.theme = updatedTheme;
      document.querySelectorAll("[data-theme-toggle]").forEach((toggle) => {
        const toggleNextTheme = updatedTheme === "dark" ? "light" : "dark";
        toggle.setAttribute("aria-label", `Switch to ${toggleNextTheme} theme`);
        toggle.setAttribute("aria-pressed", String(updatedTheme === "dark"));
        toggle.querySelector(".theme-toggle__icon").textContent = updatedTheme === "dark" ? "☀" : "☾";
        toggle.querySelector(".theme-toggle__label").textContent = updatedTheme === "dark" ? "Light" : "Dark";
      });
    });
  });
}

function updateMotionToggle() {
  const motionIsReduced = document.documentElement.dataset.motion === "reduced";
  document.querySelectorAll("[data-motion-toggle]").forEach((button) => {
    const label = button.querySelector(".motion-toggle__label");
    if (label) label.textContent = motionIsReduced ? "Animation: Off" : "Animation: On";
    button.setAttribute("aria-pressed", String(motionIsReduced));
  });
}

function setMotionMode(mode) {
  const normalizedMode = mode === "reduced" ? "reduced" : "full";
  document.documentElement.dataset.motion = normalizedMode;
  localStorage.setItem(MOTION_STORAGE_KEY, normalizedMode);
  updateMotionToggle();
}

function getStoredUsers() {
  try {
    return JSON.parse(localStorage.getItem(AUTH_USERS_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveStoredUsers(users) {
  localStorage.setItem(AUTH_USERS_KEY, JSON.stringify(users));
}

function setCurrentUser(user) {
  sessionStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user));
}

function getCurrentUser() {
  try {
    return JSON.parse(sessionStorage.getItem(CURRENT_USER_KEY) || "null");
  } catch {
    return null;
  }
}

function clearCurrentUser() {
  sessionStorage.removeItem(CURRENT_USER_KEY);
}

function updateHeaderUser() {
  const userChip = document.getElementById("auth-user-chip");
  const logoutButton = document.getElementById("logout-button");
  const loginLink = document.querySelector('.top-link[href="login.html"]');
  const signupLink = document.querySelector('.top-link--secondary[href="signup.html"]');
  const currentUser = getCurrentUser();

  if (!userChip || !logoutButton || !loginLink || !signupLink) return;

  if (currentUser) {
    userChip.textContent = `Hi, ${currentUser.firstName}`;
    userChip.classList.remove("hidden");
    logoutButton.classList.remove("hidden");
    loginLink.classList.add("hidden");
    signupLink.classList.add("hidden");
  } else {
    userChip.classList.add("hidden");
    logoutButton.classList.add("hidden");
    loginLink.classList.remove("hidden");
    signupLink.classList.remove("hidden");
  }
}

function showAuthMessage(message, type = "success") {
  if (!authMessage) return;
  authMessage.textContent = message;
  authMessage.className = "auth-message";
  authMessage.classList.add(type === "error" ? "is-error" : type === "info" ? "is-info" : "is-success");
}

async function parseJsonResponse(response, fallbackMessage = "The server returned an invalid response.") {
  const contentType = response.headers.get("content-type") || "";

  if (!contentType.includes("application/json")) {
    const rawText = await response.text();

    if (rawText.includes("<!DOCTYPE") || rawText.includes("<html")) {
      throw new Error("The server returned an HTML page instead of JSON. Please check the API route and try again.");
    }

    throw new Error(rawText || fallbackMessage);
  }

  try {
    return await response.json();
  } catch {
    throw new Error("The server responded with invalid JSON.");
  }
}

async function handleLoginSubmit(e) {
  e.preventDefault();

  const email = loginForm.querySelector('input[name="email"]').value.trim();
  const password = loginForm.querySelector('input[name="password"]').value.trim();

  if (!validateEmail(email)) {
    showAuthMessage("Please enter a valid email address.", "error");
    return;
  }

  if (password.length < 8) {
    showAuthMessage("Password must be at least 8 characters long.", "error");
    return;
  }

  try {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.toLowerCase(), password }),
    });
    const data = await parseJsonResponse(response, "Login failed.");

    if (!response.ok) {
      throw new Error(data.error || "Login failed.");
    }

    setCurrentUser({ firstName: data.user.firstName, email: data.user.email });
    showAuthMessage(`Welcome back, ${data.user.firstName}! Redirecting to your dashboard...`, "success");
    loginForm.reset();

    setTimeout(() => {
      window.location.href = "index.html";
    }, 900);
  } catch (error) {
    showAuthMessage(error.message || "Unable to sign in right now.", "error");
  }
}

async function handleSignupSubmit(e) {
  e.preventDefault();

  const firstName = signupForm.querySelector('input[name="firstName"]').value.trim();
  const lastName = signupForm.querySelector('input[name="lastName"]').value.trim();
  const email = signupForm.querySelector('input[name="email"]').value.trim();
  const phone = signupForm.querySelector('input[name="phone"]').value.trim();
  const password = signupForm.querySelector('input[name="password"]').value.trim();
  const confirmPassword = signupForm.querySelector('input[name="confirmPassword"]').value.trim();
  const terms = signupForm.querySelector('input[name="terms"]');
  const goal = signupForm.querySelector('select[name="goal"]').value;

  if (!firstName || !lastName) {
    showAuthMessage("Please fill in both your first and last name.", "error");
    return;
  }

  if (!validateEmail(email)) {
    showAuthMessage("Please enter a valid email address.", "error");
    return;
  }

  if (!validatePhone(phone)) {
    showAuthMessage("Please enter a valid phone number with 10 to 15 digits.", "error");
    return;
  }

  if (!isStrongPassword(password)) {
    showAuthMessage("Use a strong password with at least 8 characters, including uppercase, lowercase, a number, and a symbol.", "error");
    return;
  }

  if (password !== confirmPassword) {
    showAuthMessage("Passwords do not match. Please try again.", "error");
    return;
  }

  if (!terms || !terms.checked) {
    showAuthMessage("Please accept the terms and privacy policy to continue.", "error");
    return;
  }

  try {
    const response = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        firstName,
        lastName,
        email: email.toLowerCase(),
        phone,
        password,
        goal,
      }),
    });
    const data = await parseJsonResponse(response, "Account creation failed.");

    if (!response.ok) {
      throw new Error(data.error || "Account creation failed.");
    }

    setCurrentUser({ firstName: data.user.firstName, email: data.user.email });
    showAuthMessage(`Welcome ${data.user.firstName}! Your account has been created successfully. Redirecting...`, "success");
    signupForm.reset();

    setTimeout(() => {
      window.location.href = "index.html";
    }, 900);
  } catch (error) {
    showAuthMessage(error.message || "Unable to create account right now.", "error");
  }
}

function validateEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function validatePhone(value) {
  return /^[+]?[(]?[0-9]{1,4}[)]?[-\s0-9]{8,15}$/.test(value);
}

function isStrongPassword(value) {
  return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/.test(value);
}

async function loadTypes() {
  try {
    const res = await fetch("/api/types");
    const data = await parseJsonResponse(res, "Could not load food types.");
    data.types.forEach((type) => {
      const btn = document.createElement("button");
      btn.className = "filter-tab";
      btn.dataset.type = type;
      btn.textContent = TYPE_LABELS[type] || capitalize(type);
      btn.addEventListener("click", () => selectType(type, btn));
      filtersNav.appendChild(btn);
    });

    const allBtn = filtersNav.querySelector('[data-type="all"]');
    if (allBtn) {
      allBtn.addEventListener("click", (e) => selectType("all", e.target));
    }
  } catch (err) {
    console.error("Could not load food types:", err);
  }
}

function selectType(type, btnEl) {
  activeType = type;
  [...filtersNav.children].forEach((b) => b.classList.remove("is-active"));
  btnEl.classList.add("is-active");
  loadFoods();
}

async function loadFoods() {
  try {
    let url;
    if (currentQuery) {
      url = `/api/foods/search?q=${encodeURIComponent(currentQuery)}`;
      if (activeType !== "all") url += `&type=${encodeURIComponent(activeType)}`;
    } else if (activeType !== "all") {
      url = `/api/foods?type=${encodeURIComponent(activeType)}`;
    } else {
      url = "/api/foods";
    }

    const res = await fetch(url);
    const data = await parseJsonResponse(res, "Could not load food data.");
    renderGrid(data.foods || []);
  } catch (err) {
    console.error("Could not load foods:", err);
    if (resultsMeta) {
      resultsMeta.textContent = "Something went wrong loading food data.";
    }
  }
}

function renderGrid(list) {
  grid.innerHTML = "";
  if (emptyState) emptyState.hidden = list.length > 0;
  if (resultsMeta) {
    resultsMeta.textContent = `${list.length} item${list.length === 1 ? "" : "s"}${
      currentQuery ? ` matching “${currentQuery}”` : ""
    }`;
  }

  list.forEach((food) => {
    const card = document.createElement("button");
    card.className = "fruit-card";
    card.style.setProperty("--card-accent", food.color || "#E2790C");
    card.innerHTML = `
      <div class="fruit-card__top">
        <span class="fruit-card__emoji">${food.emoji || "🍽️"}</span>
        <span class="fruit-card__category">${TYPE_LABELS[food.type] || capitalize(food.type)}</span>
      </div>
      <span class="fruit-card__name">${food.name}</span>
      <div class="fruit-card__cal">
        <span class="fruit-card__cal-num">${food.caloriesPer100g}</span>
        <span class="fruit-card__cal-label">kcal / 100g</span>
      </div>
    `;
    card.addEventListener("click", () => openDrawer(food.id));
    grid.appendChild(card);
  });
}

async function openDrawer(id) {
  try {
    const res = await fetch(`/api/foods/${encodeURIComponent(id)}`);
    if (!res.ok) throw new Error("not found");
    const f = await parseJsonResponse(res, "Could not load food details.");
    drawerContent.innerHTML = buildDrawerHTML(f);
    const motionToggle = document.getElementById("drawer-motion-toggle");
    if (motionToggle) {
      motionToggle.addEventListener("click", () => {
        const nextMode = document.documentElement.dataset.motion === "reduced" ? "full" : "reduced";
        setMotionMode(nextMode);
        const label = motionToggle.querySelector(".motion-toggle__label");
        if (label) label.textContent = nextMode === "reduced" ? "Animation: Off" : "Animation: On";
      });
    }
    drawer.classList.add("is-open");
    drawerBackdrop.classList.add("is-open");
    drawer.setAttribute("aria-hidden", "false");
  } catch (err) {
    console.error("Could not load food detail:", err);
  }
}

function closeDrawer() {
  if (!drawer || !drawerBackdrop) return;
  drawer.classList.remove("is-open");
  drawerBackdrop.classList.remove("is-open");
  drawer.setAttribute("aria-hidden", "true");
}

function buildDrawerHTML(f) {
  const macroRow = (label, value, unit, maxKey, barClass = "") => `
    <div class="macro-row">
      <span>${label}</span>
      <span class="bar-track"><span class="bar-fill ${barClass}" style="width:${pct(
    value,
    MACRO_MAX[maxKey]
  )}%"></span></span>
      <span>${value}${unit}</span>
    </div>
  `;

  const motionButtonLabel = document.documentElement.dataset.motion === "reduced" ? "Animation: Off" : "Animation: On";

  return `
    <div class="drawer__topbar">
      <div class="drawer__badge">${f.emoji || "🍽️"}</div>
      <button id="drawer-motion-toggle" class="drawer__motion-toggle" type="button" data-motion-toggle aria-pressed="${document.documentElement.dataset.motion === "reduced"}">
        <span class="motion-toggle__label">${motionButtonLabel}</span>
      </button>
    </div>

    <div class="drawer__headline">
      <span class="drawer__pill">${TYPE_LABELS[f.type] || capitalize(f.type)}</span>
      <h2 class="drawer__name">${f.name}</h2>
    </div>
    <p class="drawer__desc">${f.description || ""}</p>

    <div class="drawer__stats-grid">
      <div class="drawer__stat-card">
        <span class="drawer__stat-label">Calories</span>
        <strong>${f.caloriesPer100g}</strong>
        <small>kcal / 100g</small>
      </div>
      <div class="drawer__stat-card">
        <span class="drawer__stat-label">Serving</span>
        <strong>${f.caloriesPerServing}</strong>
        <small>${f.servingSize || "1 serving"}</small>
      </div>
    </div>

    <p class="drawer__section-title">Per 100g</p>
    ${macroRow("Protein", f.protein, "g", "protein")}
    ${macroRow("Carbs", f.carbs, "g", "carbs")}
    ${macroRow("Sugar", f.sugar, "g", "sugar", "is-sugar")}
    ${macroRow("Fiber", f.fiber, "g", "fiber")}
    ${macroRow("Fat", f.fat, "g", "fat", "is-fat")}

    <p class="drawer__section-title">Other</p>
    <div class="stat-line"><span>Calories (100g)</span><span>${f.caloriesPer100g} kcal</span></div>
    <div class="stat-line"><span>${f.servingSize || "1 serving"}</span><span>${f.caloriesPerServing} kcal</span></div>
    <div class="stat-line"><span>Vitamin C</span><span>${f.vitaminC} mg</span></div>
    <div class="stat-line"><span>Potassium</span><span>${f.potassium} mg</span></div>
    <div class="stat-line"><span>Water content</span><span>${f.water}%</span></div>

    ${
      f.benefits && f.benefits.length
        ? `<p class="drawer__section-title">Worth knowing</p>
           <ul class="benefits">${f.benefits.map((b) => `<li>${b}</li>`).join("")}</ul>`
        : ""
    }
  `;
}

async function handleContactSubmit(e) {
  e.preventDefault();
  const name = document.getElementById("contact-name").value.trim();
  const email = document.getElementById("contact-email").value.trim();
  const message = document.getElementById("contact-message").value.trim();

  contactStatus.textContent = "";
  contactStatus.className = "contact__status";

  if (!name || !email || !message) {
    contactStatus.textContent = "Please fill in every field.";
    contactStatus.classList.add("is-error");
    return;
  }

  try {
    const res = await fetch("/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, message }),
    });
    const data = await parseJsonResponse(res, "Something went wrong. Please try again.");

    if (!res.ok) {
      contactStatus.textContent = data.error || "Something went wrong. Please try again.";
      contactStatus.classList.add("is-error");
      return;
    }

    contactStatus.textContent = data.message || "Thanks — your message has been received.";
    contactStatus.classList.add("is-success");
    contactForm.reset();
  } catch (err) {
    console.error("Contact form submission failed:", err);
    contactStatus.textContent = "Could not reach the server. Please try again.";
    contactStatus.classList.add("is-error");
  }
}

function pct(value, max) {
  return Math.max(4, Math.min(100, Math.round((value / max) * 100)));
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
