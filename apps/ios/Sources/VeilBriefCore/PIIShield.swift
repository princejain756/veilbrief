import Foundation

public enum PiiCategory: String, Codable, CaseIterable, Hashable, Sendable {
    case email = "EMAIL"
    case phone = "PHONE"
    case taxId = "TAX_ID"
    case account = "ACCOUNT"
    case address = "ADDRESS"
    case person = "PERSON"
    case amount = "AMOUNT"

    public var priority: Int {
        switch self {
        case .email: return 100
        case .taxId: return 95
        case .phone: return 90
        case .account: return 85
        case .address: return 80
        case .person: return 70
        case .amount: return 60
        }
    }
}

public struct PiiEntity: Identifiable, Equatable, Hashable, Sendable {
    public let id: String
    public let token: String
    public let category: PiiCategory
    public let original: String
    public let range: NSRange

    public init(token: String, category: PiiCategory, original: String, range: NSRange) {
        self.id = "\(token)-\(range.location)-\(range.length)"
        self.token = token
        self.category = category
        self.original = original
        self.range = range
    }
}

public struct DiffSegment: Identifiable, Equatable, Sendable {
    public enum Kind: String, Sendable {
        case unchanged
        case entity
    }

    public let id: String
    public let kind: Kind
    public let text: String
    public let token: String?
    public let category: PiiCategory?

    public init(
        id: String,
        kind: Kind,
        text: String,
        token: String? = nil,
        category: PiiCategory? = nil
    ) {
        self.id = id
        self.kind = kind
        self.text = text
        self.token = token
        self.category = category
    }
}

public struct ShieldResult: Equatable, Sendable {
    public let original: String
    public let scrubbed: String
    public let entities: [PiiEntity]
    public let tokenMap: [String: String]
    public let diffSegments: [DiffSegment]

    public var categories: [PiiCategory] {
        var seen = Set<PiiCategory>()
        var ordered: [PiiCategory] = []
        for entity in entities where !seen.contains(entity.category) {
            seen.insert(entity.category)
            ordered.append(entity.category)
        }
        return ordered
    }
}

public struct ShieldOptions: Sendable {
    public var maskAmounts: Bool

    public init(maskAmounts: Bool = false) {
        self.maskAmounts = maskAmounts
    }
}

public enum PiiLeakError: Error, LocalizedError, Equatable, Sendable {
    case rawPiiDetected([PiiCategory])

    public var errorDescription: String? {
        switch self {
        case let .rawPiiDetected(categories):
            let names = categories.map(\.rawValue).joined(separator: ", ")
            return "Scrubbed content still contains raw PII categories: \(names)"
        }
    }
}

public enum PIIShield {
    private struct Candidate {
        let range: NSRange
        let original: String
        let category: PiiCategory
        let priority: Int
    }

    private static let tokenPlaceholderRegex = try! NSRegularExpression(
        pattern: #"\[(?:EMAIL|PHONE|TAX_ID|ACCOUNT|ADDRESS|PERSON|AMOUNT)_\d+\]"#
    )

    private static let emailRegex = try! NSRegularExpression(
        pattern: #"\b[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+\b"#,
        options: [.caseInsensitive]
    )

    private static let usPhoneRegex = try! NSRegularExpression(
        pattern: #"(?:\+?1[\s.-]?)?(?:\(\d{3}\)|\d{3})[\s.-]?\d{3}[\s.-]?\d{4}\b"#
    )

    private static let indianPhoneRegex = try! NSRegularExpression(
        pattern: #"(?:\+?91[\s.-]?)?[6-9]\d{4}[\s.-]?\d{5}\b"#
    )

    private static let taxIdRegex = try! NSRegularExpression(
        pattern: #"\b(?:\d{3}-\d{2}-\d{4}|\d{2}-\d{7}|[A-Z]{5}\d{4}[A-Z])\b"#,
        options: [.caseInsensitive]
    )

    private static let labeledAccountRegex = try! NSRegularExpression(
        pattern: #"\b(?:MRN|medical record(?: number)?|account(?: number| no\.?)?|acct(?: number| no\.?)?|bank account(?: number| no\.?)?|card(?: number| no\.?)?)\s*(?:[:#-]\s*)?((?:[A-Z]{1,4}-)?\d[\d -]{4,32})\b"#,
        options: [.caseInsensitive]
    )

    private static let cardNumberRegex = try! NSRegularExpression(
        pattern: #"\b(?:\d[ -]?){12,18}\d\b"#
    )

    private static let ibanRegex = try! NSRegularExpression(
        pattern: #"\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b"#,
        options: [.caseInsensitive]
    )

