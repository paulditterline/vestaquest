# Transition spike runbook

This harness graduates the title, choice-confirmation, and initiative fixtures from the in-memory transport to Vestaboard Digital and, only after explicit approval, the physical Flagship. It never runs live by default and never sends `forced: true`.

## Safe dry run

```sh
npm run transition:spike -- --fixture initiative
```

Dry-run mode prints the exact 6x22 readable layouts and exercises the same output queue without making a network request. Available fixtures are `title`, `choice-marker`, `initiative`, and `hp-loss`.

## Live gates

Live mode requires all of the following:

1. An explicit `--live` flag, `--target digital|physical`, and the physical `--shell black|white` color.
2. The target-specific write token in the environment.
3. `VESTAQUEST_ENABLE_LIVE_WRITES=I_ACKNOWLEDGE_FLAPS_WILL_MOVE`.
4. For a physical target, `VESTAQUEST_ENABLE_PHYSICAL_WRITES=I_ACKNOWLEDGE_THIS_IS_MY_PHYSICAL_BOARD`.
5. No unresolved `.vestaquest/transition-spike-recovery.json` record.

The harness reads and records the board's existing transition preference, applies the requested setting, verifies it, sends frames through the cadence queue, and restores the original preference after success, ordinary failure, SIGINT, or SIGTERM. It will not overwrite a transition preference changed by another actor during the run. A crash, force-kill, power loss, or failed restore retains the local recovery record and blocks the next run.

The last test frame remains on the display. The harness does not add another physical write merely to restore the prior message.

If a crash, force-kill, or failed restore leaves the recovery interlock in place, do not delete it manually. With the same target token and acknowledgement variables available, run:

```sh
npm run transition:spike -- --live --restore-transition
```

The recovery command reads the recorded target and original preference, restores and verifies it, and removes the record only after verification succeeds. It does not send a board message.

## Gate B observation sheet

### Recorded physical findings — 2026-08-09

- Target: black-shell physical Flagship through the Cloud API.
- Fixture: two-frame opposed initiative roll.
- Classic/Gentle: unchanged cells stayed still, but roll tiles, numbers, and verdict appeared effectively together.
- Wave/Gentle: correct left-to-right order—roll track, result numbers, then verdict—but too slow.
- Wave/Fast: correct order at an acceptable pace; accepted for the current VestaQuest design.
- The harness restored the owner's previous transition preference after every run.
- Decision: use Wave/Fast for opposed-roll reveals. Accept its extra flap movement for now.
- Deferred: test Local API `column` for finer per-message behavior if Local API access is enabled. Do not assume it preserves unchanged cells until verified physically.

### Future observations

For each Digital and physical run, record:

- target and date;
- fixture and transition/speed;
- whether unchanged scaffold cells stayed still;
- reveal order of white roll cells, result digits, and winner text;
- readability across the room;
- physical sound and perceived pacing;
- any Quiet Hours or competing-message behavior;
- keep, reject, or retest recommendation.

Do not put tokens, headers, board identifiers, screenshots containing secrets, or recovery files in the repository.
