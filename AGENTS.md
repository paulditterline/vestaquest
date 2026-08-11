# Vestaquest project guide

This file is the durable technical and product context for agents working in this repository. Read it before making plans or code changes.

## Current stage and design gate

The initial research and design conversation is complete, `PLAN.md` is approved, and implementation is underway. Slices 0–3 and their physical Cloud-path acceptance are complete. Gate C's 5x5 map/HUD grammar was approved on 2026-08-10 and is recorded below and in `PLAN.md`; Slice 4 map exploration is next. Gate B's Cloud/physical decision was resolved on 2026-08-09: use Wave/Fast for opposed-roll reveals, temporarily applying and then restoring the owner's board preference. Local API refinement remains optional. Preserve the owner-confirmed direction below. Do **not** silently settle the remaining open balance, content, distribution, or technology decisions; resolve them at the decision gates in `PLAN.md` or bring them back to the owner.

Continue to distinguish clearly between:

- verified Vestaboard capabilities;
- inferences or recommendations derived from those capabilities;
- creative choices that require the owner's input.

## Product intent and hard requirements

Vestaquest is intended to become a dungeon-crawling RPG built around a physical Vestaboard Flagship. The rough premise is entering an area, seeing a basic map, encountering things, rolling dice, choosing among three classes (warrior, rogue, and wizard), and finding the way out.

The experience should embrace the physical board rather than imitate a normal videogame on a bad screen. The sound, anticipation, limited alphabet, fixed grid, color tiles, one-message-at-a-time presentation, and relatively slow mechanical changes should be treated as materials for the game.

Two delivery modes are required:

1. **Owner/private mode:** the owner must be able to run the game on their own Vestaboard without needing a Vestaboard+ subscription. Vestaboard explicitly says private API automations are free for owners.
2. **Public/Store mode:** it should be possible to offer the game to other Vestaboard owners through the Vestaboard+ marketplace if Vestaboard approves it. The owner already has Vestaboard+ for testing, but the game must not make the owner's subscription a technical prerequisite for private use.

Keep the game engine and board renderer independent of any one transport so both modes can use the same game.

## Owner-confirmed creative direction

These points were supplied by the owner during the design conversation on 2026-08-09. Treat them as requirements unless the owner revises them; do not extrapolate unspecified mechanics from them.

