import assert from "node:assert/strict";
import { CREDIT_COST, waterfallEmailCost } from "../src/services/billing.service.js";
import { matchWaterfallCandidate } from "../src/services/email-waterfall.service.js";
import type { MaribizPerson } from "../src/services/maribiz/client.js";

let passed = 0;
const test = (label: string, fn: () => void) => {
  fn();
  passed += 1;
  console.log(`  ok  ${label}`);
};

const candidate = {
  externalId: "apollo-123",
  firstName: "Ana",
  lastName: "D'Souza",
  companyName: "Oceanic Ship Management Ltd.",
  personLinkedinUrl: "https://www.linkedin.com/in/ana-dsouza/",
};

const person = (patch: Partial<MaribizPerson> = {}): MaribizPerson => ({
  id: 1,
  person_name: "Ana D'Souza",
  person_first_name: "Ana",
  person_last_name: "D'Souza",
  person_title: "Technical Superintendent",
  person_seniority: "manager",
  person_email_status: "Verified",
  email_confidence: 98,
  person_email: "ana@oceanic.example",
  person_phone: null,
  person_sanitized_phone: null,
  person_linkedin_url: "linkedin.com/in/ana-dsouza",
  person_detailed_function: null,
  organization_name: "Oceanic Ship Management",
  location_city: null,
  location_state: null,
  location_country: "Singapore",
  person_vacuumed_at: null,
  created_at: null,
  ...patch,
});

console.log("waterfall pricing");
test("one search always costs exactly 20 credits", () => {
  assert.equal(CREDIT_COST.WATERFALL_EMAIL, 20);
  assert.equal(waterfallEmailCost(1), 20);
});
test("permission dialog totals scale with the exact contact count", () => {
  assert.equal(waterfallEmailCost(7), 140);
  assert.equal(waterfallEmailCost(0), 0);
});

console.log("identity safety");
test("a normalized LinkedIn URL is a strong identity match", () => {
  assert.equal(matchWaterfallCandidate(candidate, person()), true);
});
test("exact normalized name plus company is accepted without LinkedIn", () => {
  assert.equal(
    matchWaterfallCandidate(
      { ...candidate, personLinkedinUrl: null },
      person({ person_linkedin_url: null }),
    ),
    true,
  );
});
test("the same name at a different company is rejected", () => {
  assert.equal(
    matchWaterfallCandidate(
      { ...candidate, personLinkedinUrl: null },
      person({ person_linkedin_url: null, organization_name: "Unrelated Logistics" }),
    ),
    false,
  );
});
test("a different person at the same company is rejected", () => {
  assert.equal(
    matchWaterfallCandidate(
      { ...candidate, personLinkedinUrl: null },
      person({ person_linkedin_url: null, person_name: "Anita D'Souza", person_first_name: "Anita" }),
    ),
    false,
  );
});

console.log(`\n${passed}/${passed} passed`);
