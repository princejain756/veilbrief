import Foundation

public struct SampleScenario: Identifiable, Equatable, Sendable {
    public let id: String
    public let title: String
    public let subtitle: String
    public let text: String
    public let focusAreas: [String]
}

public enum SampleLibrary {
    public static let all: [SampleScenario] = [
        SampleScenario(
            id: "freelance-msa",
            title: "Freelance consulting MSA",
            subtitle: "Net-90 payment, perpetual IP assignment, uncapped indemnity",
            text: """
            MASTER SERVICES AGREEMENT

            This Master Services Agreement is entered into on March 14, 2026 by Cobalt Harbor Consulting LLC and its independent contractor.

            Contractor: Arjun Mehta
            Email: arjun.mehta@example.com
            Phone: (415) 555-0142
            Social Security Number: 123-45-6789
            Mailing address: 1288 Market Street, San Francisco, CA 94103

            1. FEES AND PAYMENT
            Client will pay approved invoices within ninety days after receipt. Client may withhold payment for any amount it disputes in good faith. Contractor bears all collection costs and may not suspend services without thirty days written notice.

            2. INTELLECTUAL PROPERTY
            Contractor assigns to client all right, title, and interest in every invention, note, model, prompt, workflow, and derivative work created before, during, or after the engagement that relates in any way to client's business.

            3. INDEMNIFICATION
            Contractor will defend and indemnify client from any claim or expense arising from contractor's services without any cap on liability.

            4. TERM AND RENEWAL
            The initial term is twelve months and automatically renews for successive twelve month terms unless written notice is provided 120 days before renewal. Client may terminate for convenience on five days notice.
            """,
            focusAreas: [
                "Net-90 payment window",
                "Perpetual IP assignment",
                "Uncapped liability",
                "120-day auto-renewal notice trap",
            ]
        ),
        SampleScenario(
            id: "medical-invoice",
            title: "Clinic billing audit",
            subtitle: "Duplicate lumbar MRI charge and unitemized facility fee",
            text: """
            BILLING STATEMENT AUDIT

            Provider: Northstar Spine & Rehab Clinic
            Patient: Maya Lin
            Medical record number: MRN-482910
            Phone: (415) 555-0194
            Email: maya.lin@example.com
            Claim reference: NSR-2026-0209-4471

            Itemized lines:
            - Office consultation, established patient: $260.00
            - Lumbar MRI Scan: $420.00
            - Lumbar MRI Scan (duplicate line, same CPT code and date): $420.00
            - Facility Surcharge (unitemized): $185.00
            - Physical therapy evaluation: $310.00
            - Total Due: $1,840.00
            """,
            focusAreas: [
                "Duplicate $420.00 MRI fee",
                "Unitemized $185.00 facility surcharge",
                "Line-item arithmetic discrepancy",
            ]
        ),
        SampleScenario(
            id: "enterprise-dpa",
            title: "Enterprise DPA notice",
            subtitle: "Long addendum crossing on-device threshold for cloud escalation",
            text: String(repeating: """
            ENTERPRISE SAAS DATA PROCESSING ADDENDUM

            Customer: Helena Brooks
            Email: helena.brooks@example.com
            Phone: (212) 555-0187
            Address: 455 Madison Avenue, New York, NY 10022
            Processor security contact: Daniel Okafor
            Email: daniel.okafor@example.com

            1. LOCAL PII SHIELD AND CLOUD ESCALATION
            Deterministic local tokenization replaces personal identifiers before scrubbed cloud requests. Token maps remain on the caller device and are never persisted to Firestore audit history.

            2. SUBPROCESSOR NOTICE AND AUDIT
            Processor provides thirty days advance written notice before adding a subprocessor. Customer may object within fifteen days on reasonable data protection grounds and terminate without penalty if unresolved.

            """, count: 16),
            focusAreas: [
                "Cloud escalation with zero raw PII egress",
                "30-day subprocessor objection right",
                "Token-map locality",
            ]
        ),
    ]
}
