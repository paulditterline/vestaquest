# VestaQuest

**A Vestaboard RPG.**

VestaQuest is a short, solo dungeon crawler designed around the physical limitations and theatrical strengths of a Vestaboard Flagship. The board is the shared game screen for the whole room; a phone is a minimal controller for choosing the numbered options shown on it.

The player chooses a Warrior, Rogue, or Wizard, explores a progressively revealed dungeon, resolves danger with visible opposed dice rolls, discovers class-sensitive rooms and equipment, and tries to find the exit before their HP runs out.

## Status

VestaQuest is at the implementation-planning stage. Research and the initial product/design conversation are recorded, but no application dependencies or runtime have been selected yet. There is not a runnable build in this repository today.

The first implementation branch will build a deterministic 6x22 renderer and local simulator. This lets us design and test most of the game without making the physical Vestaboard flap on every edit.

## What makes it a Vestaboard game

- Every important state is designed for exactly 6 rows by 22 columns.
- Physical flap movement, sound, anticipation, color tiles, and limited characters are part of the experience.
- Board changes are meaningful scenes rather than videogame-like animation frames.
- Dice contests use staged board layouts so the roll appears to reveal across the display.
- The complete current choice and its consequences stay on the board whenever physically possible.
- The controller submits inputs; it is not a second game screen.

## Intended delivery modes

1. **Private owner mode:** run the game on the owner's board through Vestaboard's private Cloud or Local API without requiring Vestaboard+.
2. **Public marketplace mode:** offer VestaQuest to other owners if Vestaboard approves it and confirms the current integration contract.

The pure game engine and 6x22 renderer will be shared by both modes. Board credentials must remain server-side and must never be committed or exposed to the browser.

## Development approach

The project will be built as focused vertical slices:

1. exact renderer and local Flagship simulator;
2. rate-limited transport queue and real-board transition spike;
3. deterministic game/session kernel and minimal controller;
4. map exploration;
5. combat and death;
6. class actions, loot, and automatic progression;
7. dungeon events and information clues;
8. complete-run content and balance;
9. private alpha reliability;
10. optional autoplay and, after Vestaboard confirmation, marketplace work.

Each feature branch is tested locally before a PR. Critical layouts then graduate through the local simulator, Vestaboard's official Digital Flagship, and finally deliberate physical-board acceptance checks. Live hardware writes are never part of the default automated test suite.

## Project documents

- [`PLAN.md`](./PLAN.md) — architecture, decision gates, delivery slices, test strategy, and branch/PR workflow.
- [`AGENTS.md`](./AGENTS.md) — durable product requirements, verified Vestaboard constraints, API research, and project guardrails.

## Repository workflow

- `main` is the stable integration branch.
- Feature branches use the `codex/` prefix and one narrow outcome.
- New game rules require deterministic tests.
- New board states require exact 6x22 numeric snapshots plus readable review fixtures.
- Credentials, `.env` files, generated session data, and player personal data are never committed.

Local setup and verification commands will be added here after the implementation stack is approved and scaffolded. The recommended stack and its rationale are documented at Gate A in `PLAN.md`.

## Vestaboard references

- [Character codes](https://docs.vestaboard.com/docs/charactercodes/)
- [Cloud Read/Write API](https://docs.vestaboard.com/docs/read-write-api/introduction/)
- [Local API](https://docs.vestaboard.com/docs/local-api/introduction/)
- [VBML](https://docs.vestaboard.com/docs/vbml/)
- [Developer program](https://www.vestaboard.com/developer)
- [Vestaboard+ Marketplace](https://channels.vestaboard.com/)

VestaQuest is an independent project and is not currently an approved Vestaboard marketplace application.
