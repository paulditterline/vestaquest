# Slice 8 complete-run review

Date: 2026-10-03

Policy: `class-tactics-exit-v1`

The complete-run probe drives the real deterministic command engine from class
selection through victory or death. It follows the selected shortest route,
uses each class's approved combat tactics, and records the theatrical
presentations emitted along the way. The golden cases are regression fixtures,
not final balance targets.

## Victory seeds

| Class | Seed | Topology | Guardian | Rooms | Commands | Final HP | Art sequence |
| --- | ---: | --- | --- | ---: | ---: | ---: | --- |
| Warrior | 3 | Iron Gauntlet | Ice Demon | 9 | 17 | 4/5 | 1 hero, 3 enemies, 1 door |
| Rogue | 10 | Crooked Halls | Fire Demon | 10 | 26 | 3/5 | 1 hero, 3 enemies, 1 door |
| Wizard | 6 | Serpent Vault | Ice Demon | 10 | 22 | 3/4 | 1 hero, 3 enemies, 1 door |

Every winning seed reaches Level 3, defeats the three ordinary encounters,
shows the selected hero once, shows every encountered enemy before combat, and
shows the victory door exactly once. The nine-to-ten-room results sit on the
approved roughly-ten-location pacing target.

## Representative death seeds

| Class | Seed | Topology | Cause | Rooms | Commands | Enemies slain |
| --- | ---: | --- | --- | ---: | ---: | ---: |
| Warrior | 76 | Flooded Steps | Fire Demon | 11 | 25 | 3 |
| Rogue | 7 | Witch Ring | Ice Demon | 8 | 26 | 3 |
| Wizard | 5 | Broken Crown | Fire Demon | 10 | 27 | 3 |

These cases deliberately fight the final guardian. Each reaches Level 3 after
clearing all three ordinary encounters, emits the guardian introduction, and
ends with the correct guardian death cause and no victory-door presentation.

## Distribution check

A 200-seed bypass-policy sweep per class completed without a command-limit
stall:

| Class | Victories | Deaths | Stalls | Average commands | Average rooms |
| --- | ---: | ---: | ---: | ---: | ---: |
| Warrior | 199 | 1 | 0 | 19.0 | 9.8 |
| Rogue | 113 | 87 | 0 | 26.1 | 8.9 |
| Wizard | 151 | 49 | 0 | 21.4 | 9.1 |

The class spread remains explicit balance evidence rather than a locked target.
It is consistent with the earlier exit-readiness probe and introduces no new
balance decision.

## Review conclusion

- No deterministic stalls or illegal commands were found.
- Complete wins and late guardian deaths are now fixed for all three classes.
- Required hero, enemy, and victory art beats occur in the correct terminal
  paths.
- Board copy and worst-case layouts remain covered by the exhaustive renderer
  and fixture suites.
- Prior owner Board Lab runs established that the complete game is followable
  from the board with the phone acting only as the numbered controller. Slice
  8's subsequent hero, enemy, victory-door, and Lost Soul additions were each
  separately owner-approved in Board Lab.

Slice 8 meets its acceptance criteria. The class outcome spread should remain
visible during private-alpha hardening rather than being silently rebalanced.
