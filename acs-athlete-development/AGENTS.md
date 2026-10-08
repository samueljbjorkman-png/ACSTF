# ACS Athlete Development — Codex project rules

This project rebuilds the ACS Athlete Development app from the user's approved notes dated October 7–8, 2026. Preserve the existing live Site and its records while this local project is developed.

## Approved programming rules

- Training blocks use the A/C/B cycle. Keep the phase sequence visible and configurable; do not invent exercise prescriptions that were not supplied.
- Levels 1–3 start from a comfortable standard 3×4 weight when one is known. Do not use estimated 1RM calculations or reps-in-reserve prompts to push these athletes toward heavier loading. Progress should be gradual.
- Levels 4+ may use an estimated 1RM and a phase-adjusted target percentage, with the resulting load held for coach review.
- Intake may be completed by the athlete or coach. Ask for either an estimated 1RM or an easy, comfortable 3×4 starting load. Keep setup simple.
- Dumbbell-to-barbell bench conversion: use 90% of the combined dumbbell load, rounded down. Do not apply this automatically to other exercises.
- Deload sessions do not affect progression decisions.
- Early/mid-season pre-meets should not be made overly light. Isometric options previously used include 3×3 and 5×5×1-second holds. Championship peaking needs revision from last year's plan; any one-set rule is an unconfirmed pilot and must remain editable.
- Body weight is occasional background data for calculations, not a routine weigh-in workflow.

## Approved records and import rules

- Historical information can be imported, previewed, sorted, and recorded.
- Validate athlete IDs. Skip duplicates. Merge without overwriting existing records. Show rejected rows before saving.
- Coaches can correct or remove incorrect entries.
- The PR wall groups track events, performance tests, and training/KPI metrics, including empty cards for measures with no results.
- Leaderboards show separate top 10 girls and boys for performance-test/training KPIs using one all-time best per athlete. Record sex explicitly; never guess it for existing profiles. Body weight is excluded. Signed-in athletes may see names and best marks in team rankings, while other athletes’ full profiles, private notes, and workouts remain restricted.
- Show vertical jump measures in inches. Show horizontal jumps in feet and inches.
- Use the ACS shield identity and burgundy/silver/charcoal visual direction when the supplied logo asset is available.

## Important boundaries

- The live app is still available separately at `https://acs-athlete-development.samueljbjorkman.chatgpt.site` and is at version 5. Do not claim this local project has replaced or updated it.
- This separate Codex build now has server-enforced coach/athlete accounts and a shared SQLite database. It has been tested locally, not publicly deployed. Do not claim the original hosted application has been updated. Before real athlete use, configure HTTPS hosting, durable storage, backups, and account recovery. Preserve the old browser-local data and use explicit migration or reviewed imports.
- Do not guess missing athlete records, phase percentages, exact feedback questions, or state peaking rules. Make unknown choices coach-configurable and document them.
