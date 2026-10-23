# Safety, Regulatory, Privacy and Scientific Boundaries

> This is a hackathon prototype and should not be represented as regulatory, entomological, operational or flight certification.

## 1. Hard safety rules

1. **No real pesticide, larvicide or aerosol chemical dispersal code or practice in this repo.** Do not implement unbounded remote-activation routes for dispensing.
2. **No real autonomous UAV flight control**. Use images lawfully obtained elsewhere and simulator mission events. Real flight requires operator/site authorisation and aviation requirements.
3. **Controlled harmless water test only**, and only with a separate local bench controller, physical kill switch, no people nearby, mechanical containment, arm timeout, device heartbeat and fail-closed behavior. A website command must not be enough to arm the hardware.
4. Every mock spray is recorded as `TEST_WATER_DEMO` in `SIMULATED` or `BENCH_TEST` mode, never `pesticide_application` or `eggs_destroyed`.
5. Real treatment selection and operations belong to authorised qualified vector-control partners. Relevant pesticide regulations, product labels, environmental and neighbour protections apply.
6. **No live mosquito eggs or larvae incubated or released for the competition demo.** Use simulated pixels/reference images and an emergence-safe trap mockup.
7. Physical source reduction remains essential; spray cannot guarantee egg killing or site correction.

## 2. Verified aviation/regulatory constraints

CAAM publishes that Standard Authorisation to Fly is for lower-risk operations, explicitly excludes spraying/dispensing, and lists separate higher-risk approval categories such as UAWC agricultural operations and Special UAS Projects. **Do not assume that a residential mosquito spraying project automatically falls under a specific category**; consult CAAM and qualified operators for classification and permissions. The published Standard ATF process says submit at least 14 working days ahead of the proposed operation (not a guarantee of approval).

Reference: https://www.caam.gov.my/public/unmanned-aircraft-system-uas/

## 3. Entomology / scientific language rules

- Object detector recognises a *potential water-holding object*, not confirmed larvae, eggs, Aedes species or human infection.
- Ovitrap egg count is *sampled oviposition activity*; egg count can change after competing habitats are removed. Without careful sampling, it is not an estimate of total adult female abundance.
- Egg counts must reflect non-overlapping valid sampling windows; do not sum the same physical sample daily.
- Source-reduction actions (scrub/empty/cover/remove/repair) and larval-control actions are not synonymous with egg elimination or measured dengue reduction.
- Physical intervention result separate from surveillance trends and health outcome metrics.
- Ovitraps must be serviced and designed to prevent adult mosquito emergence; product readiness requires entomology expert validation.

References: https://www.cdc.gov/mosquitoes/pdfs/mosquito-control-508.pdf ; https://www.who.int/publications/i/item/9789240123212

## 4. Data protection and location safety

- Record registered asset locations only in sites where operator has the right/consent to manage; use fictional coordinates for demo.
- Aerial images may capture bystanders, private balconies or interior windows. Redact faces/identifiers where practical; restrict uploader access and avoid unnecessary retained footage.
- RBAC (two demo roles): operator may access assigned sites, coordinator may view tenant operational summaries and the audit log; operator sees only authorised mission assets. Apply checks server-side.
- Default-deny object storage and APIs; access logs; short-lived signed URLs; environment-specific retention; user export/delete review where appropriate.
- Do not put resident addresses, device credentials or photos in public repo or shared bug reports.

## 5. Human-in-the-Loop requirements

Human approval is required for any **real** flight, real treatment programme, uncertain biological/physical findings prior to consequential action and structural remediation. Routine analysis and scheduling can run automatically. Mock demo approval records can be created by a coordinator; simulated execution still uses safety gate.

## 6. Safety interlock contract (optional water-only bench rig)

Local controller states: `DISARMED → ARMED_FOR_TEST (expires automatically) → ACTIVATING → STOPPED`; emergency stop anytime and fault returns to `DISARMED`.

Conditions: physical arm switch/confirmation, operator present, test tank with clear water, contained target/no bystanders, local watchdog and low voltage, no network-only start, actuator energise duration bounded by *validated bench-test limit*, successful independent stop. **Do not implement detailed chemical dosing or flight spray logic.**

## 7. Risk register

| Risk | Severity | Required safeguard |
|---|---|---|
| Drone collision/privacy | High | No field drone in MVP; authorised provider later |
| Toxic exposure / illegal pesticide release | High | No chemical adapter; safe demo only; separate qualified pilot |
| Ovitrap creating breeding habitat | High | No live insects in demo; emergence prevention + servicing plan before pilot |
| Model wrongly flags a balcony | High | Permission/access gate; occluded → review, no application |
| Misleading dengue prediction | High | No infection-risk labels; show surveillance priority only |
| Offline sensor leads to missed inspection | High | Missing-data exception and service task |
| Repeated treatment without repair | Medium | Chronic recurrence referral and bounded plans |
| Unauthorised inspection image access | High | Server tenant checks, signed media, retention |
| Demo results mistaken for real efficacy | High | `SIMULATED` banners, report limitations on every key output |

## 8. Pilot readiness checklist (not for MVP launch)

Document site ownership and consent; entomology partner; validated trap safe-design and servicing; model performance on Malaysian sites; operator/CAAM categorisation and approvals; qualified vector-control programme and approved product/use; community safety/privacy assessment; insurance; responder/customer responsibilities; incident response/stop procedures; independently recorded outcomes.
