import XCTest
@testable import VeilBriefCore

final class PIIShieldTests: XCTestCase {
    func testDetectsReplacesAndRehydratesPiiCleanly() throws {
        let source = """
        Contractor: Arjun Mehta
        Email: arjun.mehta@example.com
        Phone: (415) 555-0142
        SSN: 123-45-6789
        MRN-482910
        Address: 1288 Market Street, San Francisco, CA 94103
        Fee: $1,280.50
        """

        let result = PIIShield.shield(source, options: ShieldOptions(maskAmounts: true))
        XCTAssertNoThrow(try PIIShield.assertNoRawPii(scrubbed: result.scrubbed, entities: result.entities))
        XCTAssertFalse(result.scrubbed.contains("arjun.mehta@example.com"))
        XCTAssertFalse(result.scrubbed.contains("123-45-6789"))
        XCTAssertFalse(result.scrubbed.contains("Arjun Mehta"))
        XCTAssertTrue(result.scrubbed.contains("[EMAIL_1]"))
        XCTAssertTrue(result.scrubbed.contains("[TAX_ID_1]"))

        let restored = PIIShield.rehydrate(result.scrubbed, tokenMap: result.tokenMap)
        XCTAssertEqual(restored, source)
    }

    func testDoesNotMisclassifyLegalClausesAsPersonNamesAndPropagatesRepeatedPerson() throws {
        let contract = """
        Contractor: Arjun Mehta
        2. FEES AND PAYMENT
        Client shall pay approved invoices within ninety days after receipt.
        Contractor will deliver work and Arjun Mehta retains background tooling.
        Attn: Privacy Operations
        """

        let shielded = PIIShield.shield(contract, options: ShieldOptions(maskAmounts: true))
        XCTAssertTrue(shielded.scrubbed.contains("Client shall pay approved invoices"))
        XCTAssertTrue(shielded.scrubbed.contains("Contractor will deliver work"))
        XCTAssertTrue(shielded.scrubbed.contains("Attn: Privacy Operations"))
        XCTAssertFalse(shielded.scrubbed.contains("Arjun Mehta"))
        XCTAssertNoThrow(try PIIShield.assertNoRawPii(scrubbed: shielded.scrubbed, entities: shielded.entities))
        XCTAssertEqual(PIIShield.rehydrate(shielded.scrubbed, tokenMap: shielded.tokenMap), contract)
    }

    func testSupportsPanIbanMod97IndianAddressAndApostropheNames() {
        let source = """
        Signatory: Anne-Marie O'Connor
        PAN: ABCDE1234F
        NonPAN: abcde1234f
        IBAN: DE89370400440532013000
        BadIBAN: DE00370400440532013000
        Mailing address: 42, 3rd Cross, J.P. Nagar 4th Phase, Bengaluru 560078
        """
        let shielded = PIIShield.shield(source)
        XCTAssertTrue(shielded.scrubbed.contains("[PERSON_1]"))
        XCTAssertTrue(shielded.scrubbed.contains("[TAX_ID_1]"))
        XCTAssertTrue(shielded.scrubbed.contains("abcde1234f"))
        XCTAssertFalse(shielded.scrubbed.contains("DE89370400440532013000"))
        XCTAssertTrue(shielded.scrubbed.contains("DE00370400440532013000"))
        XCTAssertFalse(shielded.scrubbed.contains("Bengaluru 560078"))
        XCTAssertTrue(PIIShield.passesIbanMod97("DE89370400440532013000"))
        XCTAssertFalse(PIIShield.passesIbanMod97("DE00370400440532013000"))
    }

    func testPassesLuhnAndReusesIdenticalTokens() {
        XCTAssertTrue(PIIShield.passesLuhn("4111 1111 1111 1111"))
        XCTAssertFalse(PIIShield.passesLuhn("4111 1111 1111 1112"))

        let input = "Contact: alice@example.com and backup email alice@example.com."
        let shielded = PIIShield.shield(input)
        XCTAssertEqual(shielded.tokenMap.count, 1)
        XCTAssertEqual(shielded.scrubbed, "Contact: [EMAIL_1] and backup email [EMAIL_1].")
    }

    func testRoutingPolicyRespectsOfflineAndLengthThresholds() {
        let shortRoute = RoutingPolicy.selectExecutionRoute(
            config: .default,
            context: RoutingContext(textLength: 400)
        )
        XCTAssertEqual(shortRoute.mode, .preferOnDevice)
        XCTAssertEqual(shortRoute.reason, .shortDocPreferOnDevice)
        XCTAssertEqual(shortRoute.targetCloudModel, "gemini-3.5-flash-lite")

        let offlineRoute = RoutingPolicy.selectExecutionRoute(
            config: .default,
            context: RoutingContext(textLength: 20_000, isOffline: true)
        )
        XCTAssertEqual(offlineRoute.mode, .onlyOnDevice)
        XCTAssertEqual(offlineRoute.reason, .offlineOnlyOnDevice)
        XCTAssertFalse(offlineRoute.mustScrubForCloud)

        let longRoute = RoutingPolicy.selectExecutionRoute(
            config: .default,
            context: RoutingContext(textLength: 15_000)
        )
        XCTAssertEqual(longRoute.mode, .preferInCloud)
        XCTAssertEqual(longRoute.reason, .longDocCloudScrubbed)
        XCTAssertTrue(longRoute.mustScrubForCloud)

        XCTAssertFalse(RoutingPolicy.isSupportedCloudModel("unsupported-model"))
        XCTAssertTrue(RoutingPolicy.isSupportedCloudModel("gemini-3.5-flash-lite"))
        XCTAssertTrue(RoutingPolicy.isSupportedCloudModel("gemini-3.8-flash"))
        XCTAssertTrue(RoutingPolicy.isSupportedCloudModel("gemini-4-hydrogen"))
    }
}
