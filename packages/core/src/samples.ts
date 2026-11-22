export type SampleScenarioId =
  | "freelance-msa"
  | "medical-invoice"
  | "enterprise-dpa";

export interface SampleScenario {
  id: SampleScenarioId;
  title: string;
  description: string;
  kind: "text" | "multimodal";
  text: string;
  imagePath?: string;
  focusAreas: string[];
  synthetic: true;
}

const FREELANCE_MSA = `MASTER SERVICES AGREEMENT

This Master Services Agreement is entered into on March 14, 2026 by Cobalt Harbor Consulting LLC, a Delaware limited liability company, and its independent contractor.

Contractor: Arjun Mehta
Email: arjun.mehta@example.com
Phone: (415) 555-0142
Social Security Number: 123-45-6789
Mailing address: 1288 Market Street, San Francisco, CA 94103

1. SERVICES
Contractor will provide product strategy, technical research, and delivery support for the client's document review platform. The statement of work may be updated by the client from time to time, and contractor will use commercially reasonable efforts to accommodate changes requested through email.

2. FEES AND PAYMENT
Client will pay approved invoices within ninety days after receipt. Client may withhold payment for any amount it disputes in good faith, even when the disputed amount is unrelated to undisputed work. Contractor bears all collection costs and may not suspend services without thirty days written notice.

3. INTELLECTUAL PROPERTY
Contractor assigns to client all right, title, and interest in every invention, note, model, prompt, workflow, design, document, and derivative work created before, during, or after the engagement that relates in any way to client's actual or contemplated business. This assignment is perpetual, worldwide, irrevocable, and includes moral rights to the extent permitted by law. Contractor retains no license to reuse generic know-how.

4. INDEMNIFICATION
Contractor will defend, indemnify, and hold harmless client and its affiliates from any claim, loss, penalty, settlement, or expense arising from contractor's services, whether or not caused by contractor's negligence and without any cap on liability.

5. TERM AND RENEWAL
The initial term is twelve months. The agreement automatically renews for successive twelve month terms unless either party provides written notice of non-renewal at least one hundred twenty days before the current term ends. Client may terminate for convenience on five days notice.

6. CONFIDENTIALITY
Contractor must protect all client information indefinitely, including information that is publicly available or independently developed. Contractor may not disclose the existence of the engagement without prior written approval.

7. INSURANCE AND COMPLIANCE
Contractor will maintain commercial general liability, professional liability, cyber liability, and workers compensation coverage at limits acceptable to client and will name client as an additional insured. Contractor is solely responsible for all taxes related to the engagement.

8. GOVERNING LAW
This agreement is governed by Delaware law. Any dispute must be brought exclusively in New Castle County, Delaware, and each party waives the right to a jury trial.`;

const MEDICAL_INVOICE = `MULTIMODAL BILLING AUDIT

Source document: /samples/sample-invoice.png
Provider: Northstar Spine & Rehab Clinic
Patient: Maya Lin
Medical record number: MRN-482910
Date of service: February 9, 2026
Claim reference: NSR-2026-0209-4471
Payer: Meridian Health Plan

Invoice lines shown in the attached image:
- Office consultation, established patient, 30 minutes: $260.00
- Lumbar spine imaging, technical component: $420.00
- Lumbar spine imaging, technical component, repeated line: $420.00
- Facility surcharge: $185.00
- Physical therapy evaluation: $310.00

Reviewer note: The imaging charge appears twice with the same procedure code and same date of service. The $185.00 facility surcharge is unitemized and has no supporting description, room charge, supply code, or contract reference. The provider's public fee schedule lists the imaging technical component at $320.00, which is $100.00 above the amount shown here.

The claim also includes a prior authorization number ending in 84 that is not present in the uploaded image. Ask the billing office to identify the source of that authorization and confirm whether the duplicate imaging line was corrected before submission.`;

