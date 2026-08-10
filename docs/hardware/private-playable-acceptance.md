# Private playable Cloud acceptance

This runbook exercises the same authoritative session, renderer, presentation
coordinator, and output queue used by the local Playable Board Lab, but sends
the resulting stable frames to an explicitly selected Cloud board.

## Safety contract

- `npm run dev` is always memory-only, even when `.env` contains live tokens.
- Live mode listens only on `127.0.0.1`; the token remains in the server process
  and is never returned by an HTTP route or bundled into the web app.
- Physical mode requires `--live`, `--target physical`, the physical token, and
  both exact acknowledgement values from `.env.example`.
- The queue enforces at least 15 seconds between Cloud writes. The recommended
  development setting is 16 seconds.
- The Cloud API enforces the owner's Quiet Hours. This harness never sends
  `forced: true`.
- The playable vertical slice does not change the board's transition preference,
  so there is no transition setting to restore after a run.
- Stopping the server leaves the last game frame on the board. It does not spend
  another physical write restoring the message that preceded the test.

## Configure

Keep the write-scoped development credential and acknowledgements in the ignored
root `.env` file. Never put a token into `.env.example`, a shell command, a URL,
the browser, a screenshot, or a commit.

For the owner's black-shell Flagship, verify these variable names are present:

```text
VESTAQUEST_SPIKE_PHYSICAL_CLOUD_TOKEN
VESTAQUEST_ENABLE_LIVE_WRITES
VESTAQUEST_ENABLE_PHYSICAL_WRITES
VESTAQUEST_MINIMUM_WRITE_INTERVAL_MS
```

The transition-spike and private-playable harness intentionally share this
development credential and the same explicit write acknowledgements.

## Run

Stop any existing local VestaQuest development server, then run:

```sh
npm run dev:physical -- --shell black
```

Open <http://127.0.0.1:5173/?mode=play&shell=black>. Starting a new game sends
the title and class-select layouts as two deliberate board writes, so the first
choice remains locked for roughly two Cloud cadence intervals. Each accepted
choice then remains locked until its new board state is delivered.

Use `npm run dev:digital -- --shell black` for a configured Digital Flagship.
Digital mode still requires the general live-write acknowledgement, but never
the physical-board acknowledgement.

## Acceptance checklist

Record the date, target, and observations without recording the token.

- The startup log says `physical Cloud board (black shell)` and never prints a
  credential.
- Title and class-select arrive in order.
- The controller offers no choice until the corresponding board frame arrives.
- Choosing Warrior, Rogue, or Wizard advances exactly once.
- The placeholder room and terminal outcome arrive in order.
- The board's Quiet Hours are respected.
- The board's transition preference is unchanged after the run.
- Refreshing the browser resumes the current session without replaying a choice.
- The terminal board frame remains readable from normal room distance.

This is a systems/layout acceptance run. Class statistics, the placeholder room,
and its parity-based terminal result are explicitly provisional game content.

## Recorded technical run — 2026-08-10

- Target: owner's black-shell physical Flagship through the Cloud API.
- Path: title → class select → Rogue → placeholder room → provisional victory.
- Controller behavior: input remained locked until each stable Cloud frame was
  accepted, then exposed only the legal numbered choices.
- Delivery behavior: every command advanced once; title, class selection, room,
  and terminal outcome arrived in order under the configured 16-second cadence.
- Cloud readback after completion exactly matched the expected terminal layout:
  `YOU ESCAPED`, `CLASS: ROGUE`, `TEST ROLL: 4`, `VERTICAL SLICE ONLY`, and
  `PROVISIONAL OUTCOME`.
- Transition preference observed after the run: Classic/Fast. The playable path
  made no transition-setting calls.
- No forced write was sent. Quiet Hours were not active during this run, so their
  blocking behavior was not deliberately exercised.
- Credentials were absent from HTTP responses and startup/output logs.
- Still requires owner observation: room-distance readability, sound, perceived
  pacing, and whether the complete controller-to-board path feels acceptable.