- The title is **VestaQuest**.
- It is a solo game. Other people in the room may discuss and influence choices, but there is one player/character and no required multiplayer system.
- The title screen should invert against the physical board: white presentation on a black Vestaboard, or black presentation on a white Vestaboard. It should say `VESTAQUEST` and `A VESTABOARD RPG`.
- Character selection offers the three established classes: warrior, rogue, and wizard. The selection view should show each class's stats.
- Keep the player model simple, using the five shared core stats defined below. Exact starting values and growth curves are not decided yet.
- Exploration uses a progressively revealed 5x5 grid on the right, using two physical flaps per room with `MAP` centered above it. The left 11 columns retain class/level, HP text and bar, Power, Defense, Skill, Luck, rooms found, and compact numbered directions.
- The dungeon contains treasure, class-appropriate equippable items, choice encounters that alter the game, and fights resolved with dice.
- Dice should receive a physical reveal on the board. The desired visual grammar is a die label, a left-to-right run of flipping color tiles representing the roll in progress, and the resulting number at the end; conceptual example: `D6` + four white tiles + `4`.
- Combat is turn-based and begins with an initiative roll for both combatants. Use a full-board opposed-roll layout: player/class name, player `D6` tile track and result, enemy name, enemy `D6` tile track and result, a spacer, then `<COMBATANT> GOES FIRST!`.
- In dice-layout documentation, a placeholder such as `W` may represent a white color tile, but implementations must send character code `69`, not the letter W. Align both result numbers at the same rightward reveal point so a left-to-right Wave/column transition exposes the contest naturally.
- Build an initiative reveal from two board states. The scaffold state contains only the combatant names and `D6` labels. The result state retains that unchanged scaffold and adds the color-tile roll tracks, final numbers, and initiative winner. The desired effect is that only the new tiles appear one column at a time from left to right, followed by the result and then the winner.
- Prefer accomplishing the result reveal with one final board write and a transition, not a sequence of per-tile API writes; Cloud writes are rate-limited and per-tile messages would be unacceptably slow.
- The documented APIs do not clearly promise the exact combination of "unchanged cells remain still" and "changed cells animate left-to-right" for every delivery mode. Classic changes only differing cells but does not document a column-by-column reveal; Cloud Wave reveals by columns but official help says it animates unchanged cells too. Local API `column` may provide the desired selective sweep. Verify on the owner's hardware and ask Vestaboard whether Store apps can request equivalent behavior.
- To make the initiative winner appear after both numeric results within the same column sweep, prototype a right-positioned footer such as `FIRST: GOBLIN` whose first changed column begins after the dice results. Do not assume a conventional left-aligned `<NAME> GOES FIRST!` footer will reveal last.
- Initiative determines encounter turn order. The tie rule and whether initiative modifiers exist remain undecided. Subsequent attacks use the opposed-roll structure defined below.
- Core combat uses **opposed rolls** because visible dice contests are part of the fun. On an attack, the attacker rolls `D6 + POWER` and the defender rolls `D6 + DEFENSE`; both rolls should share the physical two-track reveal grammar. A tie currently implies a block/zero damage unless later playtesting suggests another rule.
- The positive difference between attack and defense is the leading candidate for damage. Add an explicit damage cap or other protection during balancing so one extreme roll does not casually erase a short run; the exact cap and HP scale remain undecided.
- The provisional player-turn menu is `1 ATTACK`, `2 <CLASS ACTION>`, `3 ITEM`, `4 RUN`. Enemy turns resolve automatically using the same opposed-roll foundation.
- Warrior's signature combat action is `SMASH`, usable once per enemy. The Warrior rolls two D6, keeps the higher die, adds Power, and opposes the enemy's normal `D6 + DEFENSE` roll. Give Smash a dedicated six-row, three-die reveal screen.
- If HP reaches zero or below, show a prominent `YOU DIED` ending followed by or combined with run statistics such as rooms explored and enemies killed.
- Death ends and erases the current run. There are no permanent stat upgrades, metagame currency, or other power carried into the next game; player knowledge is the lasting progression.
- The death summary should use the full six-row board as an epitaph: `YOU DIED`, `BY <CAUSE>`, `CLASS: <CLASS>`, `ROOMS FOUND: <N>`, `ENEMIES SLAIN: <N>`, and `ROOMS UNTIL EXIT: <N>`. Shorten individual labels only if hardware testing proves necessary.
- `ROOMS UNTIL EXIT` should communicate how close the player was when they died. Define its graph-distance calculation precisely when map rules are implemented, including how alternate paths and locked/class-specific branches are treated.
- There should be multiple viable ways to overcome the exit challenge, while retaining the single clear objective of finding and escaping through the exit.
- The desired overall flavor is a deliberately bounded, pre-programmed adventure reminiscent of a basic 1980s Apple computer game, rather than an endless live-service RPG.
- Candidate secondary mode: **autoplay/watch mode** (the owner described it as "play yourself"). The game selects legal numbered choices automatically so people can watch an entire run unfold on the board. Implement this as another command policy over the same game engine, not a separate simulation. Decide later whether choices are uniformly random or lightly weighted, how quickly it advances, and whether it stops after one win/death. It must respect Quiet Hours and never create an uncontrolled infinite stream of mechanical updates.
- Put all meaningful game information on the Vestaboard whenever physically possible so everyone in the room can follow the complete game together.
- The companion controller should be intentionally minimal: it normally submits the number of a choice currently displayed on the Vestaboard rather than duplicating the game presentation.
- Board-presented choices include movement (`UP`, `DOWN`, `LEFT`, `RIGHT` or suitable short equivalents), conversation responses, and battle actions such as fight, run, spell, or item.
- The phone may carry overflow only when the 6x22 board genuinely cannot present the necessary information legibly. This is a fallback, not the default design.
- Board copy must be concise and readable across a room. Verbosity is a scarce resource, and important choices must remain understandable to spectators as well as the active player.
- When a numbered choice is submitted, show a green color tile beside the selected board option (or another equally clear physical selection marker) so everyone in the room sees what was chosen. Lock further controller input immediately. Prototype whether the marker can be incorporated into the next required board state; a standalone confirmation write adds at least another Cloud cadence interval to every choice.
- Navigation advances from one meaningful location/room to the next rather than animating every corridor step. Each move should justify a physical board update.
- Map grammar is fixed: blank pairs are unexplored; yellow `?` is an available unknown frontier; shell-contrasting `.` is explored; green `@` is current; red `!` is an active threat; orange `!` is a resolved fight; and red `X` is a discovered dead end. The symbol is required alongside color. The current green `@` takes priority until the player leaves, then any resolved encounter marker underneath becomes visible.
- From the current location, the player should know which cardinal directions can be attempted. An available adjacent location may appear as an unknown/frontier cell, but the player must not know whether it is a dead end, encounter, treasure, or other location until entering it.
- Compact numbered choices such as `1N 2E 3S 4W` are authoritative; visual adjacency on the map does not itself promise a connection.
- Trying a dead end reveals a red `X`, removes that direction, and leaves the character in the current room. The attempt causes no damage by itself.
- Ordinary discovered paths are traversable both ways. Completed encounters do not retrigger when revisited; exceptional traps or teleports must be presented explicitly.
- Dungeon variety starts with ten authored topology templates plus deterministic randomized content. Each template has one entrance and multiple valid distant exit candidates; one actual exit is secretly selected per run and remains invisible until discovered.
- Target a short, sweet run of roughly **10 meaningful visited locations** on the successful path. A map may contain additional unvisited branches; `10` is the experience/pacing budget rather than necessarily the exact number of cells in every topology.
- The consistent objective is **find the exit**. Avoid multiple unrelated victory conditions that complicate the player's mental model.
- Reaching or using the exit should usually require a harder fight, a consequential choice sequence, or both. A final boss is possible but need not appear in every run.
- Character progression must happen quickly enough within a roughly ten-location run that the player can become ready for the exit challenge. The exact level count, advancement trigger, and whether explicit XP exists remain undecided.
- Level-ups are **automatic**. Do not ask the player to allocate points or select an upgrade at level-up; class progression follows a predefined curve. Equipment and encounters provide the run's discretionary build choices.
- Use five shared core stats: **HP**, **POWER**, **DEFENSE**, **SKILL**, and **LUCK**. Power represents the effectiveness of class-appropriate attacks or spells rather than requiring separate Strength and Magic systems. Skill covers agile/tricky actions. Luck influences unusual outcomes and treasure.
- Class emphasis: warrior has high HP and Defense; rogue has high Skill and Luck; wizard has high Power and low HP. Exact starting values and automatic growth curves remain to be balanced.
- Include rooms and obstacles that strongly favor particular classes without necessarily becoming absolute class gates. Confirmed examples include a solid door tested with Power (the Warrior is most likely to break it), a library that is the Wizard's best source of scrolls, and a trapped room tested with Skill (the Rogue is most likely to cross safely).
- **Do not adapt or regenerate the dungeon around the selected class.** The same library, breakable door, locked cache, and other authored locations may appear for any class. The chosen class changes the room's outcome, not which rooms exist.
- Off-class discoveries may produce concise, flavorful failure/incomprehension, a lower-probability generic reward such as healing, or an ambush/battle. Do not silently substitute a class-relevant room. A Wizard searching a library should still have some risk of being attacked even though scrolls are the likely reward.
- Class-specific content should make the selected class materially change which routes, discoveries, and rewards are usable. Unless the owner later decides otherwise, never make a run unwinnable because the only route to the exit requires a different class.
- Equipment is deliberately compact: one weapon slot, one armor slot, and one consumable slot. Equipment drops are class-appropriate. When new weapon or armor is found, the player equips/replaces the current item or leaves it; do not add a backpack-management subsystem.
- `ITEM` in combat uses the single held consumable, making the action unambiguous without a separate inventory screen.
- Wizard magic comes from **single-use scrolls** the wizard begins with and/or discovers during the run rather than from a Mana stat. The initial spell set is **Fireball**, **Lightning**, and **Stun**. Scrolls occupy a small class-specific pouch separate from the general consumable slot. Its exact capacity and starting contents remain to be balanced.
- Enemies can be weak, resistant, immune, or actively advantaged by particular spells. A canonical example is Fireball healing a fire-aligned monster. Affinities must produce clear board feedback and should be visually or fictionally learnable rather than arbitrary hidden punishment.
- Rogue combat identity includes a once-per-enemy `STEAL` attempt resolved as opposed `D6 + SKILL`. If the Rogue won initiative and attempts it before the enemy's first turn, the enemy is `UNAWARE` and the Rogue gains a small bonus. After the enemy acts, stealing remains possible without that bonus. Failure consumes the Rogue's turn. Do not add a separate persistent stealth/detection subsystem.
- `RUN` uses an opposed `D6 + SKILL` contest between player and enemy. A failed escape attempt consumes the player's turn and allows normal enemy action; do not add an extra punishment on top by default.
- Every combat should begin with or prominently feature a dedicated full-board, low-resolution pixel-art presentation of the enemy. Include the selected player character in the tableau if it remains visually legible at 6x22; prototype enemy-only and player-versus-enemy compositions before committing.
- Combat art is a distinct theatrical board state. It does not have to share the same frame with the map or every battle choice.
- The fiction and copy should play the fantasy mostly straight with dark, creepy dungeon atmosphere. Favor terse, ominous language. Avoid frequent jokes, modern quips, or self-aware comedy; rare dry humor may emerge naturally from blunt old-computer phrasing but must not deflate the danger.

