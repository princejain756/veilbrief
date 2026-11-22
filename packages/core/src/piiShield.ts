export type PiiCategory =
  | "EMAIL"
  | "PHONE"
  | "TAX_ID"
  | "ACCOUNT"
  | "ADDRESS"
  | "PERSON"
  | "AMOUNT";

export interface PiiEntity {
  token: string;
  category: PiiCategory;
  original: string;
  start: number;
  end: number;
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

interface Candidate {
  start: number;
  end: number;
  original: string;
  category: PiiCategory;
  priority: number;
}

const CATEGORY_PRIORITY: Record<PiiCategory, number> = {
  EMAIL: 100,
  TAX_ID: 95,
  PHONE: 90,
  ACCOUNT: 85,
  ADDRESS: 80,
  PERSON: 70,
  AMOUNT: 60,
};

const TOKEN_PLACEHOLDER_PATTERN =
  /\[(?:EMAIL|PHONE|TAX_ID|ACCOUNT|ADDRESS|PERSON|AMOUNT)_\d+\]/g;

const EMAIL_PATTERN =
  /\b[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+\b/gi;

const US_PHONE_PATTERN =
  /(?:\+?1[\s.-]?)?(?:\(\d{3}\)|\d{3})[\s.-]?\d{3}[\s.-]?\d{4}\b/g;

const INDIAN_PHONE_PATTERN =
  /(?:\+?91[\s.-]?)?[6-9]\d{4}[\s.-]?\d{5}\b/g;

const TAX_ID_PATTERN =
  /\b(?:\d{3}-\d{2}-\d{4}|\d{2}-\d{7}|[A-Z]{5}\d{4}[A-Z])\b/gi;

const LABELED_ACCOUNT_PATTERN =
  /\b(?:MRN|medical record(?: number)?|account(?: number| no\.?)?|acct(?: number| no\.?)?|bank account(?: number| no\.?)?|card(?: number| no\.?)?)\s*(?:[:#-]\s*)?((?:[A-Z]{1,4}-)?\d[\d -]{4,32})\b/gi;

const CARD_NUMBER_PATTERN = /\b(?:\d[ -]?){12,18}\d\b/g;

const IBAN_PATTERN = /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/gi;

const STREET_ADDRESS_PATTERN =
  /\b\d{1,6}\s+[A-Z0-9][A-Za-z0-9.'-]*(?:\s+[A-Za-z0-9.'-]+){0,4}\s+(?:street|st|avenue|ave|road|rd|boulevard|blvd|lane|ln|drive|dr|court|ct|way|place|pl|parkway|pkwy)\.?(?:[,\s]+(?:apartment|apt|suite|ste|unit|#)\.?\s*[A-Za-z0-9-]+)?(?:,\s*[A-Za-z][A-Za-z .'-]{1,40})?(?:,\s*[A-Z]{2}\s+\d{5}(?:-\d{4})?)?/gi;

const PERSON_AFTER_CUE_PATTERN =
  /\b(?:(?:patient|client|contractor|signatory)(?:\s+name)?|(?:full\s+)?name|attn\.?|attention)\b\s*(?::|#|-)?\s*(?!the\b|of\b|for\b|and\b)([A-Z][A-Za-z'-]+(?:[ '-][A-Z][A-Za-z'-]+){1,3})/gi;

const AMOUNT_PATTERN =
  /(?:(?:US\$|USD|INR|Rs\.?|EUR|₹|€|\$)\s?\d(?:[\d., \t]*\d)?(?:\s?(?:USD|INR|EUR))?|\b\d(?:[\d., \t]*\d)?\s?(?:USD|INR|EUR)\b)/gi;

function collectMatches(
  text: string,
  pattern: RegExp,
  category: PiiCategory,
  valueGroup = 0,
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
      priority: CATEGORY_PRIORITY[category],
    });
  }

  return matches;
}

function passesLuhn(value: string): boolean {
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

function collectCardMatches(text: string): Candidate[] {
  return collectMatches(text, CARD_NUMBER_PATTERN, "ACCOUNT").filter((match) =>
    passesLuhn(match.original),
  );
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

export function shieldPii(
  text: string,
  options: ShieldOptions = {},
): ShieldResult {
  const candidates: Candidate[] = [
    ...collectMatches(text, EMAIL_PATTERN, "EMAIL"),
    ...collectMatches(text, TAX_ID_PATTERN, "TAX_ID"),
    ...collectMatches(text, US_PHONE_PATTERN, "PHONE"),
    ...collectMatches(text, INDIAN_PHONE_PATTERN, "PHONE"),
    ...collectMatches(text, LABELED_ACCOUNT_PATTERN, "ACCOUNT", 1),
    ...collectCardMatches(text),
    ...collectMatches(text, IBAN_PATTERN, "ACCOUNT"),
    ...collectMatches(text, STREET_ADDRESS_PATTERN, "ADDRESS"),
    ...collectMatches(text, PERSON_AFTER_CUE_PATTERN, "PERSON", 1),
  ];

  if (options.maskAmounts) {
    candidates.push(...collectMatches(text, AMOUNT_PATTERN, "AMOUNT"));
  }

  const selected = resolveOverlaps(candidates);
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

export function rehydrateText(
  text: string,
  tokenMap: Record<string, string>,
): string {
  return text.replace(TOKEN_PLACEHOLDER_PATTERN, (token) => tokenMap[token] ?? token);
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
