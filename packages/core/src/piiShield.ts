export type PiiCategory =
  | "EMAIL"
  | "PHONE"
  | "TAX_ID"
  | "ACCOUNT"
  | "ADDRESS"
  | "PERSON"
  | "AMOUNT"
  | "CONTEXT";

export interface PiiEntity {
  token: string;
  category: PiiCategory;
  original: string;
  start: number;
  end: number;
  source?: "deterministic" | "on_device_context";
}

export interface DiffSegment {
  type: "unchanged" | "entity";
  text: string;
  token?: string;
  category?: PiiCategory;
}

export interface ShieldResult {
  original: string;
  scrubbed: string;
  entities: PiiEntity[];
  tokenMap: Record<string, string>;
  diffSegments: DiffSegment[];
}

export interface ShieldOptions {
  maskAmounts?: boolean;
}

export interface ContextualPhrase {
  phrase: string;
  reason?: string;
}

export interface WireEgressAudit {
  wireHost: string | null;
  wireBytesSent: number;
  wirePayloadSha256: string | null;
  rawPiiBytesLeaked: number;
  canaryLeakCategories: PiiCategory[];
  verifiedZeroRawPii: boolean;
}

interface Candidate {
  start: number;
  end: number;
  original: string;
  category: PiiCategory;
  priority: number;
  source: "deterministic" | "on_device_context";
}

const CATEGORY_PRIORITY: Record<PiiCategory, number> = {
  EMAIL: 100,
  TAX_ID: 95,
  PHONE: 90,
  ACCOUNT: 85,
  ADDRESS: 80,
  CONTEXT: 75,
  PERSON: 70,
  AMOUNT: 60,
};

const TOKEN_PLACEHOLDER_PATTERN =
  /\[(?:EMAIL|PHONE|TAX_ID|ACCOUNT|ADDRESS|PERSON|AMOUNT|CONTEXT)_\d+\]/g;