    private static let streetAddressRegex = try! NSRegularExpression(
        pattern: #"\b\d{1,6}\s+[A-Z0-9][A-Za-z0-9.'-]*(?:\s+[A-Za-z0-9.'-]+){0,4}\s+(?:street|st|avenue|ave|road|rd|boulevard|blvd|lane|ln|drive|dr|court|ct|way|place|pl|parkway|pkwy)\.?(?:[,\s]+(?:apartment|apt|suite|ste|unit|#)\.?\s*[A-Za-z0-9-]+)?(?:,\s*[A-Za-z][A-Za-z .'-]{1,40})?(?:,\s*[A-Z]{2}\s+\d{5}(?:-\d{4})?)?"#,
        options: [.caseInsensitive]
    )

    private static let personAfterCueRegex = try! NSRegularExpression(
        pattern: #"\b(?:(?:patient|client|contractor|signatory)(?:\s+name)?|(?:full\s+)?name|attn\.?|attention)\b\s*(?::|#|-)?\s*(?!the\b|of\b|for\b|and\b)([A-Z][A-Za-z'-]+(?:[ '-][A-Z][A-Za-z'-]+){1,3})"#,
        options: [.caseInsensitive]
    )

    private static let amountRegex = try! NSRegularExpression(
        pattern: #"(?:(?:US\$|USD|INR|Rs\.?|EUR|₹|€|\$)\s?\d(?:[\d., \t]*\d)?(?:\s?(?:USD|INR|EUR))?|\b\d(?:[\d., \t]*\d)?\s?(?:USD|INR|EUR)\b)"#,
        options: [.caseInsensitive]
    )

    public static func shield(_ text: String, options: ShieldOptions = ShieldOptions()) -> ShieldResult {
        var candidates: [Candidate] = []
        candidates.append(contentsOf: collectMatches(in: text, regex: emailRegex, category: .email))
        candidates.append(contentsOf: collectMatches(in: text, regex: taxIdRegex, category: .taxId))
        candidates.append(contentsOf: collectMatches(in: text, regex: usPhoneRegex, category: .phone))
        candidates.append(contentsOf: collectMatches(in: text, regex: indianPhoneRegex, category: .phone))
        candidates.append(contentsOf: collectMatches(in: text, regex: labeledAccountRegex, category: .account, captureGroup: 1))
        candidates.append(contentsOf: collectCardMatches(in: text))
        candidates.append(contentsOf: collectMatches(in: text, regex: ibanRegex, category: .account))
        candidates.append(contentsOf: collectMatches(in: text, regex: streetAddressRegex, category: .address))
        candidates.append(contentsOf: collectMatches(in: text, regex: personAfterCueRegex, category: .person, captureGroup: 1))

        if options.maskAmounts {
            candidates.append(contentsOf: collectMatches(in: text, regex: amountRegex, category: .amount))
        }

        let selected = resolveOverlaps(candidates)
        let nsText = text as NSString
        var tokenMap: [String: String] = [:]
        var tokenByValue: [String: String] = [:]
        var countsByCategory: [PiiCategory: Int] = [:]
        var entities: [PiiEntity] = []
        var scrubbed = ""
        var cursor = 0

        for candidate in selected {
            let valueKey = "\(candidate.category.rawValue)\u{0000}\(candidate.original)"
            let token: String
            if let existing = tokenByValue[valueKey] {
                token = existing
            } else {
                let nextCount = (countsByCategory[candidate.category] ?? 0) + 1
                countsByCategory[candidate.category] = nextCount
                token = "[\(candidate.category.rawValue)_\(nextCount)]"
                tokenMap[token] = candidate.original
                tokenByValue[valueKey] = token
            }

            if candidate.range.location > cursor {
                scrubbed += nsText.substring(with: NSRange(location: cursor, length: candidate.range.location - cursor))
            }
            scrubbed += token
            cursor = NSMaxRange(candidate.range)
            entities.append(
                PiiEntity(
                    token: token,
                    category: candidate.category,
                    original: candidate.original,
                    range: candidate.range
                )
            )
        }

        if cursor < nsText.length {
            scrubbed += nsText.substring(from: cursor)
        }

        return ShieldResult(
            original: text,
            scrubbed: scrubbed,
            entities: entities,
            tokenMap: tokenMap,
            diffSegments: makeDiffSegments(original: text, entities: entities)
        )
    }