The design conversation is ongoing. Preserve the confirmed rules above, but do not yet lock unconfirmed values such as exact stat numbers/growth, map dimensions, input cadence, scroll-pouch capacity, damage caps, full enemy behavior, event outcome tables, map-generation method, or content frequency.

### Enemy seeds

Owner-supplied enemy concepts include:

- Ghoul
- Skeleton Knight
- An elemental Demon with variants such as Fire and Ice
- **Lost Soul:** potentially the ghost/echo of the player's most recent failed run

The Lost Soul is a particularly important thematic idea. It may retain the former run's class, appearance, statistics, equipment, cause/location of death, or some subset, but the exact behavior is undecided. Persisting an echo is acceptable even though character power resets; decide explicitly whether defeating it can recover old equipment, because that would create a limited form of cross-run material continuity.

### Event seeds

Owner-supplied room/event concepts include:

- **Library:** search or leave. Wizard is likely to find scrolls, but searching can still cause an attack. Other classes might find a healing item, trigger a battle, or fail to understand the books.
- **Solid door:** attempt to bash it. Warrior has the best odds. A successful breach should lead to an item, weapon, or armor.
- **Room of traps:** attempt to cross/sneak through. Rogue has the best odds. Other classes may succeed at lower probability. Failure can cause damage or another consequence, with a low probability of instant death.
- **Chained victim:** choose whether to release, question, or abandon them. Exact identities and downstream consequences remain to be designed.
- **Strange hole in the ground:** choose whether to look, reach through, or leave it alone.
- **Call for help down a dark path:** choose whether/how to respond or follow.
- **Fresh baked bread steaming in a basket:** decide whether to eat, take, inspect, or leave the conspicuously out-of-place food.
- **A loved one appears and asks the player to follow:** decide whether to trust, question, or refuse the apparition.

