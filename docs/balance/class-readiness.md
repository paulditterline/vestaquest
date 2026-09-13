# Class readiness simulation

Last run: 2026-09-13

This is a deterministic balance probe, not an autoplay feature and not a claim
that automated play is fun. It drives the real game command engine with the
`class-tactics-v1` policy over seeds 1 through 1000 for each class.

## Exit-ready definition

A run is exit-ready when the hero is alive in the final room before the hidden
exit, has reached Level 3, has defeated all three core route encounters, and
has both a weapon and armor equipped. The probe stops before entering the exit
so Slice 8's future exit challenge can be measured separately.

The policy knows the hidden shortest route so it measures class survival and
progression rather than exploration skill. It uses each class's current
tactics: Warrior uses Smash, Rogue attempts Steal for an empty equipment slot
and retreats to heal when that is safer, and Wizard casts one affinity-aware
scroll per encounter. Every class receives the same topology, exit, encounter,
and event placement for a given seed. On-route events are left alone.

## 3,000-run result

| Class | Runs | Exit-ready | Deaths | Stalled | Readiness | Avg. ready HP | Avg. commands |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Warrior | 1,000 | 998 | 2 | 0 | 99.8% | 4.56 | 16.6 |
| Rogue | 1,000 | 644 | 356 | 0 | 64.4% | 3.05 | 24.2 |
| Wizard | 1,000 | 801 | 199 | 0 | 80.1% | 2.67 | 19.8 |

Death causes were 2 Skeleton Knights for Warrior; 22 Ghouls and 334 Skeleton
Knights for Rogue; and 29 Ghouls and 170 Skeleton Knights for Wizard. No run
hit the 100-command safety bound.

## Interpretation

All three classes satisfy Slice 6's narrow requirement that they can reach an
exit-ready state under a consistent legal policy. The automated regression
floor is provisionally 50% readiness per class; this is a guard against a
class becoming routinely blocked, not a final win-rate target.

The spread is material: Warrior is currently much safer than Wizard, and Rogue
is much more vulnerable to Skeleton Knights. Do not erase that evidence with a
premature stat change. Gate E and Slice 8 must reevaluate these rates after the
exit guardian, late enemies, and complete-run pacing exist, when the owner can
choose the desired difficulty and class-parity bands in context.

Run the full report with:

```sh
npm run simulate:readiness -- 1000
```

The ordinary test suite runs a smaller deterministic sample for regression
speed; the command above is the acceptance distribution.
