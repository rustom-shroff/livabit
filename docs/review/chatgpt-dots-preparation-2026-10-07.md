# Collector acceptance and ChatGPT dots preparation

Date: **2026-10-07**. The user accepts inspector 0.2.4 for continued development and selects **ChatGPT dots** as the first target under [ADR-0010](../decisions/0010-collector-accepted-and-chatgpt-dots-priority.md). Further precise-duration and complete-coverage proof is deferred and can resume if useful operation exposes a problem.

The roadmap, product requirements, acceptance status, traceability, Android measurement plan and integration plan now reflect that priority. All **33 requirement IDs and 29 acceptance mappings** remain stable. The original collector-first ADR and all **56 audited native inputs** remain byte-for-byte unchanged; the new decision is recorded separately. No APK was rebuilt or changed and no additional Android accuracy experiment was run.

## Concrete preparation

The [current source refresh](../research/chatgpt-dots-integration-2026-10-07.md) and [dots native profile proposal](../integration-drafts/chatgpt-dots-profile.md) describe the proposed direct connection and its remaining setup work. Target selection does not enable a runtime profile or claim account eligibility. The existing capability catalog stays a dated, all-disabled research snapshot.

The [new packet generator](liveabit-skill-review-packets.md) prepares **18 synthetic interpretation cases**, with **36 separate agent/reviewer files** and a source/file-bound manifest. It preserves exact event identities, duplicates, missing pages, partial coverage and evaluation time. Agent inputs omit expected outcomes, rubric answers and reviewer-resource links. Reviewer observations begin unanswered and score as `unobserved`.

The root-generated [review package manifest](../../artifacts/liveabit-skill-review/run-cc2cc7df-b7b4-4ddd-8af9-7519bd43959b/manifest.json) records those files and their identities. Supply only an individual agent packet in a separately authorized evaluation; keep its manifest and reviewer resources separate. Generating packets is not observed dot behavior, authenticated delivery or M2 evidence.

## Validation and limits

The five focused packet tests passed on their first run. The full reference suite subsequently completed with **236 passed, zero failed and one explicitly documented fixture exclusion skipped**. It covered the new preparation tests alongside existing consent, restart, bounds, protocol, receiver and isolated local TLS cases. Local deterministic test traffic is separate from external agent integration.

Root review checked packet manifests/hashes and unchanged native inputs. Independent review checked the progression documents and profile proposal; corrections clarified native event occurrence as an OAP page becoming available, kept app-use times inside the page, scoped private-memory restrictions to the device publisher/packets/logs, and replaced stale host-choice wording with actual dot/account setup. Review did not create new runtime evidence.

No existing dot/account was contacted, no plugin/tunnel/credential was created, no model was invoked and no real activity was shared. The current inspector remains local-only. The next integration work is the reviewed native control/delivery implementation and a synthetic pilot in the actual existing dot once its supported setup is available. Android same-device ingress and distribution remain separate questions; no desktop forwarding dependency or hosted workaround is permitted. Further duration/coverage experiments are outside this immediate path. M2/M3 remain separate, unproven milestones, and Linux remains deferred.
