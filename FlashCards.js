// Configuration
const CONFIG = {
  AI_MODEL: "RedPajama-3B-v1-q4f32_0",
  MAX_FLASHCARDS: 3,
  MIN_ANSWER_LENGTH: 10,
  MIN_QUESTION_LENGTH: 15,
  STORAGE_KEY: "flashcardHistory",
  TRACKING_KEY: "flashcardTracking",
  DEBOUNCE_DELAY: 300
};

// State
let chatModule = null;
let isGenerating = false;
let debounceTimer = null;

// DOM Elements
const DOM = {
  noteInput: document.getElementById("noteInput"),
  generateBtn: document.getElementById("generateBtn"),
  loading: document.getElementById("loading"),
  aiStatus: document.getElementById("ai-status"),
  flashcards: document.getElementById("flashcards"),
  trackingSection: document.getElementById("tracking-section"),
  reminderInput: null // Will be assigned dynamically
};

// Core Functions
async function initAI() {
  if (!navigator.gpu) {
    throw new Error("WebGPU not supported");
  }

  DOM.loading.style.display = "block";
  DOM.loading.textContent = "🚀 Initializing AI engine...";

  try {
    chatModule = new webllm.ChatModule();
    chatModule.setInitProgressCallback((report) => {
      const progress = Math.floor(report.progress * 100);
      DOM.loading.textContent = `Downloading AI model... ${progress}%`;
    });

    await chatModule.reload(CONFIG.AI_MODEL);
    DOM.aiStatus.textContent = "✅ AI ready!";
    DOM.aiStatus.classList.remove("ai-warning");
    console.log("AI initialized successfully");
  } catch (error) {
    throw error;
  } finally {
    DOM.loading.style.display = "none";
  }
}

async function generateFlashcards() {
  if (isGenerating) return;
  isGenerating = true;
  DOM.generateBtn.disabled = true;

  const note = DOM.noteInput.value.trim();
  if (!note) {
    alert("Please enter notes first!");
    resetGenerationState();
    return;
  }

  try {
    if (!chatModule) await initAI();
    const prompt = createPrompt(note);
    const response = await getAIResponse(prompt);
    const cards = processResponse(response);

    if (cards.length < CONFIG.MAX_FLASHCARDS) {
      throw new Error("Insufficient quality cards generated");
    }

    displayFlashcards(cards);
    saveToLocalStorage(cards);
  } catch (error) {
    console.error("Flashcard generation failed:", error);
    DOM.aiStatus.textContent = "⚠️ Failed to generate cards, using fallback mode";
    DOM.aiStatus.classList.add("ai-warning");

    const fallbackCards = generateAdaptiveFallbacks(note);
    displayFlashcards(fallbackCards);
    saveToLocalStorage(fallbackCards);
  } finally {
    resetGenerationState();
  }
}

function resetGenerationState() {
  isGenerating = false;
  DOM.generateBtn.disabled = false;
}

// Generation Logic
function createPrompt(text) {
  return `Generate ${CONFIG.MAX_FLASHCARDS} high-quality flashcards:
- Question types: Concepts (20%), Processes (30%), Relationships (30%), Applications (20%)
- Avoid generic questions like "What is..."
- Answers: concise (<15 words), precise
- Format: Q: [question]\nA: [answer]\n\n

Examples:
Q: How does light intensity affect photosynthesis rate?
A: Increases rate until saturation point

Q: Why is the Calvin cycle critical for plants?
A: Converts CO2 into organic compounds

Text: ${text}`;
}

async function getAIResponse(prompt) {
  return await chatModule.generate(prompt, {
    temperature: 0.6,
    max_tokens: 500,
    stop: ["\n\nQ:", "Q:"]
  });
}

function processResponse(response) {
  return response.split("\n\n")
    .slice(0, CONFIG.MAX_FLASHCARDS)
    .map(pair => {
      const [q, a] = pair.split("\n");
      return {
        q: cleanText(q?.replace(/^Q:\s*/, "")),
        a: cleanText(a?.replace(/^A:\s*/, "")),
        mastered: false // Initialize mastered state
      };
    })
    .filter(card =>
      card.q &&
      card.a &&
      card.q.length >= CONFIG.MIN_QUESTION_LENGTH &&
      card.a.length >= CONFIG.MIN_ANSWER_LENGTH &&
      !isLowQualityQuestion(card.q)
    );
}

function cleanText(text) {
  return text?.trim()
    .replace(/\.+$/, "")
    .replace(/\s+/g, " ") || "";
}

function isLowQualityQuestion(question) {
  const bannedPatterns = [
    /what is .* (about|used for)/i,
    /can you explain.*/i,
    /^describe/i,
    /^what is/i
  ];
  return bannedPatterns.some(pattern => pattern.test(question));
}

// Fallback System
function generateAdaptiveFallbacks(text) {
  const sentences = text.split(/[.!?]+/)
    .filter(s => s.trim().length > 20)
    .slice(0, CONFIG.MAX_FLASHCARDS);

  const templates = [
    "What is the significance of $ in this context?",
    "How does $ influence #?",
    "What are key features of $?",
    "Why is $ critical for #?",
    "How do $ and # interact?",
    "What happens if $ is altered?"
  ];

  return sentences.map((sentence, i) => {
    const concepts = extractConcepts(sentence);
    const template = templates[i % templates.length];
    return {
      q: buildQuestion(template, concepts),
      a: sentence.trim().substring(0, 100),
      mastered: false
    };
  });
}