    public static func rehydrate(_ text: String, tokenMap: [String: String]) -> String {
        let nsText = text as NSString
        let matches = tokenPlaceholderRegex.matches(
            in: text,
            range: NSRange(location: 0, length: nsText.length)
        )
        guard !matches.isEmpty else { return text }

        var output = ""
        var cursor = 0
        for match in matches {
            if match.range.location > cursor {
                output += nsText.substring(with: NSRange(location: cursor, length: match.range.location - cursor))
            }
            let token = nsText.substring(with: match.range)
            output += tokenMap[token] ?? token
            cursor = NSMaxRange(match.range)
        }
        if cursor < nsText.length {
            output += nsText.substring(from: cursor)
        }
        return output
    }

    public static func assertNoRawPii(scrubbed: String, entities: [PiiEntity]) throws {
        let lowerScrubbed = scrubbed.lowercased()
        var leaked: [PiiCategory] = []
        var seen = Set<PiiCategory>()

        for entity in entities {
            let containsRaw = lowerScrubbed.contains(entity.original.lowercased())
            let missingToken = !scrubbed.contains(entity.token)
            if (containsRaw || missingToken) && !seen.contains(entity.category) {
                seen.insert(entity.category)
                leaked.append(entity.category)
            }
        }

        if !leaked.isEmpty {
            throw PiiLeakError.rawPiiDetected(leaked)
        }
    }

    public static func redactTokens(in text: String) -> String {
        let nsText = text as NSString
        return tokenPlaceholderRegex.stringByReplacingMatches(
            in: text,
            range: NSRange(location: 0, length: nsText.length),
            withTemplate: "[REDACTED]"
        )
    }

    public static func passesLuhn(_ raw: String) -> Bool {
        let digits = raw.compactMap { $0.wholeNumberValue }
        guard digits.count >= 13 && digits.count <= 19 else {
            return false
        }

        var sum = 0
        var shouldDouble = false
        for digit in digits.reversed() {
            var contribution = digit
            if shouldDouble {
                contribution *= 2
                if contribution > 9 {
                    contribution -= 9
                }
            }
            sum += contribution
            shouldDouble.toggle()
        }
        return sum % 10 == 0
    }

    private static func collectMatches(
        in text: String,
        regex: NSRegularExpression,
        category: PiiCategory,
        captureGroup: Int = 0
    ) -> [Candidate] {
        let nsText = text as NSString
        let matches = regex.matches(in: text, range: NSRange(location: 0, length: nsText.length))
        var results: [Candidate] = []
        results.reserveCapacity(matches.count)

        for match in matches {
            guard captureGroup < match.numberOfRanges else { continue }
            let range = match.range(at: captureGroup)
            guard range.location != NSNotFound, range.length > 0 else { continue }
            let substring = nsText.substring(with: range)
            results.append(
                Candidate(
                    range: range,
                    original: substring,
                    category: category,
                    priority: category.priority
                )
            )
        }
        return results
    }

    private static func collectCardMatches(in text: String) -> [Candidate] {
        collectMatches(in: text, regex: cardNumberRegex, category: .account).filter {
            passesLuhn($0.original)
        }
    }

    private static func resolveOverlaps(_ candidates: [Candidate]) -> [Candidate] {
        let ordered = candidates.sorted { left, right in
            if left.range.location != right.range.location {
                return left.range.location < right.range.location
            }
            if left.priority != right.priority {
                return left.priority > right.priority
            }
            return left.range.length > right.range.length
        }

        var accepted: [Candidate] = []
        for candidate in ordered {
            let candidateEnd = NSMaxRange(candidate.range)
            let overlaps = accepted.contains { existing in
                let existingEnd = NSMaxRange(existing.range)
                return candidate.range.location < existingEnd && candidateEnd > existing.range.location
            }
            if !overlaps {
                accepted.append(candidate)
            }
        }

        return accepted.sorted { $0.range.location < $1.range.location }
    }

    private static func makeDiffSegments(original: String, entities: [PiiEntity]) -> [DiffSegment] {
        let nsOriginal = original as NSString
        var segments: [DiffSegment] = []
        var cursor = 0

        for entity in entities {
            if entity.range.location > cursor {
                let text = nsOriginal.substring(with: NSRange(location: cursor, length: entity.range.location - cursor))
                segments.append(DiffSegment(id: "u-\(cursor)", kind: .unchanged, text: text))
            }
            segments.append(
                DiffSegment(
                    id: "e-\(entity.range.location)-\(entity.token)",
                    kind: .entity,
                    text: entity.token,
                    token: entity.token,
                    category: entity.category
                )
            )
            cursor = NSMaxRange(entity.range)
        }

        if cursor < nsOriginal.length {
            segments.append(
                DiffSegment(id: "u-\(cursor)", kind: .unchanged, text: nsOriginal.substring(from: cursor))
            )
        }

        return segments
    }
}