Events should support terse multi-step choices, class/stat-biased outcomes, risk, learning across runs, and dark atmosphere. Avoid arbitrary punishment with no readable clue or learnable pattern.

Treat **information as a reward**. Speaking to a chained victim or succeeding at other investigation/social events may reveal a truthful clue such as `I THINK THE EXIT / IS EAST`, a distance estimate, or the next promising direction. Exit clues can be uncertain in wording, but a clue earned by a clearly successful roll must obey its authored truth rules. Failed interactions may yield no clue, an explicitly unreliable statement, deception, or danger. Do not silently present false information as a successful reward.

Information clues are intentionally **transient**. Do not persist them in the map HUD, add a quest log/notepad, or duplicate a clue history on the controller. The player and people in the room must remember what the dungeon said. Board space remains reserved for the current state and current decision.

Event and obstacle outcomes should normally be resolved with visible **opposed rolls**, not invisible random-table selection. After the player chooses an approach, roll `D6 +` the relevant player stat against `D6 +` an authored room/obstacle danger value. Examples: Power versus a solid door, Skill versus a trap room, magical Power versus a tome or rune, and Luck/Skill where appropriate for uncanny social or search events. Use the same two-track physical dice-reveal grammar as combat. Default to clear success/failure; use margin-based severe or mixed outcomes only where an authored event benefits from it and can explain the result concisely.

## Verified hardware constraints

Research was last checked on **2026-08-09**.

### Vestaboard Flagship

