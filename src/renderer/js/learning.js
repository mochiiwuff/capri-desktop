// Opt-in, local conversation learning. Candidates stay in memory until the user accepts them.
// This module never sends content to a model and never reads OS activity, screenshots, or files.

export const MAX_LEARNING_ENTRIES = 100;
const MAX_TEXT = 220;
const PROJECT_TTL = 180 * 24 * 60 * 60 * 1000;
const INTEREST_TTL = 365 * 24 * 60 * 60 * 1000;

// Keep this conservative: if a message mentions a likely secret or sensitive personal detail,
// don't propose it for long-term learning at all.
const SENSITIVE_PATTERNS = [
  /\b(?:password|passcode|passphrase|secret|api[- _]?key|access token|refresh token|credential|credit card|debit card|bank account|account number|social security|income|salary|email|phone|address|location)\b/iu,
  /\b(?:medical|health|allerg\w*|disabilit\w*|mental health|therapy|therapist|pregnan\w*|hiv|cancer|diabetes|asthma|medication|prescription|diagnos\w*|illness|condition|doctor|hospital)\b/iu,
  /\b(?:religio\w*|politic\w*|union member|sexual\w*|orientation|ethnic\w*|ethnicity|race|racial|transgender|lesbian|bisexual|homosexual|lgbtq|non[- ]?binary|relationship|boyfriend|girlfriend|partner|spouse|married|divorc\w*)\b/iu,
  /senha|palavra[- ]passe|chave de api|credencial|conta bancária|dados médicos|diagnóstico|alerg\w*|deficiência|terapia|gravidez|religião|política|orientação sexual|etnia|raça|relacionamento|parol\w*|секрет\w*|токен\w*|ключ api|банков\w*|медицин\w*|здоров\w*|аллерг\w*|инвалид\w*|беремен\w*|религи\w*|политическ\w*|сексуальн\w*|этническ\w*|отношени\w*/iu,
];

export function isSensitiveText(text) {
  const value = String(text || '');
  return SENSITIVE_PATTERNS.some((pattern) => pattern.test(value));
}

// Keep the live turn intact for the current chat, but don't persist a likely sensitive turn in the
// existing cross-restart transcript. Older entries and unrelated turns are left unchanged.
export function redactSensitiveTurn(history) {
  if (!Array.isArray(history)) return [];
  const saved = history.map((message) => message && typeof message === 'object' ? { ...message } : message);
  const userIndex = saved.length - 2;
  const user = saved[userIndex];
  if (user?.role !== 'user' || !isSensitiveText(user.content)) return saved;
  saved[userIndex] = { ...user, content: '[Sensitive user message omitted from saved history.]' };
  if (saved[userIndex + 1]?.role === 'assistant') {
    saved[userIndex + 1] = { ...saved[userIndex + 1], content: '[Reply omitted because the preceding user message was sensitive.]' };
  }
  return saved;
}

