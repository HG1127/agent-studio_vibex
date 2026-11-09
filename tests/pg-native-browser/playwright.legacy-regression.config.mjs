// Original employee browser regression only; the three PG18 genuine purposes
// retain their own workflows and the unchanged base config. No test is deleted.
import {defineConfig} from "@playwright/test"
import base from "./playwright.config.mjs"
export const originalEmployeeBrowserSpecs=Object.freeze([
  "agent-derived-memory.spec.mjs",
  "agent-descriptive-patch.spec.mjs",
  "agent-feedback.spec.mjs",
  "agent-generated-acceptance.spec.mjs",
  "agent-human-input.spec.mjs",
  "agent-memory-failure-source.spec.mjs",
  "agent-memory-runtime.spec.mjs",
  "agent-memory.spec.mjs",
  "agent-optimization.spec.mjs",
  "agent-outcome-memory.spec.mjs",
  "agent-review.spec.mjs",
  "autonomous-agent.spec.mjs",
  "collaboration.spec.mjs",
  "company-overview.spec.mjs",
  "company-worker-heartbeats.spec.mjs",
  "employee-run.spec.mjs",
  "employees.spec.mjs",
  "knowledge-semantic.spec.mjs",
  "knowledge-sharing.spec.mjs",
  "releases.spec.mjs",
  "schedule.spec.mjs",
  "workflow-canvas.spec.mjs",
  "workflow-human-input.spec.mjs"
])
export default defineConfig({...base,testMatch:originalEmployeeBrowserSpecs.map(name=>"**/"+name)})