- The display is exactly **6 rows by 22 columns**, or **132 independently addressable character positions**.
- It contains **8,448 physical flaps**. A message change is audible and visibly mechanical; the board is not a silent or high-refresh display.
- It supports 56 alphanumeric characters and eight color characters. The usable character-code range is `0` through `71`, with gaps for unsupported punctuation.
- Lowercase text sent through VBML is converted to uppercase.
- The supported text characters are `A-Z`, `0-9`, and a limited punctuation set: `! @ # $ ( ) - + & = ; : ' " % , . / ?` plus the degree symbol on Flagship.
- Color/solid tiles are red (`63`), orange (`64`), yellow (`65`), green (`66`), blue (`67`), violet (`68`), white (`69`), black (`70`), and filled (`71`). Code `0` is blank.
- Do not invent Unicode glyphs, emoji, arrows, box-drawing characters, pipes, underscores, brackets, or lowercase as board-native symbols. Use only the official character set and verify layouts as character-code arrays.
- The official physical specifications list the classic Flagship as 41.2 inches wide, 22 inches tall, 3.5 inches deep with mount, and 55 pounds with frame. These dimensions are context rather than application requirements.

Primary references:

- [Vestaboard character codes](https://docs.vestaboard.com/docs/charactercodes/)
- [Vestaboard dimensions and character count](https://www.vestaboard.com/migration/help/dimensions)
- [Official split-flap overview](https://www.vestaboard.com/split-flap-display)
- [Vestaboard Flagship product page](https://www.vestaboard.com/flagship)

### Vestaboard Note

Vestaboard Note is **3 rows by 15 columns** (45 positions). Note support is not an MVP requirement unless the owner later asks for it. Keep dimensions parameterizable where doing so is inexpensive, but optimize the initial game for Flagship rather than weakening it to fit both products.

### Official Digital Display

Vestaboard offers a free browser/app-based **Digital Display**, including a Digital Flagship in either device color. Vestaboard describes it as a virtual board for previewing messages, experimenting in a sandbox, and setting up API integrations without physical hardware. Create one in the mobile app or `web.vestaboard.com` via Settings -> Current Vestaboard -> Add Vestaboard -> Flagship -> choose color -> Try digital version. Publish can create live simulator links and embeds.

This is an official hosted virtual device, not a downloadable local development emulator. Use it as a higher-fidelity integration check after local tests; do not make every edit depend on Vestaboard's service or cadence. Verify token creation and exact transition fidelity with the owner's account before relying on it for automated API tests.

Reference: [Vestaboard Digital Display help](https://www.vestaboard.com/help/digital-display)

## Verified public API surface

### Cloud Read/Write API — recommended first integration

The Cloud API is the most direct path for private prototyping and remote control of one owner's board.

- Base endpoint: `https://cloud.vestaboard.com/`
- Authentication header: `X-Vestaboard-Token`
- Tokens are created in the API area of `web.vestaboard.com` or Settings / Advanced Settings in the mobile app.
- Tokens are specific to a board and can be scoped to Read and/or Write. Request the least privilege needed.
- `GET /` reads the current message.
- `POST /` sends either `{ "text": "..." }` or a complete `{ "characters": [[...], ...] }` layout.
- Blank messages are rejected. A visually blank board should therefore be sent as a non-empty 6x22 character array if needed, subject to confirmation in testing.
- **Rate limit:** the official docs warn that sending more than one message every 15 seconds is likely to cause dropped messages. Treat 15 seconds as a hard minimum and use a slightly safer application interval until hardware tests establish otherwise.
- `{ "forced": true }` can override Quiet Hours. Vestaquest must not do this by default; respect the owner's quiet hours.
- The current API also exposes `GET /transition` and `PUT /transition` with `classic`, `wave`, `drift`, or `curtain`, and `gentle` or `fast` speed. These settings are device preferences, so preserve and restore the user's previous setting if the game ever changes them.
- Transition control is supported on Flagship and individual Notes, not Note Arrays.

Security requirements:

- Never expose a Cloud API token in browser/client code, URLs, logs, fixtures, screenshots, or the repository.
- Keep tokens server-side in environment variables or an encrypted secret store.
- Never commit `.env` files. Provide `.env.example` with names only.
- A private deployment needs a small trusted backend or local companion service; a static browser-only app is not safe.

Primary references:

- [Cloud API introduction](https://docs.vestaboard.com/docs/read-write-api/introduction/)
- [Cloud API authentication](https://docs.vestaboard.com/docs/read-write-api/authentication/)
- [Cloud API endpoints, rate limit, and transitions](https://docs.vestaboard.com/docs/read-write-api/endpoints/)
- [Vestaboard API help article](https://www.vestaboard.com/help/api)
- [Private automations do not require Vestaboard+](https://www.vestaboard.com/help/private-installables)

### Local API — useful private/offline transport

The Local API is another valid owner/private mode and can run in parallel with cloud services.

- It requires an enablement token requested from Vestaboard and a one-time enablement call.
- The board must be paired and able to receive the applicable firmware update before enablement.
- It uses `http://vestaboard.local:7000/local-api/message` on the LAN, authenticated by `X-Vestaboard-Local-Api-Key`.
- `GET` reads the current character array and `POST` writes a full character array.
- IPv4 is required for reliable local access; the docs warn that IPv6 may be inconsistent.
- The returned local API key does not expire according to the current docs.
- Local writes can specify transition strategies: `column`, `reverse-column`, `edges-to-center`, `row`, `diagonal`, or `random`, plus `step_interval_ms` and `step_size`.
- The local `random` transition may be thematically useful, but no game mechanic should depend on it until tested on the physical board.
- The Local API cannot directly support a public marketplace app because a hosted service cannot normally reach devices inside customers' LANs. Treat it as a private/offline adapter.

Primary references:

- [Local API introduction](https://docs.vestaboard.com/docs/local-api/introduction/)
- [Local API authentication](https://docs.vestaboard.com/docs/local-api/authentication/)
- [Local API endpoints and transition strategies](https://docs.vestaboard.com/docs/local-api/endpoints/)
- [Local API networking](https://docs.vestaboard.com/docs/local-api/networking/)

### VBML and direct rendering

VBML is a JSON layout/composition format. The current endpoint is `POST https://cloud.vestaboard.com/vbml/compose`; it returns character-code arrays rather than sending them to a board.

It supports templates, injected props, multiple rectangular components, explicit width/height, horizontal and vertical alignment, absolute positioning, ordinary supported characters, and raw character arrays.

Use VBML when it simplifies prose/status screens. For maps, icons, dice faces, and other exact game visuals, prefer generating and validating raw 6x22 character arrays locally. The renderer must be deterministic and testable without a Vestaboard or network.

References:

- [VBML specification and examples](https://docs.vestaboard.com/docs/vbml/)
- [Cloud formatting endpoint](https://docs.vestaboard.com/docs/read-write-api/endpoints/#format-message)

## Public marketplace and interactive games: knowns and unknowns

### What is verified

- The public [Vestaboard+ Marketplace](https://channels.vestaboard.com/) contains trivia, Word Scramble, Party Prompts, riddles, and other game-like channels.
- A documented Word Scramble experience lets multiple players use smartphones to submit words based on letters shown on the board. This establishes the companion-phone/shared-display pattern, but not a public developer interface for reproducing it.
- Vestaboard says an active Vestaboard+ Trivia game pauses other incoming manual and automated messages. This appears to be privileged game/session behavior, not something documented in the public Read/Write API.
- Vestaboard's help article says creating an API credential also creates a private installable/subscription and describes submitting the public half of the API credential plus listing information for marketplace consideration.
- However, the official Subscription API page now says that API **will soon be deprecated** and recommends migrating to the Read/Write API.
- Public marketplace approval is curated; creating a private API integration does not automatically make it installable by other owners.

References:

- [Vestaboard+ Marketplace](https://channels.vestaboard.com/)
- [Sharing an API creation / marketplace submission](https://www.vestaboard.com/migration/help/installable-submission)
- [Subscription API endpoints and deprecation notice](https://docs.vestaboard.com/docs/subscription-api/endpoints/)
- [Scheduling behavior while Trivia is active](https://www.vestaboard.com/migration/help/cadence-options)
- [Independent review describing smartphone multiplayer Word Scramble](https://www.tomsguide.com/news/i-tested-this-dollar3000-smart-messaging-display-and-its-awesome)
- [Vestaboard developer program](https://www.vestaboard.com/developer)

### Do not assume

The public documentation does **not** currently establish any of the following:

- a public SDK for adding custom interactive controls inside the Vestaboard mobile app;
- a webhook/event API for taps or player submissions from the Vestaboard app;
- a documented way for third-party apps to enter the privileged Trivia/game mode that pauses other content;
- a current OAuth-style end-user installation flow for new multi-board marketplace apps;
- current marketplace review requirements, hosting requirements, privacy rules, content policy, revenue sharing, or whether interactive third-party games are accepted;
- whether third-party marketplace consumers must have Vestaboard+ (likely for marketplace access, but confirm rather than encode this as fact);
- whether the old API-credential/installable submission flow remains the intended route after Subscription API deprecation.

### Questions to take to Vestaboard before public architecture is locked

Contact the developer team via the [developer program](https://www.vestaboard.com/developer), the developer Slack invitation, or `developer@vestaboard.com`. Ask:

1. What is the 2026 replacement for the deprecated Subscription API for one app serving many customer boards?
2. What installation/authentication handshake gives a marketplace app access to a customer's board without the developer handling that customer's raw board token?
3. Can third-party marketplace listings provide a custom interactive web/mobile control surface or deep link?
4. Is there an official session/input API used by Word Scramble and Trivia, and can third parties access it?
5. Can an approved third-party game temporarily suppress other board messages like Trivia does?
6. What write cadence is allowed for an interactive Store app, and are game sessions exempt from normal channel cadence rules?
7. Are interactive games currently accepted into the marketplace? What review, privacy, accessibility, moderation, uptime, support, and data-retention requirements apply?
8. Does every user who installs a marketplace version need Vestaboard+, and can the same product also advertise or link to a free self-hosted/private API mode?
9. Are there rules around external accounts, session codes, QR codes, multiplayer, purchases, or collecting nicknames/analytics?
10. Is Flagship-only support acceptable for initial submission, or must marketplace apps also support the 3x15 Note?

Record Vestaboard's answers in this file with the date and source/contact. Do not silently treat an email or Slack answer as a public guarantee.

## Architecture guardrails (not game-design decisions)

These are implementation boundaries supported by the research; they do not decide the game's creative direction.

1. **Pure game domain:** seeded random source, rules/state transitions, encounters, saves, and commands. No Vestaboard calls.
2. **Pure Flagship renderer:** converts a semantic game view into exactly 6 arrays of exactly 22 supported character codes. Reject invalid dimensions or codes before transport.
3. **Transport interface:** at minimum `readCurrent()`, `send(layout)`, and capability metadata. Planned adapters: Cloud Read/Write first, Local API second, marketplace transport only after Vestaboard confirms the current integration.
4. **Companion control surface:** a mobile-first web app/PWA is the safest prototype assumption because the board itself has no documented input mechanism. Its UI and exact role remain a design discussion.
5. **Server-side session service:** owns board credentials, authoritative game state, random rolls, idempotency, session codes, rate limiting, and persistence.
6. **Per-board output queue:** coalesce stale frames, allow only one in-flight board write, enforce a configurable interval of at least 15 seconds for Cloud API, and never let retries reorder game states.
7. **Simulator:** show the exact 6x22 state in development and tests. A developer must be able to play without exercising physical flap hardware for every iteration.
8. **Dual-mode configuration:** support a direct owner token/private deployment without Vestaboard+, while isolating marketplace identity and installation details behind a future adapter.

Do not build a browser client that calls Vestaboard directly. Do not build against the deprecated Subscription API for new work unless Vestaboard explicitly instructs us to do so.

## Physical-first implementation principles

These principles constrain later design without deciding it:

- A board update must be meaningful. Do not target videogame-like frame rates or movement one tile at a time without considering the 15-second Cloud limit and mechanical wear/noise.
- Treat the sound of an update as a room-scale cue. Players often hear the board before they see the result.
- Favor a small number of legible, high-contrast states over animation sequences.
- Classic transitions update only changed characters; Wave, Drift, and Curtain intentionally move more flaps. Choose with purpose and respect noise-sensitive spaces.
- Keep important information on the board long enough to read from across a room.
- Never require color alone to convey critical state; pair color with a character, position, or text label.
- Represent HP as a segmented physical tile bar. **White means healthy and red means lost HP.** The owner's example for `2 / 4` HP is two white tiles followed by two red wound tiles (`WWRR` on a black board, where `W` is documentation shorthand for white character code `69`). On a white board, prototype black healthy segments with red wounds. Damage should visibly flip healthy segments to red and healing should reverse them.
- Pair the bar with an `HP`/`H` label and include a numeric `current/max` value on roomy combat or status screens when possible. The map HUD may use the labeled bar alone. Keep maximum HP within a visually manageable segment count rather than shrinking or wrapping the meter.
- Make layouts work in the actual limited character set, not just in a Unicode terminal mockup.
- Prototype color artwork and maps with **two adjacent character positions per logical pixel/cell**. The Flagship is roughly twice as wide as it is tall while its grid is 22x6, so a 2-column-by-1-row color block should appear much closer to square than a single Bit. This could yield an approximately square 6x6 map in 12 physical columns or an 11x6 full-board pixel-art canvas. Verify the proportions on the actual board before making it a fixed rule.
- Treat quiet hours, manual messages, app channels, disconnects, retries, duplicate commands, two phones acting at once, and an interrupted session as normal product states.
- The board is the shared theatrical focal point. The companion device should provide input and private detail without becoming the main screen by accident; the exact balance is a design decision for the owner.

## Testing expectations once implementation begins

- Use a four-layer build/test loop:
  1. pure engine and renderer tests with seeded runs, layout validation, and snapshots;
  2. a VestaQuest-owned local browser simulator/controller with instant hot reload and optional transition emulation;
  3. the official Vestaboard Digital Flagship as a hosted API/rendering integration check;
  4. deliberate physical-board sessions for sound, across-room legibility, actual colors, pacing, and transition behavior.
- Make transport selectable by configuration (`memory/local simulator`, `Digital Display via Cloud`, `physical via Cloud`, and `physical via Local API`) without changing game rules or rendering code.
- Batch physical checks around specific questions instead of sending every development frame to the hardware. The dice scaffold/result pair, changed-only versus column transitions, HP damage/healing, full-board enemy art, white/black inversion, and map-cell proportions are early hardware-test priorities.
- Unit-test every renderer for exact `6 x 22` dimensions and codes in `0...71` from the supported set.
- Snapshot key layouts as both human-readable rows and numeric arrays.
- Test the state machine with seeded randomness and deterministic clocks.
- Test duplicate input, simultaneous input, expired sessions, reconnects, process restarts, transport errors, rate-limit delays, and stale queued frames.
- Provide fake/in-memory transport for fast tests and a simulator for visual review.
- Hardware tests must begin with a write-scoped development token, respect Quiet Hours, use a conservative cadence, and avoid repeated full-board transitions.
- Never make live hardware tests part of the default automated test command.

## Repository conventions for future work

- Canonical remote: `https://github.com/paulditterline/vestaquest.git` (`origin`).
- Keep `main` clean and do implementation/documentation work on focused feature branches. Use the `codex/` prefix for agent-created branches unless the owner requests another name.
- Add a useful `README.md` with the first implementation slice. It should describe the game, local setup, simulator, tests, transport modes, credential handling, and physical-board test workflow based on code that actually exists; do not fill it with speculative commands before the stack is chosen.
- The Slice 1 stack was selected on 2026-08-09: Node.js 22, strict TypeScript, npm workspaces, React with Vite for the simulator/controller, Vitest, Playwright, ESLint, and Prettier. Fastify now provides the private session API. Private persistence uses Node 22's built-in `node:sqlite` behind `SessionRepository`; ADR 0001 records its active-development risk and isolation. Revisit a choice only when implementation evidence or a Vestaboard platform requirement justifies an ADR.
- Keep domain rules, presentation/layout, Vestaboard transport, and web UI as separate modules.
- Keep external APIs behind typed interfaces and validate all inbound/outbound payloads.
- Prefer small commits once version control begins. Never commit credentials, generated session data, or player personal data.
- Add Architecture Decision Records for marketplace authentication, persistence, hosting, and multiplayer once those decisions are made.
- Update the research date and this file when official API behavior changes.

## Research status summary

The private path is feasible now: a server-side companion app can use the Cloud Read/Write API without Vestaboard+, and a LAN-hosted variant can optionally use the Local API. The public Store path is plausible and encouraged by Vestaboard's marketplace, but its current multi-customer authentication and interactive-input contract are not publicly documented. Confirm that contract with Vestaboard before choosing the production hosting/auth architecture.