const ENTERPRISE_DPA = `ENTERPRISE SAAS DATA PROCESSING ADDENDUM

This Data Processing Addendum is part of the Enterprise SaaS Subscription Agreement between Alder & Finch Technologies Inc. and the customer identified in the order form. It applies to personal data processed through the VeilBrief Audit Cloud and related support services.

Customer notice contact:
Name: Elena Vasquez
Attn: Privacy Operations
Email: elena.vasquez@example.com
Phone: (212) 555-0187
Address: 455 Madison Avenue, New York, NY 10022

Processor security contact:
Name: Daniel Okafor
Email: daniel.okafor@example.com
Phone: (646) 555-0114

1. DEFINITIONS AND INTERPRETATION
For purposes of this Addendum, "Personal Data" means any information relating to an identified or identifiable natural person that is submitted to the Services by or on behalf of Customer, including text, images, metadata, support messages, audit records, and derived classifications. "Processing" means any operation performed on Personal Data, including collection, recording, organization, storage, adaptation, retrieval, consultation, disclosure, alignment, restriction, erasure, and destruction. "Data Protection Laws" means all privacy and data protection laws applicable to the processing, including the California Consumer Privacy Act as amended, the California Privacy Rights Act, the Virginia Consumer Data Protection Act, the Colorado Privacy Act, the Connecticut Data Privacy Act, and any substantially similar state law that becomes effective during the term. The terms "controller," "business," "processor," "service provider," "data subject," and "consumer" have the meanings given in the applicable Data Protection Laws. If a term is defined differently across laws, the definition that provides the greater protection for the data subject applies to the relevant processing. This Addendum does not create an employment relationship, joint controllership, partnership, or agency relationship between the parties. The order form controls commercial terms, the subscription agreement controls general contract terms, and this Addendum controls privacy and security terms in the event of a conflict.

2. ROLES AND SCOPE OF PROCESSING
Customer is the controller or business for Personal Data submitted to the Services. Alder & Finch acts as processor or service provider except where it determines the purposes and means of processing account security logs or uses aggregated data for service integrity. The subject matter of processing is the provision of document audit, local redaction, optional cloud inference, storage of scrubbed audit metadata, customer support, billing, abuse prevention, and service diagnostics. The duration of processing is the term of the subscription plus the deletion period described in Section 11. The nature of processing includes receiving files, extracting text, identifying sensitive information, generating redaction tokens, transmitting scrubbed content to an approved inference provider when the customer elects a cloud route, evaluating contract terms, and storing audit metadata. The categories of data subjects may include Customer employees, contractors, applicants, patients, clients, consumers, vendors, signatories, and other individuals whose information appears in submitted documents. The categories of Personal Data may include names, contact details, government identifiers, financial account information, health information, employment information, commercial terms, signatures, images, and any other data Customer chooses to submit. Customer is responsible for establishing a lawful basis, providing notices, obtaining consents where required, and ensuring that instructions are lawful. Alder & Finch will not sell Personal Data, retain it for advertising, or combine it with data received from another source except as permitted for a service provider under applicable law.

3. CUSTOMER INSTRUCTIONS
Alder & Finch will process Personal Data only on documented instructions from Customer, including instructions in the subscription agreement, this Addendum, configuration settings selected by an authorized administrator, and written support requests. The parties agree that Customer's use of local on-device inference is an instruction not to transmit document content to the cloud for that run. Selection of a cloud-required mode, upload of a document to a server endpoint, or activation of a cloud-backed integration constitutes an instruction to process the scrubbed payload in the cloud. Alder & Finch will promptly inform Customer if an instruction appears to violate Data Protection Laws, unless a law prohibits providing that information. Alder & Finch may suspend the affected processing while the parties resolve the issue. Alder & Finch will not process Personal Data for its own purposes, except to maintain security, prevent fraud, debug failures, comply with law, or improve the Services using aggregated or de-identified information that cannot reasonably be linked to a person. Any legally required disclosure must be limited to the information required, and Alder & Finch will notify Customer unless legally prohibited. Customer may issue additional written instructions through the administrator console, and those instructions become part of this Addendum when accepted by the processor. Alder & Finch may refuse an instruction that would require unlawful processing, create an unreasonable security risk, or materially alter the subscribed service.

4. CONFIDENTIALITY AND PERSONNEL
Alder & Finch will ensure that personnel authorized to process Personal Data are bound by appropriate confidentiality obligations that survive termination. Access is limited to personnel who need it to provide, secure, support, or audit the Services. Alder & Finch maintains role-based access controls, periodic access reviews, unique user accounts, multi-factor authentication for administrative systems, logging of privileged actions, and prompt removal of access when personnel change roles or leave. Personnel receive privacy and security training at onboarding and at least annually. Alder & Finch will not permit any subprocessor to process Personal Data unless the subprocessor is subject to written terms that provide protections substantially similar to this Addendum. Customer may request a summary of the processor's access-control framework and recent independent audit results. Alder & Finch will notify Customer without undue delay after discovering unauthorized access by personnel. The notification will include the known facts, affected systems, containment steps, and a contact for follow-up. Alder & Finch will cooperate with Customer's reasonable investigation and will not make public statements about an incident that identify Customer without approval, except where law requires disclosure.

5. SECURITY PROGRAM
Alder & Finch will implement and maintain administrative, technical, and physical safeguards appropriate to the risk, taking into account the nature, scope, context, and purposes of processing. The security program includes encryption of data in transit using current industry protocols, encryption of stored audit metadata, network segmentation, secure software development practices, dependency review, vulnerability management, endpoint protection, backup controls, disaster recovery testing, and incident response procedures. Document uploads are processed in isolated workers. Local redaction occurs before any cloud request when the route policy requires a shield. Firestore records contain scrubbed metadata and findings rather than original document text. Logs are designed to avoid payload content, credentials, and token maps. Production access requires approved business need, strong authentication, and audit logging. Alder & Finch will maintain a written information security program, review it at least annually, and update controls when risks or technology change. No security measure can eliminate every risk, and Customer acknowledges that it remains responsible for deciding whether a document is appropriate for the selected processing route. Alder & Finch will promptly remediate confirmed critical vulnerabilities and will provide reasonable evidence of remediation on request.

6. SUBPROCESSORS AND PRIOR NOTICE
Customer authorizes the subprocessors listed in Schedule A. Alder & Finch may add or replace a subprocessor if the change does not materially decrease the protection of Personal Data. Alder & Finch will provide at least thirty days prior notice through the administrator console or by email to the privacy contact. Customer may object in writing within fifteen days on reasonable data protection grounds. The parties will discuss the objection in good faith. If they cannot resolve it, Customer may terminate the affected service without penalty by written notice before the subprocessor begins processing. Alder & Finch remains responsible for the performance of each subprocessor to the same extent it is responsible for its own performance. A subprocessor agreement must include confidentiality, security, breach notification, deletion, audit, international transfer, and instruction-limiting obligations. Subprocessors may not further subcontract material processing without equivalent written obligations. Alder & Finch will maintain a current list of subprocessors and will provide the country of processing for each. Emergency replacement of a failed subprocessor may occur before notice where necessary to preserve service continuity, provided that Alder & Finch gives notice within five business days and applies equivalent protections.

7. INTERNATIONAL TRANSFERS
Where Personal Data is transferred from the European Economic Area, United Kingdom, or Switzerland to a country without an adequacy decision, the parties will rely on the applicable standard contractual clauses, the UK International Data Transfer Addendum, or another lawful transfer mechanism. Customer authorizes Alder & Finch to enter into the standard contractual clauses with relevant subprocessors on Customer's behalf. The parties agree that Customer is the data exporter and Alder & Finch is the data importer for transfers initiated by Customer. Alder & Finch will implement supplementary technical and organizational measures, including encryption in transit, access controls, minimization, and transparency about government requests. Alder & Finch will challenge unlawful or overbroad requests where legally permitted and will redirect the requester to Customer when appropriate. If a transfer mechanism is invalidated or no longer provides adequate protection, the parties will promptly adopt a replacement mechanism or suspend the affected transfer. Alder & Finch will maintain records of transfer mechanisms and make them available to Customer on reasonable request. Nothing in this section limits a data subject's rights or a supervisory authority's powers.

8. DATA SUBJECT REQUESTS
Alder & Finch will provide reasonable assistance to Customer in responding to requests to access, correct, delete, restrict, port, or object to processing. Alder & Finch will not respond to a data subject request on Customer's behalf unless instructed or legally required. If Alder & Finch receives a request directly, it will forward the request to Customer without undue delay and will not disclose Personal Data to the requester without verification and authorization. The administrator console provides tools to search scrub metadata, export a user's audit index, and delete audit records. Where a request concerns content that was processed only on-device and never stored, Alder & Finch may have no ability to retrieve that content and will explain the limitation. Assistance is included in the subscription fee for routine requests. If a request requires substantial custom engineering or legal review, the parties will agree on a reasonable fee before work begins. Alder & Finch will maintain a record of request referrals and actions taken, excluding the content of the request where minimization is appropriate.

9. DATA PROTECTION IMPACT ASSESSMENTS
Alder & Finch will provide information reasonably necessary for Customer to conduct a data protection impact assessment, transfer impact assessment, legitimate interest assessment, or similar evaluation. Available materials may include a security overview, subprocessor list, data-flow diagram, retention schedule, audit report summary, and description of the local shield. Alder & Finch is not responsible for Customer's determination that the processing is lawful or that a particular document may be submitted. Customer should avoid uploading special category data unless the selected configuration and legal basis support it. The Services are not intended for emergency medical decision-making, employment eligibility determinations, credit decisions, or other high-impact decisions without human review. Customer will not use audit output as the sole basis for denying a person a service, benefit, or opportunity.

10. AUDIT AND ASSURANCE
Customer may audit Alder & Finch's compliance with this Addendum no more than once in any twelve month period, unless a regulator requires additional review or a material incident occurs. Audits must be conducted during business hours, under confidentiality, and without disrupting production systems. Alder & Finch may satisfy an audit request with a current SOC 2 Type II report, ISO 27001 certificate, penetration test summary, completed security questionnaire, or other independent evidence. On-site access is not required unless the supplied evidence is insufficient and the parties agree that an on-site review is necessary. Customer bears its own audit costs and any reasonable costs incurred by Alder & Finch for unusual assistance. Auditors may not access Personal Data belonging to another customer. Alder & Finch will track remediation findings and provide status updates at reasonable intervals.

11. RETURN AND DELETION
On termination or expiration, Alder & Finch will make scrubbed audit metadata available for export for thirty days. After that period, the processor will delete production records according to the retention schedule, except where law requires retention or where records are held in encrypted backups. Backups are deleted on a rolling schedule not exceeding ninety days. Customer may request earlier deletion of audit metadata through the administrator console. Alder & Finch will confirm deletion in writing on request. Deletion instructions do not apply to content that was processed only on-device and never transmitted to Alder & Finch. Token maps generated in the browser or extension remain under Customer's control and are not transmitted to Alder & Finch unless a customer engineer explicitly configures a support export. Alder & Finch will not retain Personal Data for the purpose of training a general-purpose model. Aggregated metrics that cannot reasonably identify a person may be retained for service analytics.

12. BREACH NOTIFICATION
Alder & Finch will notify Customer without undue delay after confirming a personal data breach affecting Customer data. The initial notice will describe the nature of the breach, the categories and approximate volume of data involved, the likely consequences, measures taken to contain the incident, and the name and contact details of the response lead. Alder & Finch will provide additional information as it becomes available and will cooperate with Customer's notifications to regulators or individuals. Alder & Finch may delay notification if a competent authority determines that delay is necessary for security or investigation. The processor will document the incident, affected systems, remediation steps, and decisions made during response. Notifications will be sent to the customer privacy contact and the account administrator. Customer is responsible for determining whether notification to regulators or data subjects is required. Alder & Finch will not charge for reasonable breach-response cooperation.

13. LOCAL PII SHIELD AND CLOUD ESCALATION
The Services use a deterministic local detector to replace sensitive values with typed tokens before a cloud request when the active policy requires a shield. Detected categories include email addresses, phone numbers, tax identifiers, account numbers, street addresses, labeled person names, and optionally monetary amounts. Token maps are kept in the caller's local runtime and are not included in Firestore audit records. The cloud model receives scrubbed content. The caller rehydrates suggested edits locally after the model returns a tokenized result. When a document exceeds the on-device character or token budget, the routing policy may escalate to the configured cloud model. Remote Config can supply model names and policy defaults, but deprecated model identifiers are rejected. Customer acknowledges that local detection is defense in depth and not a guarantee that every sensitive value will be recognized. High-risk documents should be reviewed before cloud escalation. Alder & Finch will publish release notes when detection patterns or routing defaults change materially.

14. MODEL AND SERVICE PROVIDER TERMS
Cloud inference may be performed by a model provider listed in Schedule A. Alder & Finch configures the provider not to use customer payloads for model training where the provider offers that control. The provider may process transient requests for abuse prevention and service operation under its enterprise terms. Alder & Finch will not send raw prompt content to analytics systems. Customer data is not used to improve a shared model unless Customer gives separate written consent. Generated output is probabilistic and may be incomplete or incorrect. Customer remains responsible for legal review and for accepting or rejecting recommended edits. Alder & Finch may change models when a supported model is retired, provided that the replacement maintains or improves the documented security and routing properties. Model names in this Addendum are illustrative and Remote Config controls the active values.

15. DATA MINIMIZATION AND RETENTION
Customer should submit only documents necessary for the audit. Administrators can configure amount masking, disable cloud modes, set a lower on-device character threshold, and require local-only processing for sensitive matters. Audit records include route type, inference source, risk level, red-flag categories, timestamps, and scrubbed descriptions. Original document text, token maps, and unredacted suggested edits must not be written to Firestore. Application logs must not include request bodies, base64 image data, or authentication tokens. Temporary processing files must be deleted after the request completes or after a short recovery window. Support exports require explicit customer action and expire automatically. The retention schedule is available in the trust center and may be updated with thirty days notice where law permits.

16. INSURANCE AND BUSINESS CONTINUITY
Alder & Finch will maintain cyber liability, technology errors and omissions, general liability, and workers compensation coverage at limits customary for a service of similar scope. Certificates of insurance are available under confidentiality on request. The processor will maintain a business continuity plan, backup strategy, and disaster recovery objectives appropriate to the service tier. Annual exercises test restoration of authentication, audit storage, and core document workflows. A material change to hosting regions or backup geography is handled as a subprocessor or transfer change where required by this Addendum.

17. LIABILITY AND ORDER OF PRECEDENCE
Each party's liability for privacy and security obligations is subject to the limitations in the subscription agreement, except where applicable law prohibits a limitation. Nothing in this Addendum limits a data subject's rights, a regulator's authority, or a party's obligation to provide mandatory breach notification. If this Addendum conflicts with the subscription agreement on the processing of Personal Data, this Addendum controls. If a standard contractual clause conflicts with this Addendum, the clause controls to the extent necessary for a valid transfer. Headings are for convenience only. Invalid provisions will be limited or replaced to preserve the parties' intent.

18. SIGNATURES
Customer: Helena Brooks, Chief Operating Officer
Signatory: Helena Brooks
Email: helena.brooks@example.com
Processor: Alder & Finch Technologies Inc.
Signatory: Daniel Okafor
Email: daniel.okafor@example.com

SCHEDULE A: APPROVED SUBPROCESSORS
- Harbor Compute Inc. provides isolated inference workers in the United States. Security contact: ops.security@harborcompute.example.
- Northline Object Storage provides encrypted document staging in the United States and Canada. Security contact: trust@northline.example.
- Meridian Identity Services provides authentication and abuse prevention. Security contact: security@meridianidentity.example.
- Copperfield Support Systems provides ticketing and customer support. Access is limited to scrubbed metadata. Privacy contact: privacy@copperfield.example.

ANNEX 1: TECHNICAL AND ORGANIZATIONAL MEASURES
Access to production systems is governed by least privilege, strong authentication, approval workflows, and session logging. Segregation of duties separates deployment approval from code authorship. Secrets are held in a managed secret store and rotated after exposure or personnel departure. Endpoints run supported operating systems with full-disk encryption and endpoint detection. Networks are segmented between public ingress, application services, data stores, and administrative tooling. Data stores use encryption at rest with managed keys and encrypted backups. Security monitoring alerts on anomalous authentication, privilege escalation, unusual export volume, and unexpected egress. Vulnerability scans run continuously, and critical findings are remediated under a documented service level. Software dependencies are pinned and reviewed before release. Personnel complete privacy, security, and incident-response training. Visitors are escorted in facilities that process production data. Media containing Personal Data is sanitized before disposal. Incident response contacts are maintained for Customer and each critical subprocessor. Restoration tests cover audit metadata and authentication services. Change management requires rollback plans for material releases. Logs are retained for security investigation and exclude document payloads. Monitoring systems use sampled technical metadata rather than customer content.`;

