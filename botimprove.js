// thats a test file dont use 
  const API_URL = "https://api.openai.com/v1/chat/completions";

  // ⚠️ Client-side keys are insecure. Prefer a backend in production.
  const API_KEY = typeof window.API_KEY === "string" ? window.API_KEY : "x.x.x.x.x.x";

  const DEFAULT_MODEL = "gpt-3.5-turbo";
  const DEFAULT_SYSTEM_PROMPT =
    "You are a helpful assistant. Be concise, correct, and practical.";

  // Token-ish trimming (approx by chars; real tokens differ)
  const MAX_CONTEXT_MESSAGES = 30; // keep last N messages per chat
  const MAX_MESSAGE_CHARS = 12000; // trim any single message over this
  const RETRY_LIMIT = 3;

  // =========================
  // DOM HOOKS (optional IDs)
  // =========================
  const el = {
    chat: document.getElementById("chat") || document.querySelector(".chat"),
    input: document.getElementById("messageInput") || document.querySelector("textarea, input[type='text']"),
    send: document.getElementById("sendBtn") || document.querySelector("[data-send], button[type='submit'], .send"),
    stop: document.getElementById("stopBtn") || document.querySelector("[data-stop], .stop"),
    newChat: document.getElementById("newChatBtn") || document.querySelector("[data-new-chat], .new-chat"),
    chatList: document.getElementById("chatList") || document.querySelector("[data-chat-list], .chat-list"),
    modelSelect: document.getElementById("modelSelect") || document.querySelector("[data-model-select]"),
    systemPrompt: document.getElementById("systemPrompt") || document.querySelector("[data-system-prompt]"),
    status: document.getElementById("status") || document.querySelector("[data-status], .status"),
  };

  // =========================
  // STATE + STORAGE
  // =========================
  const STORAGE_KEY = "prototypebot_state_v2";

  const state = loadState() || {
    activeChatId: null,
    chats: [],
    settings: {
      model: DEFAULT_MODEL,
      systemPrompt: DEFAULT_SYSTEM_PROMPT,
      renderMarkdown: true,
    },
  };

  let inFlight = null; // AbortController
  let isSending = false;

  // =========================
  // INIT
  // =========================
  ensureAtLeastOneChat();
  hydrateUIFromState();
  renderChatList();
  renderActiveChat();

  bindEvents();

  // =========================
  // EVENT BINDINGS
  // =========================
  function bindEvents() {
    // Send on click
    if (el.send) {
      el.send.addEventListener("click", (e) => {
        e.preventDefault?.();
        sendMessage();
      });
    }

    // Send on Enter (if textarea, allow Shift+Enter newline)
    if (el.input) {
      el.input.addEventListener("keydown", (e) => {
        const isTextarea = el.input.tagName === "TEXTAREA";
        if (e.key === "Enter" && (!isTextarea || !e.shiftKey)) {
          e.preventDefault();
          sendMessage();
        }
      });

      // Autosize textarea (optional)
      if (el.input.tagName === "TEXTAREA") {
        el.input.addEventListener("input", () => {
          el.input.style.height = "auto";
          el.input.style.height = Math.min(el.input.scrollHeight, 220) + "px";
        });
      }
    }

    // New chat
    if (el.newChat) {
      el.newChat.addEventListener("click", (e) => {
        e.preventDefault?.();
        createChatAndActivate();
      });
    }

    // Stop/abort
    if (el.stop) {
      el.stop.addEventListener("click", (e) => {
        e.preventDefault?.();
        abortRequest();
      });
    }

    // Model select
    if (el.modelSelect) {
      el.modelSelect.value = state.settings.model;
      el.modelSelect.addEventListener("change", () => {
        state.settings.model = el.modelSelect.value || DEFAULT_MODEL;
        saveState();
      });
    }

    // System prompt input (optional)
    if (el.systemPrompt) {
      el.systemPrompt.value = state.settings.systemPrompt || DEFAULT_SYSTEM_PROMPT;
      el.systemPrompt.addEventListener("change", () => {
        state.settings.systemPrompt = el.systemPrompt.value || DEFAULT_SYSTEM_PROMPT;
        saveState();
      });
    }
  }

  // =========================
  // CHAT OPS
  // =========================
  function ensureAtLeastOneChat() {
    if (!Array.isArray(state.chats)) state.chats = [];
    if (state.chats.length === 0) {
      const chat = newChatObject("New Chat");
      state.chats.push(chat);
      state.activeChatId = chat.id;
      saveState();
    }
    if (!state.activeChatId) {
      state.activeChatId = state.chats[0].id;
      saveState();
    }
  }

  function createChatAndActivate(title = "New Chat") {
    const chat = newChatObject(title);
    state.chats.unshift(chat);
    state.activeChatId = chat.id;
    saveState();
    renderChatList();
    renderActiveChat();
  }

  function newChatObject(title) {
    return {
      id: cryptoRandomId(),
      title: title,
      createdAt: Date.now(),
      messages: [
        // system prompt is injected at request time; keep UI clean
      ],
    };
  }

  function getActiveChat() {
    return state.chats.find((c) => c.id === state.activeChatId) || state.chats[0];
  }

  function setActiveChat(id) {
    state.activeChatId = id;
    saveState();
    renderChatList();
    renderActiveChat();
  }

  function renameChatIfNeeded(chat) {
    // First user message becomes title (trimmed)
    if (chat.title === "New Chat") {
      const firstUser = chat.messages.find((m) => m.role === "user");
      if (firstUser && typeof firstUser.content === "string") {
        chat.title = firstUser.content.trim().slice(0, 32) || "New Chat";
      }
    }
  }

  // =========================
  // SENDING
  // =========================
  async function sendMessage() {
    if (isSending) return;
    if (!el.input) return;

    const text = (el.input.value || "").trim();
    if (!text) return;

    const chat = getActiveChat();
    const userMsg = { role: "user", content: clampString(text, MAX_MESSAGE_CHARS), ts: Date.now() };

    // UI: append user message
    chat.messages.push(userMsg);
    renameChatIfNeeded(chat);

    el.input.value = "";
    if (el.input.tagName === "TEXTAREA") {
      el.input.style.height = "auto";
    }

    saveState();
    renderChatList();
    renderActiveChat();

    // Request
    isSending = true;
    setBusy(true);
    const typingId = showTypingIndicator();

    try {
      const responseText = await requestAssistantResponse(chat);

      removeTypingIndicator(typingId);

      const assistantMsg = { role: "assistant", content: responseText, ts: Date.now() };
      chat.messages.push(assistantMsg);

      saveState();
      renderActiveChat();
      renderChatList();
    } catch (err) {
      removeTypingIndicator(typingId);

      const msg = formatError(err);
      // Show error as assistant bubble (so user sees it)
      chat.messages.push({ role: "assistant", content: msg, ts: Date.now(), isError: true });

      saveState();
      renderActiveChat();
    } finally {
      isSending = false;
      setBusy(false);
    }
  }

  async function requestAssistantResponse(chat) {
    abortRequest(); // cancel any previous
    inFlight = new AbortController();

    const model = (el.modelSelect?.value || state.settings.model || DEFAULT_MODEL).trim();
    const systemPrompt = (el.systemPrompt?.value || state.settings.systemPrompt || DEFAULT_SYSTEM_PROMPT).trim();

    // Build message payload: system + trimmed conversation
    const trimmedConversation = trimConversation(chat.messages, MAX_CONTEXT_MESSAGES);
    const payloadMessages = [
      { role: "system", content: clampString(systemPrompt, MAX_MESSAGE_CHARS) },
      ...trimmedConversation.map(({ role, content }) => ({
        role,
        content: clampString(String(content ?? ""), MAX_MESSAGE_CHARS),
      })),
    ];

    const body = {
      model,
      messages: payloadMessages,
      // Feel free to add: temperature, top_p, presence_penalty, frequency_penalty, etc.
      temperature: 0.7,
      max_tokens: 800,
    };

    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
    };

    // Retry with exponential backoff for 429 / transient network errors
    let lastErr = null;
    for (let attempt = 0; attempt <= RETRY_LIMIT; attempt++) {
      try {
        const res = await fetch(API_URL, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
          signal: inFlight.signal,
        });

        if (res.status === 401) {
          throw new Error("Unauthorized (401). Check your API key.");
        }

        if (res.status === 429) {
          if (attempt === RETRY_LIMIT) {
            throw new Error("Rate limited (429). Try again later.");
          }
          await sleep(backoffMs(attempt));
          continue;
        }

        if (!res.ok) {
          const text = await safeReadText(res);
          throw new Error(`Request failed (${res.status}). ${text || ""}`.trim());
        }

        const data = await res.json();
        const content = data?.choices?.[0]?.message?.content;

        if (typeof content !== "string" || !content.trim()) {
          throw new Error("Empty response from API.");
        }

        return content.trim();
      } catch (err) {
        if (err?.name === "AbortError") {
          throw new Error("Request aborted.");
        }
        lastErr = err;
        // Retry on transient fetch errors
        if (attempt < RETRY_LIMIT) {
          await sleep(backoffMs(attempt));
          continue;
        }
      }
    }

    throw lastErr || new Error("Unknown error.");
  }

  function abortRequest() {
    if (inFlight) {
      try {
        inFlight.abort();
      } catch (_) {}
    }
    inFlight = null;
    setBusy(false);
  }

  // =========================
  // RENDERING
  // =========================
  function renderChatList() {
    if (!el.chatList) return;

    el.chatList.innerHTML = "";
    state.chats.forEach((chat) => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "chat-list-item" + (chat.id === state.activeChatId ? " active" : "");
      item.textContent = chat.title || "Chat";
      item.addEventListener("click", () => setActiveChat(chat.id));
      el.chatList.appendChild(item);
    });
  }

  function renderActiveChat() {
    if (!el.chat) return;

    const chat = getActiveChat();
    el.chat.innerHTML = "";

    // Render each message
    chat.messages.forEach((m) => {
      el.chat.appendChild(renderMessageBubble(m));
    });

    // Enhance code blocks (copy + highlight)
    enhanceCodeBlocks(el.chat);

    scrollToBottom();
  }

  function renderMessageBubble(message) {
    const wrap = document.createElement("div");
    wrap.className = "bubble-wrap " + (message.role === "user" ? "from-user" : "from-assistant");

    const bubble = document.createElement("div");
    bubble.className = "bubble" + (message.isError ? " error" : "");

    const content = String(message.content ?? "");
    if (message.role === "assistant" && state.settings.renderMarkdown) {
      bubble.innerHTML = renderMarkdown(content);
    } else {
      bubble.textContent = content;
    }

    wrap.appendChild(bubble);
    return wrap;
  }

  function showTypingIndicator() {
    if (!el.chat) return null;
    const id = "typing_" + cryptoRandomId();
    const wrap = document.createElement("div");
    wrap.className = "bubble-wrap from-assistant";
    wrap.dataset.typingId = id;

    const bubble = document.createElement("div");
    bubble.className = "bubble typing";
    bubble.textContent = "Typing…";

    wrap.appendChild(bubble);
    el.chat.appendChild(wrap);
    scrollToBottom();
    return id;
  }

  function removeTypingIndicator(id) {
    if (!id || !el.chat) return;
    const node = el.chat.querySelector(`[data-typing-id="${id}"]`);
    if (node) node.remove();
  }

  function setBusy(busy) {
    if (el.send) el.send.disabled = busy;
    if (el.input) el.input.disabled = busy;
    if (el.stop) el.stop.disabled = !busy;
    setStatus(busy ? "Working…" : "");
  }

  function setStatus(text) {
    if (!el.status) return;
    el.status.textContent = text || "";
  }

  function scrollToBottom() {
    if (!el.chat) return;
    el.chat.scrollTo({ top: el.chat.scrollHeight, behavior: "smooth" });
  }

  // =========================
  // MARKDOWN + CODE ENHANCE
  // =========================
  function renderMarkdown(text) {
    // If marked is available, use it; otherwise fallback to basic escaping.
    if (window.marked && typeof window.marked.parse === "function") {
      return window.marked.parse(text);
    }
    return escapeHtml(text).replace(/\n/g, "<br/>");
  }

  function enhanceCodeBlocks(root) {
    if (!root) return;

    // Optional highlighting
    // highlight.js
    if (window.hljs && typeof window.hljs.highlightElement === "function") {
      root.querySelectorAll("pre code").forEach((block) => window.hljs.highlightElement(block));
    }
    // Prism
    if (window.Prism && typeof window.Prism.highlightAllUnder === "function") {
      window.Prism.highlightAllUnder(root);
    }

    // Copy buttons
    root.querySelectorAll("pre").forEach((pre) => {
      if (pre.dataset.hasCopy === "1") return;
      pre.dataset.hasCopy = "1";

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "copy-code-btn";
      btn.textContent = "Copy";

      btn.addEventListener("click", async () => {
        const code = pre.querySelector("code")?.innerText ?? pre.innerText ?? "";
        try {
          await navigator.clipboard.writeText(code);
          btn.textContent = "Copied";
          setTimeout(() => (btn.textContent = "Copy"), 1200);
        } catch (_) {
          btn.textContent = "Failed";
          setTimeout(() => (btn.textContent = "Copy"), 1200);
        }
      });

      // Positioning: assumes your CSS can place it; otherwise it will sit above code.
      pre.insertBefore(btn, pre.firstChild);
    });
  }

  // =========================
  // HELPERS
  // =========================
  function trimConversation(messages, maxCount) {
    // Keep only user/assistant messages; remove any nulls
    const cleaned = (messages || []).filter(
      (m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string"
    );

    // Keep last maxCount messages
    const slice = cleaned.slice(Math.max(0, cleaned.length - maxCount));

    return slice;
  }

  function clampString(str, max) {
    if (typeof str !== "string") str = String(str ?? "");
    if (str.length <= max) return str;
    return str.slice(0, max) + "\n…(trimmed)";
  }

  function backoffMs(attempt) {
    // 700, 1400, 2800, ...
    const base = 700;
    const jitter = Math.floor(Math.random() * 250);
    return base * Math.pow(2, attempt) + jitter;
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  async function safeReadText(res) {
    try {
      return await res.text();
    } catch (_) {
      return "";
    }
  }

  function formatError(err) {
    const s = (err && err.message) ? err.message : String(err ?? "Unknown error");
    // Make it user-friendly
    if (/Unauthorized/i.test(s) || /401/.test(s)) {
      return "Error: Unauthorized. Check your API key in bot.js (or window.API_KEY).";
    }
    if (/Rate limited/i.test(s) || /429/.test(s)) {
      return "Error: Rate limited. Please wait a moment and try again.";
    }
    if (/aborted/i.test(s)) {
      return "Request stopped.";
    }
    return `Error: ${s}`;
  }

  function escapeHtml(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function hydrateUIFromState() {
    if (el.modelSelect) el.modelSelect.value = state.settings.model || DEFAULT_MODEL;
    if (el.systemPrompt) el.systemPrompt.value = state.settings.systemPrompt || DEFAULT_SYSTEM_PROMPT;
    if (el.stop) el.stop.disabled = true;
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (_) {}
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }

  function cryptoRandomId() {
    // Prefer crypto; fallback to Math.random
    if (window.crypto && crypto.getRandomValues) {
      const arr = new Uint32Array(2);
      crypto.getRandomValues(arr);
      return Array.from(arr).map((n) => n.toString(16)).join("");
    }
    return Math.random().toString(16).slice(2) + Date.now().toString(16);
  }
})();
