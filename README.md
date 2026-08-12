# VestaQuest

**A Vestaboard RPG.**

VestaQuest is a short, solo dungeon crawler designed around the physical limitations and theatrical strengths of a Vestaboard Flagship. The board is the shared game screen for the whole room; a phone is a minimal controller for choosing the numbered options shown on it.

The player chooses a Warrior, Rogue, or Wizard, explores a progressively revealed dungeon, resolves danger with visible opposed dice rolls, discovers class-sensitive rooms and equipment, and tries to find the exit before their HP runs out.

## Status

Implementation is underway. Slices 0–5 and Gates A–D are complete and merged; Slice 6 is active. The project now has the deterministic board package, Flagship simulator, server-only Cloud transport, ordered cadence queue, deterministic game kernel, versioned controller contracts, semantic board renderers, authoritative session service, sanitized Fastify API, minimal numbered controller, ordered presentation coordinator, runnable private development composition, and SQLite restart durability. The signature initiative sequence and complete guarded controller-to-Cloud vertical path have both been accepted by the owner on the physical black-shell Flagship. Gate C's exact 5x5 map/HUD grammar is approved. Ten validated authored dungeons support deterministic selection, alternate hidden exits, persistent frontier discovery, dead ends, two-way movement, backtracking, and exact live map rendering through the real controller pipeline; a planned quality pass will add meaningful branches to the nine currently linear layouts and tune short exit paths toward the ten-location target. Slice 5 adds deterministic initiative, opposed attacks, Warrior Smash, Run, explicit healing feedback, consumables, automatic advancement, Ghoul and Skeleton Knight encounters, persistent combat state, and exact victory/death statistics. Its final physical review was approved on 2026-08-11 with ordinary board transitions preserved for every frame. Slice 6 now includes owner-approved Wizard scroll and Rogue Steal/Unaware flows with persistent enemy-specific equipment rewards.

## Run the Board Lab

Requirements: Node.js 22.13 or newer. The repository pins the development and CI version in `.nvmrc`.

```sh
nvm use
npm ci
npm run dev
```

Then open:

- [Playable Board Lab](http://127.0.0.1:5173/?mode=play&shell=black) for the live private vertical slice and its minimal numbered controller.
- [Flagship Board Lab](http://127.0.0.1:5173/) for static fixture sequences, shell colors, changed cells, and authoritative character-code arrays.
- [Controller only](http://127.0.0.1:5173/?mode=controller) for the phone-sized input surface.

The command starts both loopback services: Fastify on port 8787 and Vite on port 5173. No Vestaboard token is used; the playable lab renders the server's in-memory board transport while session state, presentation intents, and idempotency receipts persist in the ignored `.vestaquest/sessions.sqlite` file. Set `VESTAQUEST_DATABASE_PATH` to use another private database path.

To run the complete local verification suite:

```sh
npm run check
npx playwright install chromium
npm run test:e2e
```

The browser download is a one-time local setup step. None of these commands requires a Vestaboard token or network access to a board.

### Deliberate live-board acceptance

The ordinary development command above is unconditionally memory-only. After
local checks pass, an explicitly gated physical acceptance session can use the
same playable pipeline:

```sh
npm run dev:physical -- --shell black
```

This command requires the server-side token and both exact live-write
acknowledgements in the ignored `.env`. It remains loopback-only, enforces the
Cloud cadence, respects Quiet Hours, never forces a write, and does not change
the owner's transition preference. Follow
[`docs/hardware/private-playable-acceptance.md`](./docs/hardware/private-playable-acceptance.md)
before running it.

## Transition spike

Exercise the initiative sequence through the in-memory transport and queue:

```sh
npm run transition:spike -- --fixture initiative
```

This is always a dry run unless the explicit live gates are satisfied. The supported transition fixtures are title, choice marker, initiative, and HP loss. See [`docs/hardware/transition-spike.md`](./docs/hardware/transition-spike.md) before any Digital or physical test. Live credentials belong only in an ignored local `.env`; `.env.example` never contains tokens or satisfied write acknowledgements.

Early Gate B testing preferred Wave/Fast for its spatial reveal, but the final Slice 5 physical review superseded that experiment: VestaQuest now preserves the owner's ordinary board transition for every frame and never changes the device preference during rolls. Staged per-die reveals and Local API column behavior remain optional later experiments.

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
- [`docs/architecture/transport-queue.md`](./docs/architecture/transport-queue.md) — ordering, cadence, retry, ambiguity, and Slice 3 durability boundaries.
- [`docs/hardware/private-playable-acceptance.md`](./docs/hardware/private-playable-acceptance.md) — guarded Cloud/physical vertical-slice runbook and acceptance checklist.

## Repository workflow

- `main` is the stable integration branch.
- Feature branches use the `codex/` prefix and one narrow outcome.
- New game rules require deterministic tests.
- New board states require exact 6x22 numeric snapshots plus readable review fixtures.
- Credentials, `.env` files, generated session data, and player personal data are never committed.

The selected stack and its rationale are documented at Gate A in `PLAN.md`.

## Vestaboard references

- [Character codes](https://docs.vestaboard.com/docs/charactercodes/)
- [Cloud Read/Write API](https://docs.vestaboard.com/docs/read-write-api/introduction/)
- [Local API](https://docs.vestaboard.com/docs/local-api/introduction/)
- [VBML](https://docs.vestaboard.com/docs/vbml/)
- [Developer program](https://www.vestaboard.com/developer)
- [Vestaboard+ Marketplace](https://channels.vestaboard.com/)

VestaQuest is an independent project and is not currently an approved Vestaboard marketplace application.
