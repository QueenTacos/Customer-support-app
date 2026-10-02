# Ticket Assistant

One engine (`lib/assistant`) powers both:

* **⚡ Ticket Assistant** on New Ticket — paste → ANALYZE → review → APPLY TO NEW TICKET (fills the form; Save Ticket is the only save). USE NOTE puts the generated note in the First Ticket Note box.
* **⚡ Quick Update** on Ticket Details — paste → ANALYZE UPDATE → review from → to → APPLY UPDATE (field changes + note in one transaction via `apply_ticket_update`; history recorded by the existing triggers).

Pipeline: `extract.ts` (exact facts) → `interpret.ts` (local rules, EXTRACTED / INFERRED) → optional AI (`lib/ai`, off by default, validated, deterministic always wins) → note (`engine.ts` / `note.ts`) → missing information (`missing.ts`).

## Teaching it new words
* Keywords, abbreviations, issue/resolution cues: `lib/assistant/vocabulary.ts` (data tables).
* Materials and shorthand: Supabase `materials` / `material_aliases` (see MATERIALS.md). Unknown materials are never created.
* Missing-information rules: Supabase table `assistant_missing_rules` (edit rows; no code change).

```sql
-- Example: also ask for Photos on Color issues
insert into public.assistant_missing_rules (trigger_type, trigger_value, field, label, sort_order)
values ('issue', 'color', 'photos_received', 'Photos', 10);
```

## Safety rules
* Nothing is written until you click Save Ticket / Apply Update.
* Close Ticket is a suggestion only (disabled until the Phase 3 Close Ticket workflow). `apply_ticket_update` rejects status = closed.
* Tracking, FedEx case and shipping cost are separate; never derived from each other.
* Total Order Value is only filled from an explicit Grand Total / Order Total / Total Order Value.
* AI: output is schema-validated, field-allowlisted, can't override parsed values or invent numbers, and never writes to Supabase.