export const SAMPLE_SCENARIOS: SampleScenario[] = [
  {
    id: "freelance-msa",
    title: "Freelance consulting MSA",
    description:
      "A contractor agreement with aggressive payment, ownership, indemnity, and renewal terms.",
    kind: "text",
    text: FREELANCE_MSA,
    focusAreas: [
      "Net-90 payment window",
      "Perpetual intellectual property assignment",
      "Uncapped indemnity",
      "Auto-renewal notice trap",
    ],
    synthetic: true,
  },
  {
    id: "medical-invoice",
    title: "Multimodal billing audit",
    description:
      "An invoice image paired with claim notes that expose duplicate imaging and an unsupported facility charge.",
    kind: "multimodal",
    text: MEDICAL_INVOICE,
    imagePath: "/samples/sample-invoice.png",
    focusAreas: [
      "Duplicate $420.00 imaging fee",
      "$185.00 unitemized facility surcharge",
      "Unsupported prior authorization reference",
    ],
    synthetic: true,
  },
  {
    id: "enterprise-dpa",
    title: "Enterprise data processing addendum",
    description:
      "A long SaaS DPA with privacy contacts, transfer terms, security obligations, and named subprocessors.",
    kind: "text",
    text: ENTERPRISE_DPA,
    focusAreas: [
      "Cloud escalation above the on-device character limit",
      "Subprocessor notice and objection rights",
      "Breach notification",
      "International transfer safeguards",
    ],
    synthetic: true,
  },
];