const RULES = [
  {
    kind: 'communication-style',
    pattern: /^(?:please\s+)?(?:be|keep|make|answer|respond|write|avoid|use|don't use|do not use|never use|always use|réponds|sois|reste|évite|utilise|contesta|responde|sé|evita|usa|responda|seja|mantenha|evite|use|отвечай|будь|пиши|избегай|используй)(?:\s+|[,.:;]\s*).{2,}$/iu,
  },
  {
    kind: 'correction',
    pattern: /^(?:(?:no|non|não|нет)[,!.]?\s*)?(?:i meant|i mean|that(?:'s| is) wrong|you misunderstood|not what i meant|je voulais dire|je veux dire|c'est faux|tu as mal compris|quería decir|quise decir|eso está mal|você entendeu errado|quis dizer|isso está errado|я имел(?:а)? в виду|я хотел(?:а)? сказать|ты неправильно понял(?:а)?)(?:\s+|[,.:;]\s*).{2,}$/iu,
  },
  {
    kind: 'project',
    pattern: /^(?:i(?:'m| am) working on|my project is|i(?:'m| am) building|je travaille sur|mon projet est|estoy trabajando en|mi proyecto es|estou trabalhando em|meu projeto é|я работаю над|мой проект(?: —| это)?|мой проект)(?:\s+|[,.:;]\s*).{2,}$/iu,
  },
  {
    kind: 'interest',
    pattern: /^(?:i(?:'m| am) interested in|i(?:'m| am) into|i enjoy|i care about|je m'intéresse à|je m’interesse à|je m'intéresse au|me interesa|me interesan|gosto de|me interesso por|мне интересно|мне нравится тема|интересуюсь)(?:\s+|[,.:;]\s*).{2,}$/iu,
  },
  {
    kind: 'preference',
    pattern: /^(?:i prefer|i like|i love|i dislike|i hate|i don't like|i do not like|my preference is|je préfère|j'aime|je n'aime pas|me gusta|prefiero|no me gusta|prefiro|gosto mais de|não gosto de|não gosto|предпочитаю|мне нравится|мне не нравится|я не люблю)(?:\s+|[,.:;]\s*).{2,}$/iu,
  },
  {
    kind: 'fact',
    pattern: /^(?:my role is|i work as|i use|i speak|i am a|i'm a|my job is|mon métier est|je travaille comme|j'utilise|je parle|je suis un|je suis une|soy un|soy una|trabajo como|uso|hablo|sou um|sou uma|trabalho como|uso|falo|я работаю как|я использую|я говорю|моя работа)(?:\s+|[,.:;]\s*).{2,}$/iu,
  },
];

const LABELS = {
  en: {
    'communication-style': 'communication style',
    correction: 'correction',
    project: 'project',
    interest: 'interest',
    preference: 'preference',
    fact: 'fact',
    inference: 'inference',
    explicit: 'explicitly stated',
    inferred: 'inference — reviewed by you',
    reviewed: 'corrected by you',
  },
  fr: {
    'communication-style': 'style de communication',
    correction: 'correction',
    project: 'projet',
    interest: 'centre d’intérêt',
    preference: 'préférence',
    fact: 'fait',
    inference: 'déduction',
    explicit: 'dit explicitement',
    inferred: 'déduction — validée par toi',
    reviewed: 'corrigé par toi',
  },
  es: {
    'communication-style': 'estilo de comunicación',
    correction: 'corrección',
    project: 'proyecto',
    interest: 'interés',
    preference: 'preferencia',
    fact: 'hecho',
    inference: 'inferencia',
    explicit: 'dicho explícitamente',
    inferred: 'inferencia — revisada por ti',
    reviewed: 'corregido por ti',
  },
  pt: {
    'communication-style': 'estilo de comunicação',
    correction: 'correção',
    project: 'projeto',
    interest: 'interesse',
    preference: 'preferência',
    fact: 'fato',
    inference: 'inferência',
    explicit: 'dito explicitamente',
    inferred: 'inferência — revisada por você',
    reviewed: 'corrigido por você',
  },
  ru: {
    'communication-style': 'стиль общения',
    correction: 'исправление',
    project: 'проект',
    interest: 'интерес',
    preference: 'предпочтение',
    fact: 'факт',
    inference: 'предположение',
    explicit: 'сказано прямо',
    inferred: 'предположение — проверено вами',
    reviewed: 'исправлено вами',
  },
};

const normalized = (text) => String(text || '')
  .normalize('NFKC')
  .toLocaleLowerCase()
  .replace(/[^\p{L}\p{N}]+/gu, ' ')
  .trim();

function safeRecord(record, now) {
  if (!record || typeof record !== 'object') return false;
  if (typeof record.id !== 'string' || !record.id) return false;
  if (!['fact', 'preference', 'correction', 'interest', 'project', 'communication-style', 'inference'].includes(record.kind)) return false;
  if (!['explicit', 'inferred', 'reviewed'].includes(record.evidence)) return false;
  if (record.status !== 'accepted' || typeof record.text !== 'string') return false;
  const text = record.text.trim();
  return text.length > 0 && text.length <= MAX_TEXT && !isSensitiveText(text)
    && (!record.expiresAt || Number(record.expiresAt) > now);
}

export function classifyConversation(text) {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  if (!value || value.length > MAX_TEXT || isSensitiveText(value)) return null;
  const rule = RULES.find(({ pattern }) => pattern.test(value));
  if (!rule) return null;
  return {
    kind: rule.kind,
    text: value,
    evidence: 'explicit',
    confidence: 0.96,
  };
}

export class Learning {
  constructor({ host, brain }) {
    this.host = host;
    this.brain = brain;
    this.enabled = false;
    this.entries = [];
  }

  configure(config = {}, now = Date.now()) {
    this.enabled = config.learningEnabled === true && config.privacyPaused !== true;
    const source = Array.isArray(config.learningEntries) ? config.learningEntries : [];
    this.entries = source.filter((entry) => safeRecord(entry, now)).slice(-MAX_LEARNING_ENTRIES);
    if (this.brain?.custom) this.brain.custom.learningEntries = this.entries;
    // Expired or malformed entries are removed from this new store only; existing Capri memories
    // and conversation history are not read, migrated, or rewritten here.
    if (this.entries.length !== source.length) {
      this.host.setConfig({ learningEntries: this.entries }).catch(() => {});
    }
  }

  propose(text) {
    if (!this.enabled) return null;
    const candidate = classifyConversation(text);
    if (!candidate) return null;
    const key = normalized(candidate.text);
    if (this.entries.some((entry) => normalized(entry.text) === key)) return null;
    if ((this.brain?.custom?.memories || []).some((memory) => normalized(memory) === key)) return null;
    return candidate;
  }

  async accept(candidate, now = Date.now()) {
    if (!this.enabled || !candidate || candidate.evidence !== 'explicit') return false;
    const text = String(candidate.text || '').replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT);
    if (!text || isSensitiveText(text) || !RULES.some(({ kind }) => kind === candidate.kind)) return false;
    const key = normalized(text);
    if (this.entries.some((entry) => normalized(entry.text) === key)) return false;
    const ttl = candidate.kind === 'project' ? PROJECT_TTL : candidate.kind === 'interest' ? INTEREST_TTL : 0;
    const entry = {
      id: globalThis.crypto?.randomUUID?.() || `${now.toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
      kind: candidate.kind,
      text,
      evidence: 'explicit',
      confidence: Math.max(0, Math.min(1, Number(candidate.confidence) || 0.96)),
      status: 'accepted',
      createdAt: now,
      updatedAt: now,
      expiresAt: ttl ? now + ttl : null,
    };
    this.entries = [...this.entries, entry].slice(-MAX_LEARNING_ENTRIES);
    if (this.brain?.custom) this.brain.custom.learningEntries = this.entries;
    try {
      await this.host.setConfig({ learningEntries: this.entries });
      return true;
    } catch {
      this.entries = this.entries.filter((item) => item.id !== entry.id);
      if (this.brain?.custom) this.brain.custom.learningEntries = this.entries;
      return false;
    }
  }

  async correct(id, text, now = Date.now()) {
    const value = String(text || '').replace(/\s+/g, ' ').trim();
    if (!value || value.length > MAX_TEXT || isSensitiveText(value)) return false;
    const existing = this.entries.find((entry) => entry.id === id);
    if (!existing) return false;
    const duplicate = this.entries.find((entry) => entry.id !== id && normalized(entry.text) === normalized(value));
    if (duplicate) return false;
    const updated = this.entries.map((entry) => entry.id === id
      ? { ...entry, text: value, evidence: 'reviewed', confidence: 1, updatedAt: now }
      : entry);
    return this.save(updated);
  }

  async remove(id) {
    return this.save(this.entries.filter((entry) => entry.id !== id));
  }

  async clear() {
    return this.save([]);
  }

  kindLabel(kind, lang = 'en') {
    return (LABELS[lang] || LABELS.en)[kind] || LABELS.en[kind] || String(kind);
  }

  evidenceLabel(evidence, lang = 'en') {
    return (LABELS[lang] || LABELS.en)[evidence] || LABELS.en[evidence] || String(evidence);
  }

  async save(entries) {
    const next = entries.slice(-MAX_LEARNING_ENTRIES);
    const previous = this.entries;
    this.entries = next;
    if (this.brain?.custom) this.brain.custom.learningEntries = next;
    try {
      await this.host.setConfig({ learningEntries: next });
      return true;
    } catch {
      this.entries = previous;
      if (this.brain?.custom) this.brain.custom.learningEntries = previous;
      return false;
    }
  }
}