const EMAIL_PATTERN =
  /\b[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+\b/gi;

const US_PHONE_PATTERN =
  /(?<!\d)(?:\+?1[\s.-]?(?:\(\d{3}\)|\d{3})[\s.-]?\d{3}[\s.-]?\d{4}|(?:\(\d{3}\)[\s.-]?|\d{3}[\s.-])\d{3}[\s.-]?\d{4})(?!\d)/g;

const INDIAN_PHONE_PATTERN =
  /(?<!\d)(?:\+?91[\s.-]?)?[6-9]\d{4}[\s.-]?\d{5}(?!\d)/g;

const US_TAX_ID_PATTERN = /\b(?:\d{3}-\d{2}-\d{4}|\d{2}-\d{7})\b/g;

// Indian PAN is strictly uppercase 5 letters + 4 digits + 1 letter.
const IN_PAN_PATTERN = /\b[A-Z]{5}\d{4}[A-Z]\b/g;

const LABELED_ACCOUNT_PATTERN =
  /\b(?:MRN|medical record(?: number)?|account(?: number| no\.?)?|acct(?: number| no\.?)?|bank account(?: number| no\.?)?|card(?: number| no\.?)?)\s*(?:[:#-]\s*)?((?:[A-Z]{1,4}-)?\d[\d -]{4,32})\b/gi;

const CARD_NUMBER_PATTERN = /\b(?:\d[ -]?){12,18}\d\b/g;

const IBAN_PATTERN = /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/g;

const STREET_ADDRESS_PATTERN =
  /\b\d{1,6}\s+[A-Z0-9][A-Za-z0-9.'-]*(?:\s+[A-Za-z0-9.'-]+){0,4}\s+(?:street|st|avenue|ave|road|rd|boulevard|blvd|lane|ln|drive|dr|court|ct|way|place|pl|parkway|pkwy)\.?(?:[,\s]+(?:apartment|apt|suite|ste|unit|#)\.?\s*[A-Za-z0-9-]+)?(?:,\s*[A-Za-z][A-Za-z .'-]{1,40})?(?:,\s*[A-Z]{2}\s+\d{5}(?:-\d{4})?)?/gi;

const LABELED_ADDRESS_PATTERN =
  /\b(?:mailing\s+address|street\s+address|registered\s+address|home\s+address|office\s+address|address)\b\s*:\s*([^\n;]{8,140})/gi;

const ADDRESS_SIGNAL_PATTERN =
  /(?:\d|\b(?:phase|sector|cross|main|nagar|layout|road|rd|street|st|avenue|ave|blvd|lane|drive|floor|block|bengaluru|bangalore|mumbai|delhi|hyderabad|chennai|pune|london|[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\b)/i;

const PERSON_AFTER_CUE_PATTERN =
  /\b(?:(?:patient|client|contractor|consultant|signatory|contact|representative)(?:\s+name)?|(?:full\s+)?name|attn\.?|attention)\b(?:\s*[:#-][ \t]*|\s+(?:is|named)[ \t]+)([^\n,.;()]{2,64})/gi;

const PERSON_WORD_PATTERN =
  /^[A-Z](?:[a-z]*(?:[-'][A-Z]?[a-z]+)+|[a-z]+|\.)$/;

const PERSON_STOPLIST = new Set([
  "client",
  "contractor",
  "consultant",
  "company",
  "party",
  "parties",
  "agreement",
  "services",
  "invoice",
  "invoices",
  "notice",
  "notices",
  "payment",
  "confidential",
  "indemnification",
  "section",
  "schedule",
  "annex",
  "privacy",
  "operations",
  "shall",
  "will",
  "may",
  "must",
  "should",
  "hereby",
  "pursuant",
  "delaware",
  "california",
  "inc",
  "llc",
  "ltd",
  "corp",
  "corporation",
  "technologies",
  "consulting",
  "robotics",
  "systems",
  "solutions",
  "clinic",
  "health",
  "plan",
  "security",
  "support",
  "billing",
  "review",
  "law",
  "rights",
  "solely",
  "responsible",
  "approved",
  "within",
  "medical",
  "record",
  "number",
  "total",
  "date",
  "service",
  "retains",
  "assigns",
  "indemnifies",
  "bears",
  "unknown",
  "none",
  "na",
]);

const CONTEXT_STOPLIST = new Set([
  "agreement",
  "client",
  "contractor",
  "consultant",
  "company",
  "services",
  "invoice",
  "invoices",
  "payment",
  "indemnification",
  "confidentiality",
  "governing",
  "delaware",
  "california",
]);

const AMOUNT_PATTERN =
  /(?:(?:US\$|USD|INR|Rs\.?|EUR|₹|€|\$)\s?\d(?:[\d., \t]*\d)?(?:\s?(?:USD|INR|EUR))?|\b\d(?:[\d., \t]*\d)?\s?(?:USD|INR|EUR)\b)/gi;

function collectMatches(
  text: string,
  pattern: RegExp,
  category: PiiCategory,
  valueGroup = 0,
  priorityOverride?: number,
): Candidate[] {
  const matches: Candidate[] = [];
  const expression = new RegExp(pattern.source, pattern.flags);

  for (const match of text.matchAll(expression)) {
    const value = match[valueGroup];
    if (!value || match.index === undefined) {
      continue;
    }

    const relativeStart = match[0].indexOf(value);
    if (relativeStart < 0) {
      continue;
    }

    const start = match.index + relativeStart;
    const end = start + value.length;
    matches.push({
      start,
      end,
      original: text.slice(start, end),
      category,
      priority: priorityOverride ?? CATEGORY_PRIORITY[category],
      source: "deterministic",
    });
  }

  return matches;
}

function collectLabeledAddressMatches(text: string): Candidate[] {
  const matches = collectMatches(text, LABELED_ADDRESS_PATTERN, "ADDRESS", 1);
  return matches
    .map((candidate) => {
      const trimmed = candidate.original.trim();
      const leadTrim = candidate.original.indexOf(trimmed);
      const start = candidate.start + Math.max(0, leadTrim);
      const end = start + trimmed.length;
      return {
        ...candidate,
        start,
        end,
        original: text.slice(start, end),
      };
    })
    .filter(
      (candidate) =>
        candidate.original.length >= 8 &&
        ADDRESS_SIGNAL_PATTERN.test(candidate.original),
    );
}

function collectPersonMatches(text: string): Candidate[] {
  const candidates: Candidate[] = [];
  const expression = new RegExp(
    PERSON_AFTER_CUE_PATTERN.source,
    PERSON_AFTER_CUE_PATTERN.flags,
  );

  for (const match of text.matchAll(expression)) {
    const rawSegment = match[1];
    if (!rawSegment || match.index === undefined) {
      continue;
    }

    const relStart = match[0].indexOf(rawSegment);
    if (relStart < 0) {
      continue;
    }

    const trimmed = rawSegment.trim();
    const words = trimmed.split(/\s+/);
    const validWords: string[] = [];

    for (const word of words) {
      if (validWords.length >= 4) {
        break;
      }
      if (!PERSON_WORD_PATTERN.test(word)) {
        break;
      }
      if (PERSON_STOPLIST.has(word.toLowerCase())) {
        break;
      }
      validWords.push(word);
    }

    if (validWords.length < 2) {
      continue;
    }

    const candidateText = validWords.join(" ");
    const insideRel = rawSegment.indexOf(candidateText);
    if (insideRel < 0) {
      continue;
    }

    const start = match.index + relStart + insideRel;
    const end = start + candidateText.length;
    candidates.push({
      start,
      end,
      original: text.slice(start, end),
      category: "PERSON",
      priority: CATEGORY_PRIORITY.PERSON,
      source: "deterministic",
    });
  }

  return candidates;
}

export function passesLuhn(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  if (digits.length < 13 || digits.length > 19) {
    return false;
  }

  let sum = 0;
  let doubleDigit = false;
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    const digit = Number(digits[index]);
    let contribution = digit;
    if (doubleDigit) {
      contribution *= 2;
      if (contribution > 9) {
        contribution -= 9;
      }
    }
    sum += contribution;
    doubleDigit = !doubleDigit;
  }

  return sum % 10 === 0;
}

export function passesIbanMod97(value: string): boolean {
  const cleaned = value.replace(/\s+/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(cleaned)) {
    return false;
  }

  const rearranged = cleaned.slice(4) + cleaned.slice(0, 4);
  let remainder = 0;
  for (const ch of rearranged) {
    const code = ch.charCodeAt(0);
    const expanded = code >= 65 && code <= 90 ? String(code - 55) : ch;
    for (const digit of expanded) {
      remainder = (remainder * 10 + Number(digit)) % 97;
    }
  }
  return remainder === 1;
}

function collectCardMatches(text: string): Candidate[] {
  return collectMatches(text, CARD_NUMBER_PATTERN, "ACCOUNT").filter((match) =>
    passesLuhn(match.original),
  );
}

function collectLabeledAccountMatches(text: string): Candidate[] {
  return collectMatches(text, LABELED_ACCOUNT_PATTERN, "ACCOUNT", 1, 92).filter(
    (candidate) => {
      const prefix = text.slice(Math.max(0, candidate.start - 20), candidate.start).toLowerCase();
      if (/\bcard\b/.test(prefix) && !/\b(?:account|acct|bank|mrn)\b/.test(prefix)) {
        const digits = candidate.original.replace(/\D/g, "");
        if (digits.length >= 13 && digits.length <= 19) {
          return passesLuhn(candidate.original);
        }
      }
      return true;
    },
  );
}

function collectIbanMatches(text: string): Candidate[] {
  return collectMatches(text, IBAN_PATTERN, "ACCOUNT").filter((match) =>
    passesIbanMod97(match.original),
  );
}

function propagateDetectedCandidates(
  text: string,
  initial: Candidate[],
): Candidate[] {
  const expanded = [...initial];
  const propagatedKeys = new Set<string>();
  const lowerText = text.toLowerCase();

  for (const candidate of initial) {
    if (
      candidate.category !== "PERSON" &&
      candidate.category !== "TAX_ID" &&
      candidate.category !== "ACCOUNT" &&
      candidate.category !== "ADDRESS"
    ) {
      continue;
    }
    if (candidate.original.length < 4) continue;
    const dedupeKey = `${candidate.category}\u0000${candidate.original.toLowerCase()}`;
    if (propagatedKeys.has(dedupeKey)) continue;
    propagatedKeys.add(dedupeKey);

    const searchTerm =
      candidate.category === "TAX_ID"
        ? candidate.original
        : candidate.original.toLowerCase();
    const haystack = candidate.category === "TAX_ID" ? text : lowerText;

    let cursor = 0;
    while (cursor < haystack.length) {
      const idx = haystack.indexOf(searchTerm, cursor);
      if (idx < 0) break;
      const end = idx + candidate.original.length;
      if (isBoundaryChar(text[idx - 1]) && isBoundaryChar(text[end])) {
        expanded.push({
          start: idx,
          end,
          original: text.slice(idx, end),
          category: candidate.category,
          priority: candidate.priority,
          source: candidate.source,
        });
      }
      cursor = end;
    }
  }

  return expanded;
}

function resolveOverlaps(candidates: Candidate[]): Candidate[] {
  const ordered = [...candidates].sort((left, right) => {
    if (left.start !== right.start) {
      return left.start - right.start;
    }
    if (left.priority !== right.priority) {
      return right.priority - left.priority;
    }
    return right.end - right.start - (left.end - left.start);
  });

  const accepted: Candidate[] = [];
  for (const candidate of ordered) {
    const overlaps = accepted.some(
      (existing) =>
        candidate.start < existing.end && candidate.end > existing.start,
    );
    if (!overlaps) {
      accepted.push(candidate);
    }
  }

  return accepted.sort((left, right) => left.start - right.start);
}

function makeDiffSegments(
  original: string,
  entities: PiiEntity[],
): DiffSegment[] {
  const segments: DiffSegment[] = [];
  let cursor = 0;

  for (const entity of entities) {
    if (entity.start > cursor) {
      segments.push({
        type: "unchanged",
        text: original.slice(cursor, entity.start),
      });
    }

    segments.push({
      type: "entity",
      text: entity.token,
      token: entity.token,
      category: entity.category,
    });
    cursor = entity.end;
  }

  if (cursor < original.length) {
    segments.push({
      type: "unchanged",
      text: original.slice(cursor),
    });
  }

  return segments;
}

function finalizeShieldResult(
  text: string,
  selected: Candidate[],
): ShieldResult {
  const tokenMap: Record<string, string> = {};
  const tokenByValue = new Map<string, string>();
  const categoryCounts = new Map<PiiCategory, number>();
  const entities: PiiEntity[] = [];
  let cursor = 0;
  let scrubbed = "";

  for (const match of selected) {
    const valueKey = `${match.category}\u0000${match.original}`;
    let token = tokenByValue.get(valueKey);

    if (!token) {
      const nextCount = (categoryCounts.get(match.category) ?? 0) + 1;
      categoryCounts.set(match.category, nextCount);
      token = `[${match.category}_${nextCount}]`;
      tokenMap[token] = match.original;
      tokenByValue.set(valueKey, token);
    }

    scrubbed += text.slice(cursor, match.start);
    scrubbed += token;
    cursor = match.end;
    entities.push({
      token,
      category: match.category,
      original: match.original,
      start: match.start,
      end: match.end,
      source: match.source,
    });
  }

  scrubbed += text.slice(cursor);

  return {
    original: text,
    scrubbed,
    entities,
    tokenMap,
    diffSegments: makeDiffSegments(text, entities),
  };
}

export function shieldPii(
  text: string,
  options: ShieldOptions = {},
): ShieldResult {
  const candidates: Candidate[] = [
    ...collectMatches(text, EMAIL_PATTERN, "EMAIL"),
    ...collectMatches(text, US_TAX_ID_PATTERN, "TAX_ID"),
    ...collectMatches(text, IN_PAN_PATTERN, "TAX_ID"),
    ...collectMatches(text, US_PHONE_PATTERN, "PHONE"),
    ...collectMatches(text, INDIAN_PHONE_PATTERN, "PHONE"),
    // Labeled account numbers outrank unlabelled numeric patterns.
    ...collectLabeledAccountMatches(text),
    ...collectCardMatches(text),
    ...collectIbanMatches(text),
    ...collectMatches(text, STREET_ADDRESS_PATTERN, "ADDRESS"),
    ...collectLabeledAddressMatches(text),
    ...collectPersonMatches(text),
  ];

  if (options.maskAmounts) {
    candidates.push(...collectMatches(text, AMOUNT_PATTERN, "AMOUNT"));
  }

  const withRepeated = propagateDetectedCandidates(text, candidates);
  return finalizeShieldResult(text, resolveOverlaps(withRepeated));
}

function isBoundaryChar(ch: string | undefined): boolean {
  return !ch || !/[A-Za-z0-9]/.test(ch);
}

export function mergeContextualEntities(
  baseShield: ShieldResult,
  phrases: ContextualPhrase[],
): ShieldResult {
  const candidates: Candidate[] = baseShield.entities.map((entity) => ({
    start: entity.start,
    end: entity.end,
    original: entity.original,
    category: entity.category,
    priority:
      entity.source === "deterministic" && entity.category === "ACCOUNT"
        ? 92
        : CATEGORY_PRIORITY[entity.category],
    source: entity.source ?? "deterministic",
  }));

  const lowerSource = baseShield.original.toLowerCase();
  const seenPhrases = new Set<string>();

  for (const item of phrases) {
    const cleaned = item.phrase.trim();
    if (cleaned.length < 4) continue;
    if (cleaned.includes("[") || cleaned.includes("]")) continue;
    const lowerPhrase = cleaned.toLowerCase();
    if (CONTEXT_STOPLIST.has(lowerPhrase) || seenPhrases.has(lowerPhrase)) {
      continue;
    }
    seenPhrases.add(lowerPhrase);

    let searchFrom = 0;
    while (searchFrom < lowerSource.length) {
      const idx = lowerSource.indexOf(lowerPhrase, searchFrom);
      if (idx < 0) break;
      const end = idx + cleaned.length;
      const leftOk = isBoundaryChar(baseShield.original[idx - 1]);
      const rightOk = isBoundaryChar(baseShield.original[end]);

      if (leftOk && rightOk) {
        candidates.push({
          start: idx,
          end,
          original: baseShield.original.slice(idx, end),
          category: "CONTEXT",
          priority: CATEGORY_PRIORITY.CONTEXT,
          source: "on_device_context",
        });
      }
      searchFrom = idx + cleaned.length;
    }
  }

  return finalizeShieldResult(baseShield.original, resolveOverlaps(candidates));
}

export function rehydrateText(
  text: string,
  tokenMap: Record<string, string>,
): string {
  return text.replace(
    TOKEN_PLACEHOLDER_PATTERN,
    (token) => tokenMap[token] ?? token,
  );
}

export class PiiLeakError extends Error {
  readonly leakCategories: PiiCategory[];

  constructor(leakCategories: PiiCategory[]) {
    super(
      `Scrubbed content still contains raw PII categories: ${leakCategories.join(", ")}`,
    );
    this.name = "PiiLeakError";
    this.leakCategories = leakCategories;
  }
}

export function assertNoRawPii(
  scrubbed: string,
  entities: PiiEntity[],
): void {
  const leakCategories = new Set<PiiCategory>();
  const lowerScrubbed = scrubbed.toLowerCase();

  for (const entity of entities) {
    if (
      lowerScrubbed.includes(entity.original.toLowerCase()) ||
      !scrubbed.includes(entity.token)
    ) {
      leakCategories.add(entity.category);
    }
  }

  if (leakCategories.size > 0) {
    throw new PiiLeakError([...leakCategories]);
  }
}

export function containsPiiToken(text: string): boolean {
  return new RegExp(TOKEN_PLACEHOLDER_PATTERN.source).test(text);
}

export function redactPiiTokens(text: string): string {
  return text.replace(TOKEN_PLACEHOLDER_PATTERN, "[REDACTED]");
}

async function computeSha256Hex(payload: string): Promise<string> {
  const bytes = new TextEncoder().encode(payload);
  if (!globalThis.crypto?.subtle) {
    throw new Error("Web Crypto SubtleCrypto is required to compute payload SHA-256.");
  }
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function extractWireUserContentStrings(wireBody: string): string {
  try {
    const parsed = JSON.parse(wireBody) as Record<string, unknown>;
    const chunks: string[] = [];
    const visit = (node: unknown) => {
      if (typeof node === "string") {
        chunks.push(node);
      } else if (Array.isArray(node)) {
        for (const item of node) visit(item);
      } else if (node && typeof node === "object") {
        for (const value of Object.values(node as Record<string, unknown>)) {
          visit(value);
        }
      }
    };
    if ("contents" in parsed) {
      visit(parsed.contents);
      return chunks.join("\n");
    }
    return wireBody;
  } catch {
    return wireBody;
  }
}

export async function auditWirePayload(
  wireBody: string | null,
  wireHost: string | null,
  entities: PiiEntity[],
): Promise<WireEgressAudit> {
  if (wireBody === null) {
    return {
      wireHost: null,
      wireBytesSent: 0,
      wirePayloadSha256: null,
      rawPiiBytesLeaked: 0,
      canaryLeakCategories: [],
      verifiedZeroRawPii: true,
    };
  }

  const wireBytesSent = new TextEncoder().encode(wireBody).length;
  const wirePayloadSha256 = await computeSha256Hex(wireBody);
  const inspectedText = extractWireUserContentStrings(wireBody);
  const lowerWire = wireBody.toLowerCase();
  const leakCategories = new Set<PiiCategory>();
  let rawPiiBytesLeaked = 0;
  const countedOriginals = new Set<string>();

  for (const entity of entities) {
    const key = entity.original.toLowerCase();
    if (key.length >= 2 && lowerWire.includes(key)) {
      leakCategories.add(entity.category);
      if (!countedOriginals.has(key)) {
        countedOriginals.add(key);
        rawPiiBytesLeaked += new TextEncoder().encode(entity.original).length;
      }
    }
  }

  const canaryChecks: Array<{ category: PiiCategory; matches: string[] }> = [
    {
      category: "EMAIL",
      matches: [...inspectedText.matchAll(new RegExp(EMAIL_PATTERN.source, "gi"))].map((m) => m[0]),
    },
    {
      category: "TAX_ID",
      matches: [
        ...inspectedText.matchAll(new RegExp(US_TAX_ID_PATTERN.source, "g")),
        ...inspectedText.matchAll(new RegExp(IN_PAN_PATTERN.source, "g")),
      ].map((m) => m[0]),
    },
    {
      category: "PHONE",
      matches: [
        ...inspectedText.matchAll(new RegExp(US_PHONE_PATTERN.source, "g")),
        ...inspectedText.matchAll(new RegExp(INDIAN_PHONE_PATTERN.source, "g")),
      ].map((m) => m[0]),
    },
    {
      category: "ACCOUNT",
      matches: [
        ...collectCardMatches(inspectedText).map((c) => c.original),
        ...collectIbanMatches(inspectedText).map((c) => c.original),
      ],
    },
  ];

  for (const check of canaryChecks) {
    for (const hit of check.matches) {
      leakCategories.add(check.category);
      const key = hit.toLowerCase();
      if (!countedOriginals.has(key)) {
        countedOriginals.add(key);
        rawPiiBytesLeaked += new TextEncoder().encode(hit).length;
      }
    }
  }

  return {
    wireHost,
    wireBytesSent,
    wirePayloadSha256,
    rawPiiBytesLeaked,
    canaryLeakCategories: [...leakCategories],
    verifiedZeroRawPii: leakCategories.size === 0 && rawPiiBytesLeaked === 0,
  };
}