function extractConcepts(text) {
  return text.match(/([A-Z][a-z]+(?:\s+[A-Z]?[a-z]+)*)/g) ||
         text.match(/\b\w{4,}\b/g) ||
         ["this concept"];
}

function buildQuestion(template, concepts) {
  return template
    .replace("$", concepts[0] || "concept")
    .replace("#", concepts[1] || "system");
}

// UI Functions
function displayFlashcards(cards) {
  DOM.flashcards.innerHTML = "";

  if (!cards.length) {
    DOM.flashcards.innerHTML = `
      <div class="card" role="alert">
        ⚠️ Unable to generate flashcards. Please try different notes.
      </div>`;
    return;
  }

  cards.forEach((card, i) => {
    const cardEl = document.createElement("div");
    cardEl.className = "card";
    cardEl.tabIndex = 0;
    cardEl.setAttribute("role", "button");
    cardEl.setAttribute("aria-expanded", "false");
    cardEl.innerHTML = `
      <div class="question">${i + 1}. ${card.q}</div>
      <div class="answer">${card.a}</div>
      <button class="master-btn" data-index="${i}">
        ${card.mastered ? "✅ Mastered" : "Mark as Mastered"}
      </button>
    `;

    cardEl.addEventListener("click", () => toggleAnswer(cardEl));
    cardEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggleAnswer(cardEl);
      }
    });

    const masterBtn = cardEl.querySelector(".master-btn");
    masterBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleMasteredState(cards, i);
      masterBtn.textContent = cards[i].mastered ? "✅ Mastered" : "Mark as Mastered";
      updateProgress(cards);
    });

    DOM.flashcards.appendChild(cardEl);
  });

  updateProgress(cards);
}

function toggleAnswer(cardEl) {
  const answer = cardEl.querySelector(".answer");
  const isHidden = answer.style.display === "none";
  answer.style.display = isHidden ? "block" : "none";
  cardEl.setAttribute("aria-expanded", isHidden.toString());
}

function toggleMasteredState(cards, index) {
  cards[index].mastered = !cards[index].mastered;
  saveToLocalStorage(cards);
}

function updateProgress(cards) {
  const masteredCount = cards.filter(c => c.mastered).length;
  const totalCount = cards.length;
  DOM.trackingSection.style.display = "block";
  DOM.trackingSection.innerHTML = `
    <div class="progress">Progress: ${masteredCount}/${totalCount} cards mastered</div>
    <div class="reminder-form">
      <label for="reminderInput">Remind me in: </label>
      <input type="number" id="reminderInput" min="1" placeholder="hours" value="1">
      <button id="setReminderBtn">Set Reminder</button>
    </div>
  `;

  const setReminderBtn = document.getElementById("setReminderBtn");
  DOM.reminderInput = document.getElementById("reminderInput");
  setReminderBtn.addEventListener("click", () => {
    const hours = parseInt(DOM.reminderInput.value);
    if (hours > 0) {
      scheduleReminder(hours);
      DOM.trackingSection.querySelector(".progress").textContent = 
        `Progress: ${masteredCount}/${totalCount} cards mastered (Reminder set for ${hours} hour${hours > 1 ? "s" : ""})`;
    } else {
      alert("Please enter a valid number of hours.");
    }
  });
}

// Reminder Functions
async function requestNotificationPermission() {
  if (!("Notification" in window)) {
    alert("Notifications not supported in this browser.");
    return false;
  }
  if (Notification.permission !== "granted") {
    const permission = await Notification.requestPermission();
    return permission === "granted";
  }
  return true;
}

function scheduleReminder(hours) {
  const ms = hours * 60 * 60 * 1000;
  setTimeout(async () => {
    if (await requestNotificationPermission()) {
      new Notification("MindSaver Reminder", {
        body: "Time to revise your flashcards!",
        icon: "https://via.placeholder.com/32"
      });
    }
  }, ms);

  const reminderData = {
    scheduledAt: new Date().toISOString(),
    triggerAt: new Date(Date.now() + ms).toISOString()
  };
  localStorage.setItem("reminder", JSON.stringify(reminderData));
}

// Storage
function saveToLocalStorage(cards) {
  try {
    const history = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEY)) || [];
    history.unshift({
      timestamp: new Date().toISOString(),
      cards
    });
    localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(history.slice(0, 50)));
  } catch (error) {
    console.error("Failed to save to localStorage:", error);
  }
}

// Initialization
function initialize() {
  if (!navigator.gpu) {
    DOM.aiStatus.textContent = "⚠️ WebGPU unavailable - Using fallback mode";
    DOM.generateBtn.textContent = "Generate Flashcards (Fallback Mode)";
  } else {
    setTimeout(initAI, 2000).catch(() => {
      DOM.aiStatus.textContent = "⚠️ AI initialization failed - Using fallback mode";
    });
  }

  DOM.noteInput.addEventListener("input", () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      DOM.generateBtn.disabled = !DOM.noteInput.value.trim();
    }, CONFIG.DEBOUNCE_DELAY);
  });

  const reminder = JSON.parse(localStorage.getItem("reminder"));
  if (reminder && new Date(reminder.triggerAt) > new Date()) {
    const msLeft = new Date(reminder.triggerAt) - new Date();
    setTimeout(async () => {
      if (await requestNotificationPermission()) {
        new Notification("MindSaver Reminder", {
          body: "Time to revise your flashcards!"
        });
      }
    }, msLeft);
  }
}

// Start
document.addEventListener("DOMContentLoaded", initialize);