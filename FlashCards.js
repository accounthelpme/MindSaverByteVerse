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
    DOM.aiStatus.textContent = "";
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
  // First clean and prepare the text
  const cleanedText = cleanContent(text);
  
  // Extract meaningful segments
  const segments = extractMeaningfulSegments(cleanedText);
  
  // Generate context-aware flashcards
  const cards = [];
  const usedSegments = new Set();
  
  const templates = [
    { 
      pattern: /(enable|allow|let).+?(to)/i, 
      template: "How does [segment] work?" 
    },
    { 
      pattern: /(because|since|as).+/i, 
      template: "Why is it that [segment]?" 
    },
    { 
      pattern: /(by|through|using).+/i, 
      template: "What is the process of [segment]?" 
    },
    { 
      pattern: /(although|while|whereas).+/i, 
      template: "What is the difference between [segment]?" 
    },
    { 
      pattern: /(important|essential|crucial).+/i, 
      template: "Why is [segment] important?" 
    },
    { 
      default: true,
      template: "Explain: [segment]" 
    }
  ];

  for (const segment of segments) {
    if (cards.length >= CONFIG.MAX_FLASHCARDS) break;
    if (usedSegments.has(segment)) continue;
    
    const words = segment.split(/\s+/);
    if (words.length < 5 || words.length > 25) continue;
    
    // Find the most suitable template
    const matchedTemplate = templates.find(t => t.pattern?.test(segment)) || 
                          templates.find(t => t.default);
    
    // Create context-aware question
    const processedSegment = processSegmentForQuestion(segment);
    const question = matchedTemplate.template.replace('[segment]', processedSegment);
    
    // Ensure grammatical correctness
    const finalQuestion = fixQuestionGrammar(question);
    
    cards.push({
      q: finalQuestion,
      a: segment,
      mastered: false,
      isFallback: true
    });
    
    usedSegments.add(segment);
  }

  return cards;
}

function cleanContent(text) {
  return text
    .replace(/\s+/g, ' ')
    .replace(/\[[^\]]+\]/g, '') // Remove brackets
    .replace(/\([^)]+\)/g, '') // Remove parentheses
    .replace(/\b(etc|e\.g|i\.e|viz)\.?\b/gi, '')
    .trim();
}

function extractMeaningfulSegments(text) {
  // First try to split at sentence boundaries
  const sentenceSegments = text.split(/(?<=[.!?])\s+/);
  
  // Then split at logical connectors if sentences are too long
  const allSegments = [];
  for (const segment of sentenceSegments) {
    if (segment.length <= 120) {
      allSegments.push(segment);
    } else {
      const subSegments = segment.split(/(?:,|;| - |–|—|:)\s+/);
      allSegments.push(...subSegments.filter(s => s.length > 15));
    }
  }
  
  return allSegments
    .map(s => s.trim())
    .filter(s => s.length > 20 && s.length < 150)
    .filter(s => !s.match(/^(and|or|but|however|therefore|because)/i));
}

function processSegmentForQuestion(segment) {
  // Remove question words if present
  let processed = segment.replace(/^(how|what|why|when|where|who)\b/i, '');
  
  // Fix capitalization
  processed = processed.charAt(0).toLowerCase() + processed.slice(1);
  
  // Remove trailing punctuation
  processed = processed.replace(/[.,;:!?]+$/, '');
  
  // Replace pronouns with more specific terms when possible
  processed = processed.replace(/\b(it|they|this|that|these)\b/gi, match => {
    // Find the nearest preceding noun
    const prevNoun = segment.split(/\s+/)
      .reverse()
      .find(word => word.match(/^[A-Z][a-z]+$/) || word.match(/^[a-z]+$/));
    return prevNoun || match;
  });
  
  return processed;
}

function fixQuestionGrammar(question) {
  // Ensure question ends with question mark
  question = question.replace(/\?*$/, '') + '?';
  
  // Fix verb agreement
  question = question.replace(/\b(is|are|was|were|do|does)\b/gi, match => {
    const prevWord = question.split(/\s+/).slice(-2)[0];
    if (!prevWord) return match;
    
    // Simple plural detection
    const isPlural = prevWord.endsWith('s') && !prevWord.endsWith('ss');
    
    if (match.toLowerCase() === 'is' && isPlural) return 'are';
    if (match.toLowerCase() === 'are' && !isPlural) return 'is';
    if (match.toLowerCase() === 'was' && isPlural) return 'were';
    if (match.toLowerCase() === 'were' && !isPlural) return 'was';
    if (match.toLowerCase() === 'does' && isPlural) return 'do';
    if (match.toLowerCase() === 'do' && !isPlural) return 'does';
    return match;
  });
  
  // Capitalize first letter
  return question.charAt(0).toUpperCase() + question.slice(1);
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