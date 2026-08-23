import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { isDeepStrictEqual } from 'node:util';
import {
  IdempotencyKeySchema,
  SessionIdSchema,
  type IdempotencyKey,
  type SessionId,
} from '@vestaquest/contracts';
import {
  deriveTitlePresentation,
  replayRun,
  type AcceptedCommandEntry,
  type CombatNoticePresentation,
  type GamePresentation,
  type GameView,
  type MapViewGrid,
  type OpposedRollPresentation,
  type RunState,
} from '@vestaquest/game';
import { DuplicateSessionError, type SessionRepository } from './repository.js';
import type {
  CommandDecision,
  CommandReceipt,
  PresentationIntent,
  PresentationPayload,
  RepositoryCommandResult,
  StoredSession,
} from './types.js';

const SCHEMA_VERSION = 1;

export class PersistenceCorruptionError extends Error {
  public constructor(entity: string) {
    super(`Persisted ${entity} is invalid or corrupt.`);
    this.name = 'PersistenceCorruptionError';
  }
}

export class SqliteSessionRepository implements SessionRepository {
  readonly #database: DatabaseSync;
  #closed = false;

  public constructor(path: string) {
    if (path.length === 0)
      throw new TypeError('SQLite path must not be empty.');
    this.#database = new DatabaseSync(path, { allowExtension: false });
    try {
      this.#database.exec(
        'PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;',
      );
      this.#migrate();
    } catch (error) {
      this.#database.close();
      throw error;
    }
  }

  public create(
    session: StoredSession,
    intents: readonly PresentationIntent[],
  ): Promise<void> {
    return asPromise(() =>
      this.#transaction(() => {
        if (this.#selectSessionRow(session.sessionId)) {
          throw new DuplicateSessionError(session.sessionId);
        }
        this.#insertSession(session);
        for (const intent of intents) this.#insertIntent(intent);
      }),
    );
  }

  public get(sessionId: SessionId): Promise<StoredSession | undefined> {
    return asPromise(() => {
      this.#assertOpen();
      const row = this.#selectSessionRow(sessionId);
      return row ? parseSessionRow(row) : undefined;
    });
  }

  public listPresentationIntents(
    sessionId: SessionId,
  ): Promise<readonly PresentationIntent[]> {
    return asPromise(() => {
      this.#assertOpen();
      const rows = this.#database
        .prepare(
          `SELECT id, session_id, view_version, sequence, is_stable, status,
                payload_json
           FROM presentation_intents
          WHERE session_id = ?
          ORDER BY sequence ASC`,
        )
        .all(sessionId);
      return Object.freeze(rows.map(parseIntentRow));
    });
  }

  public executeCommand(
    sessionId: SessionId,
    idempotencyKey: IdempotencyKey,
    requestFingerprint: string,
    decide: (current: StoredSession) => CommandDecision,
  ): Promise<RepositoryCommandResult | undefined> {
    return asPromise(() =>
      this.#transaction(() => {
        const row = this.#selectSessionRow(sessionId);
        if (!row) return undefined;
        const current = parseSessionRow(row);
        const existingRow = this.#database
          .prepare(
            `SELECT session_id, idempotency_key, request_fingerprint, receipt_json
             FROM command_receipts
            WHERE session_id = ? AND idempotency_key = ?`,
          )
          .get(sessionId, idempotencyKey);
        if (existingRow) {
          const receipt = parseReceiptRow(existingRow);
          return {
            kind:
              receipt.requestFingerprint === requestFingerprint
                ? 'replayed'
                : 'idempotency-conflict',
            receipt,
            session: current,
          };
        }

        const decision = decide(current);
        if (
          decision.receipt.sessionId !== sessionId ||
          decision.receipt.idempotencyKey !== idempotencyKey ||
          decision.receipt.requestFingerprint !== requestFingerprint
        ) {
          throw new Error(
            'Command decision does not match its repository key.',
          );
        }
        this.#database
          .prepare(
            `INSERT INTO command_receipts
             (session_id, idempotency_key, request_fingerprint, receipt_json)
           VALUES (?, ?, ?, ?)`,
          )
          .run(
            sessionId,
            idempotencyKey,
            requestFingerprint,
            JSON.stringify(decision.receipt),
          );

        const next = decision.transition?.session ?? current;
        if (decision.transition) {
          this.#updateSession(next);
          for (const intent of decision.transition.presentationIntents) {
            this.#insertIntent(intent);
          }
        }
        return { kind: 'committed', receipt: decision.receipt, session: next };
      }),
    );
  }

  public acknowledgeDisplayed(
    sessionId: SessionId,
    viewVersion: number,
    updatedAtMs: number,
  ): Promise<StoredSession | undefined> {
    return asPromise(() =>
      this.#transaction(() => {
        const row = this.#selectSessionRow(sessionId);
        if (!row) return undefined;
        const current = parseSessionRow(row);
        if (current.state.revision !== viewVersion) return undefined;
        const terminal =
          current.state.phase.kind === 'victory' ||
          current.state.phase.kind === 'death';
        const updated = Object.freeze({
          ...current,
          displayStatus: terminal ? 'complete' : 'ready',
          updatedAtMs,
        }) satisfies StoredSession;
        this.#updateSession(updated);
        this.#database
          .prepare(
            `UPDATE presentation_intents
              SET status = 'delivered'
            WHERE session_id = ? AND view_version = ?`,
          )
          .run(sessionId, viewVersion);
        return updated;
      }),
    );
  }

  public markDisplayBlocked(
    sessionId: SessionId,
    viewVersion: number,
    updatedAtMs: number,
  ): Promise<StoredSession | undefined> {
    return asPromise(() =>
      this.#transaction(() => {
        const row = this.#selectSessionRow(sessionId);
        if (!row) return undefined;
        const current = parseSessionRow(row);
        if (current.state.revision !== viewVersion) return undefined;
        const updated = Object.freeze({
          ...current,
          displayStatus: 'blocked' as const,
          updatedAtMs,
        });
        this.#updateSession(updated);
        return updated;
      }),
    );
  }

  public close(): Promise<void> {
    return asPromise(() => {
      if (this.#closed) return;
      this.#closed = true;
      this.#database.close();
    });
  }

  #migrate(): void {
    this.#database.exec('BEGIN IMMEDIATE');
    try {
      this.#database.exec(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          version INTEGER PRIMARY KEY,
          applied_at_ms INTEGER NOT NULL
        );
      `);
      const versionRow = this.#database
        .prepare('SELECT MAX(version) AS version FROM schema_migrations')
        .get();
      const versionValue = versionRow?.version;
      const version =
        versionValue === null || versionValue === undefined
          ? 0
          : requireInteger(versionValue, 'schema migration version');
      if (version > SCHEMA_VERSION) {
        throw new Error(
          `SQLite schema version ${version} is newer than supported.`,
        );
      }
      if (version < 1) {
        this.#database.exec(`
          CREATE TABLE sessions (
            session_id TEXT PRIMARY KEY,
            state_json TEXT NOT NULL,
            display_status TEXT NOT NULL CHECK(display_status IN ('locked','ready','blocked','complete')),
            next_presentation_sequence INTEGER NOT NULL CHECK(next_presentation_sequence >= 0),
            created_at_ms INTEGER NOT NULL,
            updated_at_ms INTEGER NOT NULL
          );
          CREATE TABLE presentation_intents (
            id TEXT PRIMARY KEY,
            session_id TEXT NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
            view_version INTEGER NOT NULL CHECK(view_version >= 0),
            sequence INTEGER NOT NULL CHECK(sequence >= 0),
            is_stable INTEGER NOT NULL CHECK(is_stable IN (0,1)),
            status TEXT NOT NULL CHECK(status IN ('pending','delivered')),
            payload_json TEXT NOT NULL,
            UNIQUE(session_id, sequence)
          );
          CREATE TABLE command_receipts (
            session_id TEXT NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
            idempotency_key TEXT NOT NULL,
            request_fingerprint TEXT NOT NULL,
            receipt_json TEXT NOT NULL,
            PRIMARY KEY(session_id, idempotency_key)
          );
          CREATE INDEX presentation_intents_pending
            ON presentation_intents(session_id, status, sequence);
        `);
        this.#database
          .prepare(
            'INSERT INTO schema_migrations (version, applied_at_ms) VALUES (?, ?)',
          )
          .run(1, Date.now());
      }
      this.#database.exec('COMMIT');
    } catch (error) {
      this.#database.exec('ROLLBACK');
      throw error;
    }
  }

  #transaction<T>(operation: () => T): T {
    this.#assertOpen();
    this.#database.exec('BEGIN IMMEDIATE');
    try {
      const result = operation();
      this.#database.exec('COMMIT');
      return result;
    } catch (error) {
      this.#database.exec('ROLLBACK');
      throw error;
    }
  }

  #selectSessionRow(sessionId: SessionId) {
    return this.#database
      .prepare(
        `SELECT session_id, state_json, display_status,
                next_presentation_sequence, created_at_ms, updated_at_ms
           FROM sessions WHERE session_id = ?`,
      )
      .get(sessionId);
  }

  #insertSession(session: StoredSession): void {
    this.#database
      .prepare(
        `INSERT INTO sessions
           (session_id, state_json, display_status, next_presentation_sequence,
            created_at_ms, updated_at_ms)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(...sessionValues(session));
  }

  #updateSession(session: StoredSession): void {
    this.#database
      .prepare(
        `UPDATE sessions
            SET state_json = ?, display_status = ?,
                next_presentation_sequence = ?, created_at_ms = ?, updated_at_ms = ?
          WHERE session_id = ?`,
      )
      .run(
        JSON.stringify(session.state),
        session.displayStatus,
        session.nextPresentationSequence,
        session.createdAtMs,
        session.updatedAtMs,
        session.sessionId,
      );
  }

  #insertIntent(intent: PresentationIntent): void {
    this.#database
      .prepare(
        `INSERT INTO presentation_intents
           (id, session_id, view_version, sequence, is_stable, status, payload_json)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        intent.id,
        intent.sessionId,
        intent.viewVersion,
        intent.sequence,
        intent.isStable ? 1 : 0,
        intent.status,
        JSON.stringify(intent.payload),
      );
  }

  #assertOpen(): void {
    if (this.#closed) throw new Error('SQLite session repository is closed.');
  }
}

function sessionValues(session: StoredSession): SQLInputValue[] {
  return [
    session.sessionId,
    JSON.stringify(session.state),
    session.displayStatus,
    session.nextPresentationSequence,
    session.createdAtMs,
    session.updatedAtMs,
  ];
}

function parseSessionRow(row: Record<string, unknown>): StoredSession {
  try {
    const sessionId = SessionIdSchema.parse(row.session_id);
    const displayStatus = requireEnum(row.display_status, [
      'locked',
      'ready',
      'blocked',
      'complete',
    ] as const);
    return Object.freeze({
      sessionId,
      state: parseRunState(requireString(row.state_json)),
      displayStatus,
      nextPresentationSequence: requireNonnegativeInteger(
        row.next_presentation_sequence,
        'next presentation sequence',
      ),
      createdAtMs: requireInteger(row.created_at_ms, 'created timestamp'),
      updatedAtMs: requireInteger(row.updated_at_ms, 'updated timestamp'),
    });
  } catch (error) {
    if (error instanceof PersistenceCorruptionError) throw error;
    throw new PersistenceCorruptionError('session row');
  }
}

function parseRunState(json: string): RunState {
  const candidate = parseJsonObject(json, 'run state');
  const seed = requireNonnegativeInteger(candidate.seed, 'run seed');
  const commandsValue = candidate.acceptedCommands;
  if (!Array.isArray(commandsValue))
    throw new PersistenceCorruptionError('run state');
  const commands = commandsValue.map(parseAcceptedCommand);
  let replayed: RunState;
  try {
    replayed = replayRun(seed, commands);
  } catch {
    throw new PersistenceCorruptionError('run state');
  }
  if (!isDeepStrictEqual(replayed, candidate)) {
    throw new PersistenceCorruptionError('run state');
  }
  return replayed;
}

function parseAcceptedCommand(value: unknown): AcceptedCommandEntry {
  const entry = requireExactObject(value, [
    'sequence',
    'command',
    'resultingPhase',
    'rngDraws',
  ]);
  const command = requireExactObject(entry.command, [
    'type',
    'commandId',
    'viewId',
    'choiceId',
  ]);
  if (command.type !== 'choose')
    throw new PersistenceCorruptionError('command log');
  return Object.freeze({
    sequence: requireNonnegativeInteger(entry.sequence, 'command sequence'),
    command: Object.freeze({
      type: 'choose',
      commandId: requireString(command.commandId),
      viewId: requireString(command.viewId),
      choiceId: requireString(command.choiceId),
    }),
    resultingPhase: requireEnum(entry.resultingPhase, [
      'class-select',
      'exploration',
      'combat',
      'victory',
      'death',
    ] as const),
    rngDraws: requireNonnegativeInteger(entry.rngDraws, 'RNG draws'),
  });
}

function parseIntentRow(row: Record<string, unknown>): PresentationIntent {
  try {
    return Object.freeze({
      id: requireString(row.id),
      sessionId: SessionIdSchema.parse(row.session_id),
      viewVersion: requireNonnegativeInteger(row.view_version, 'view version'),
      sequence: requireNonnegativeInteger(row.sequence, 'intent sequence'),
      isStable: requireBooleanInteger(row.is_stable),
      status: requireEnum(row.status, ['pending', 'delivered'] as const),
      payload: parsePresentationPayload(requireString(row.payload_json)),
    });
  } catch (error) {
    if (error instanceof PersistenceCorruptionError) throw error;
    throw new PersistenceCorruptionError('presentation intent row');
  }
}

function parsePresentationPayload(json: string): PresentationPayload {
  const payload = parseJsonObject(json, 'presentation payload');
  if (payload.kind === 'title') {
    const expected = {
      kind: 'title' as const,
      presentation: deriveTitlePresentation(),
    };
    if (!isDeepStrictEqual(payload, expected)) {
      throw new PersistenceCorruptionError('title presentation');
    }
    return Object.freeze(expected);
  }
  if (payload.kind === 'roll-scaffold' || payload.kind === 'roll-result') {
    requireKeys(payload, ['kind', 'presentation']);
    const presentation = parseGamePresentation(payload.presentation);
    if (presentation.kind !== 'opposed-roll') {
      throw new PersistenceCorruptionError('roll presentation');
    }
    return Object.freeze({
      kind: payload.kind,
      presentation,
    });
  }
  if (payload.kind === 'combat-notice') {
    requireKeys(payload, ['kind', 'presentation']);
    const presentation = parseGamePresentation(payload.presentation);
    if (presentation.kind !== 'combat-notice') {
      throw new PersistenceCorruptionError('combat notice presentation');
    }
    return Object.freeze({ kind: payload.kind, presentation });
  }
  if (payload.kind !== 'game-view') {
    throw new PersistenceCorruptionError('presentation payload');
  }
  const view = parseGameView(payload.view);
  if (!isDeepStrictEqual(payload, { kind: 'game-view', view })) {
    throw new PersistenceCorruptionError('game view presentation');
  }
  return Object.freeze({ kind: 'game-view', view });
}

function parseGamePresentation(value: unknown): GamePresentation {
  const kind = requireRecord(value).kind;
  if (kind === 'combat-notice') return parseCombatNotice(value);
  const presentation = requireExactObject(value, [
    'kind',
    'purpose',
    'prompt',
    'left',
    'right',
    'verdict',
  ]);
  if (presentation.kind !== 'opposed-roll') {
    throw new PersistenceCorruptionError('game presentation');
  }
  const verdict = requireString(presentation.verdict);
  if (verdict.length < 1 || verdict.length > 22) {
    throw new PersistenceCorruptionError('roll verdict');
  }
  const prompt = requireString(presentation.prompt);
  if (prompt.length < 1 || prompt.length > 22) {
    throw new PersistenceCorruptionError('roll prompt');
  }
  return Object.freeze({
    kind: 'opposed-roll',
    purpose: requireEnum(presentation.purpose, [
      'initiative',
      'attack',
      'run',
      'spell',
      'steal',
    ] as const),
    prompt,
    left: parseRollSide(presentation.left),
    right: parseRollSide(presentation.right),
    verdict,
  });
}

function parseCombatNotice(value: unknown): CombatNoticePresentation {
  const presentation = requireExactObject(value, [
    'kind',
    'heading',
    'heroClass',
    'hp',
    'maximumHp',
  ]);
  if (presentation.kind !== 'combat-notice') {
    throw new PersistenceCorruptionError('combat notice');
  }
  const hp = requireNonnegativeInteger(presentation.hp, 'hero HP');
  const maximumHp = requirePositiveInteger(
    presentation.maximumHp,
    'hero maximum HP',
  );
  if (maximumHp > 5 || hp > maximumHp) {
    throw new PersistenceCorruptionError('combat notice HP');
  }
  return Object.freeze({
    kind: 'combat-notice',
    heading: requireEnum(presentation.heading, [
      'HEALED 1 HP',
      'HEALED 2 HP',
    ] as const),
    heroClass: parseHeroClass(presentation.heroClass),
    hp,
    maximumHp,
  });
}

function parseRollSide(value: unknown): OpposedRollPresentation['left'] {
  const side = requireExactObject(value, [
    'name',
    'diceLabel',
    'dice',
    'modifierStat',
    'modifier',
    'total',
  ]);
  const diceLabel = requireEnum(side.diceLabel, ['D6', '2D6'] as const);
  if (!Array.isArray(side.dice)) {
    throw new PersistenceCorruptionError('roll dice');
  }
  const dice = Object.freeze(
    side.dice.map((die) => {
      const parsed = requirePositiveInteger(die, 'die result');
      if (parsed > 6) throw new PersistenceCorruptionError('die result');
      return parsed;
    }),
  );
  if (dice.length !== (diceLabel === '2D6' ? 2 : 1)) {
    throw new PersistenceCorruptionError('roll dice');
  }
  const modifier = requireNonnegativeInteger(side.modifier, 'roll modifier');
  const total = requirePositiveInteger(side.total, 'roll total');
  if (total !== dice[0]! + modifier) {
    throw new PersistenceCorruptionError('roll total');
  }
  return Object.freeze({
    name: requireEnum(side.name, [
      'WARRIOR',
      'ROGUE',
      'WIZARD',
      'GHOUL',
      'SKELETON KNIGHT',
    ] as const),
    diceLabel,
    dice,
    modifierStat: requireEnum(side.modifierStat, ['P', 'D', 'S'] as const),
    modifier,
    total,
  });
}

function parseGameView(value: unknown): GameView {
  const view = requireRecord(value);
  const kind = requireEnum(view.kind, [
    'class-select',
    'exploration',
    'combat',
    'spell-select',
    'loot-select',
    'victory',
    'death',
  ] as const);
  const choices = parseChoices(view.choices);
  const base = {
    id: requireString(view.id),
    revision: requireNonnegativeInteger(view.revision, 'view revision'),
    choices,
  };
  switch (kind) {
    case 'class-select':
      requireKeys(view, ['id', 'revision', 'choices', 'kind', 'prompt']);
      if (view.prompt !== 'CHOOSE YOUR CLASS')
        throw new PersistenceCorruptionError('game view');
      if (
        !isDeepStrictEqual(choices, [
          { id: 'class.warrior', number: 1, label: 'WARRIOR' },
          { id: 'class.rogue', number: 2, label: 'ROGUE' },
          { id: 'class.wizard', number: 3, label: 'WIZARD' },
        ])
      ) {
        throw new PersistenceCorruptionError('class choices');
      }
      return Object.freeze({ ...base, kind, prompt: 'CHOOSE YOUR CLASS' });
    case 'exploration': {
      requireKeys(view, [
        'id',
        'revision',
        'choices',
        'kind',
        'heroClass',
        'level',
        'hp',
        'maximumHp',
        'power',
        'defense',
        'skill',
        'luck',
        'roomsFound',
        'directions',
        'heldItem',
        'canUseItem',
        'grid',
      ]);
      if (!Array.isArray(view.directions) || !Array.isArray(view.grid)) {
        throw new PersistenceCorruptionError('game view');
      }
      const directions = Object.freeze(
        view.directions.map((direction) =>
          requireEnum(direction, ['N', 'E', 'S', 'W'] as const),
        ),
      );
      const canUseItem = requireBoolean(view.canUseItem, 'item usability');
      const heldItem =
        view.heldItem === null
          ? null
          : requireEnum(view.heldItem, ['HEAL'] as const);
      const directionChoices = choices.slice(0, directions.length);
      const itemChoice = choices[directions.length];
      if (
        directions.length < 1 ||
        directions.length > 4 ||
        new Set(directions).size !== directions.length ||
        directionChoices.some(
          (choice, index) =>
            choice.number !== index + 1 || choice.label !== directions[index],
        ) ||
        choices.length !== directions.length + (canUseItem ? 1 : 0) ||
        canUseItem !==
          (itemChoice?.id === 'action.item' && itemChoice.label === 'HEAL') ||
        (canUseItem && heldItem === null)
      ) {
        throw new PersistenceCorruptionError('exploration choices');
      }
      return Object.freeze({
        ...base,
        kind,
        heroClass: parseHeroClass(view.heroClass),
        level: requirePositiveInteger(view.level, 'hero level'),
        hp: requireNonnegativeInteger(view.hp, 'hero HP'),
        maximumHp: requirePositiveInteger(view.maximumHp, 'hero maximum HP'),
        power: requireNonnegativeInteger(view.power, 'hero power'),
        defense: requireNonnegativeInteger(view.defense, 'hero defense'),
        skill: requireNonnegativeInteger(view.skill, 'hero skill'),
        luck: requireNonnegativeInteger(view.luck, 'hero luck'),
        roomsFound: requirePositiveInteger(view.roomsFound, 'rooms found'),
        directions,
        heldItem,
        canUseItem,
        grid: parseMapGrid(view.grid),
      });
    }
    case 'combat': {
      requireKeys(view, [
        'id',
        'revision',
        'choices',
        'kind',
        'heroClass',
        'level',
        'hp',
        'maximumHp',
        'enemyId',
        'enemyName',
        'enemyHp',
        'enemyMaximumHp',
        'smashAvailable',
        'heldItem',
        'scrollsRemaining',
        'stealAvailable',
      ]);
      const enemyId = requireEnum(view.enemyId, [
        'ghoul',
        'skeleton-knight',
      ] as const);
      const enemyName = requireEnum(view.enemyName, [
        'GHOUL',
        'SKELETON KNIGHT',
      ] as const);
      if (
        (enemyId === 'ghoul' && enemyName !== 'GHOUL') ||
        (enemyId === 'skeleton-knight' && enemyName !== 'SKELETON KNIGHT') ||
        choices.length < 2 ||
        choices.length > 4 ||
        choices.some((choice, index) => choice.number !== index + 1)
      ) {
        throw new PersistenceCorruptionError('combat view');
      }
      return Object.freeze({
        ...base,
        kind,
        heroClass: parseHeroClass(view.heroClass),
        level: requirePositiveInteger(view.level, 'hero level'),
        hp: requireNonnegativeInteger(view.hp, 'hero HP'),
        maximumHp: requirePositiveInteger(view.maximumHp, 'hero maximum HP'),
        enemyId,
        enemyName,
        enemyHp: requirePositiveInteger(view.enemyHp, 'enemy HP'),
        enemyMaximumHp: requirePositiveInteger(
          view.enemyMaximumHp,
          'enemy maximum HP',
        ),
        smashAvailable: requireBoolean(
          view.smashAvailable,
          'smash availability',
        ),
        heldItem:
          view.heldItem === null
            ? null
            : requireEnum(view.heldItem, ['HEAL'] as const),
        scrollsRemaining: requireNonnegativeInteger(
          view.scrollsRemaining,
          'scrolls remaining',
        ),
        stealAvailable: requireBoolean(
          view.stealAvailable,
          'steal availability',
        ),
      });
    }
    case 'spell-select': {
      requireKeys(view, [
        'id',
        'revision',
        'choices',
        'kind',
        'enemyName',
        'scrolls',
      ]);
      const enemyName = requireEnum(view.enemyName, [
        'GHOUL',
        'SKELETON KNIGHT',
      ] as const);
      const scrolls = requireExactObject(view.scrolls, [
        'FIREBALL',
        'LIGHTNING',
        'STUN',
      ]);
      const parsedScrolls = Object.freeze({
        FIREBALL: requireNonnegativeInteger(scrolls.FIREBALL, 'fireball count'),
        LIGHTNING: requireNonnegativeInteger(
          scrolls.LIGHTNING,
          'lightning count',
        ),
        STUN: requireNonnegativeInteger(scrolls.STUN, 'stun count'),
      });
      const expectedLabels = [
        ...(parsedScrolls.FIREBALL > 0 ? ['FIREBALL'] : []),
        ...(parsedScrolls.LIGHTNING > 0 ? ['LIGHTNING'] : []),
        ...(parsedScrolls.STUN > 0 ? ['STUN'] : []),
        'CANCEL',
      ];
      if (
        choices.length !== expectedLabels.length ||
        choices.some(
          (choice, index) =>
            choice.number !== index + 1 ||
            choice.label !== expectedLabels[index],
        )
      ) {
        throw new PersistenceCorruptionError('spell choices');
      }
      return Object.freeze({
        ...base,
        kind,
        enemyName,
        scrolls: parsedScrolls,
      });
    }
    case 'loot-select': {
      requireKeys(view, [
        'id',
        'revision',
        'choices',
        'kind',
        'heading',
        'itemName',
        'slot',
        'bonus',
        'equippedName',
      ]);
      if (
        !isDeepStrictEqual(choices, [
          { id: 'loot.equip', number: 1, label: 'EQUIP' },
          { id: 'loot.leave', number: 2, label: 'LEAVE' },
        ])
      ) {
        throw new PersistenceCorruptionError('loot choices');
      }
      return Object.freeze({
        ...base,
        kind,
        heading: requireEnum(view.heading, [
          'STOLEN LOOT',
          'BATTLE LOOT',
        ] as const),
        itemName: requireEnum(view.itemName, [
          'GHOUL FANG',
          'BONE MAIL',
          'IRON SWORD',
          'CHAIN MAIL',
          'SHADOW KNIFE',
          'NIGHT CLOAK',
          'ASH WAND',
          'RUNE ROBE',
        ] as const),
        slot: requireEnum(view.slot, ['WEAPON', 'ARMOR'] as const),
        bonus: requireEnum(view.bonus, ['+1 POWER', '+1 DEFENSE'] as const),
        equippedName: requireEnum(view.equippedName, [
          'EMPTY',
          'GHOUL FANG',
          'BONE MAIL',
          'IRON SWORD',
          'CHAIN MAIL',
          'SHADOW KNIFE',
          'NIGHT CLOAK',
          'ASH WAND',
          'RUNE ROBE',
        ] as const),
      });
    }
    case 'victory':
      requireKeys(view, [
        'id',
        'revision',
        'choices',
        'kind',
        'heroClass',
        'heading',
        'roomsFound',
        'enemiesSlain',
      ]);
      if (view.heading !== 'YOU ESCAPED!')
        throw new PersistenceCorruptionError('game view');
      if (choices.length !== 0)
        throw new PersistenceCorruptionError('terminal choices');
      return Object.freeze({
        ...base,
        kind,
        heroClass: parseHeroClass(view.heroClass),
        heading: 'YOU ESCAPED!',
        roomsFound: requirePositiveInteger(view.roomsFound, 'rooms found'),
        enemiesSlain: requireNonnegativeInteger(
          view.enemiesSlain,
          'enemies slain',
        ),
      });
    case 'death':
      requireKeys(view, [
        'id',
        'revision',
        'choices',
        'kind',
        'heroClass',
        'heading',
        'cause',
        'roomsFound',
        'enemiesSlain',
        'roomsUntilExit',
      ]);
      if (view.heading !== 'YOU DIED') {
        throw new PersistenceCorruptionError('game view');
      }
      if (choices.length !== 0)
        throw new PersistenceCorruptionError('terminal choices');
      return Object.freeze({
        ...base,
        kind,
        heroClass: parseHeroClass(view.heroClass),
        heading: 'YOU DIED',
        cause: requireEnum(view.cause, ['GHOUL', 'SKELETON KNIGHT'] as const),
        roomsFound: requirePositiveInteger(view.roomsFound, 'rooms found'),
        enemiesSlain: requireNonnegativeInteger(
          view.enemiesSlain,
          'enemies slain',
        ),
        roomsUntilExit: requireNonnegativeInteger(
          view.roomsUntilExit,
          'rooms until exit',
        ),
      });
  }
}

function parseChoices(value: unknown) {
  if (!Array.isArray(value))
    throw new PersistenceCorruptionError('game choices');
  return Object.freeze(
    value.map((choice) => {
      const record = requireExactObject(choice, ['id', 'number', 'label']);
      return Object.freeze({
        id: requireEnum(record.id, [
          'class.warrior',
          'class.rogue',
          'class.wizard',
          'move.north',
          'move.east',
          'move.south',
          'move.west',
          'action.item',
          'combat.attack',
          'combat.smash',
          'combat.steal',
          'combat.spell',
          'combat.run',
          'spell.fireball',
          'spell.lightning',
          'spell.stun',
          'spell.cancel',
          'loot.equip',
          'loot.leave',
        ] as const),
        number: requirePositiveInteger(record.number, 'choice number'),
        label: requireString(record.label),
      });
    }),
  );
}

function parseMapGrid(value: unknown): MapViewGrid {
  if (!Array.isArray(value) || value.length !== 5) {
    throw new PersistenceCorruptionError('map grid');
  }
  const rows = value.map((row) => {
    if (!Array.isArray(row) || row.length !== 5) {
      throw new PersistenceCorruptionError('map row');
    }
    return Object.freeze(
      row.map((cell) =>
        requireEnum(cell, [
          'unexplored',
          'frontier',
          'explored',
          'current',
          'active-encounter',
          'resolved-encounter',
          'dead-end',
        ] as const),
      ),
    );
  });
  return Object.freeze(rows) as MapViewGrid;
}

function parseHeroClass(value: unknown) {
  return requireEnum(value, ['warrior', 'rogue', 'wizard'] as const);
}

function parseReceiptRow(row: Record<string, unknown>): CommandReceipt {
  try {
    const candidate = parseJsonObject(
      requireString(row.receipt_json),
      'command receipt',
    );
    requireKeys(candidate, [
      'id',
      'sessionId',
      'idempotencyKey',
      'requestFingerprint',
      'originalOutcome',
      'resultingViewVersion',
      'acceptedAtMs',
    ]);
    const receipt = Object.freeze({
      id: requireString(candidate.id),
      sessionId: SessionIdSchema.parse(candidate.sessionId),
      idempotencyKey: IdempotencyKeySchema.parse(candidate.idempotencyKey),
      requestFingerprint: requireString(candidate.requestFingerprint),
      originalOutcome: requireEnum(candidate.originalOutcome, [
        'accepted',
        'stale-view',
        'illegal-choice',
        'blocked',
      ] as const),
      resultingViewVersion: requireNonnegativeInteger(
        candidate.resultingViewVersion,
        'resulting view version',
      ),
      acceptedAtMs: requireInteger(
        candidate.acceptedAtMs,
        'accepted timestamp',
      ),
    });
    if (
      receipt.sessionId !== row.session_id ||
      receipt.idempotencyKey !== row.idempotency_key ||
      receipt.requestFingerprint !== row.request_fingerprint
    ) {
      throw new PersistenceCorruptionError('command receipt row');
    }
    return receipt;
  } catch (error) {
    if (error instanceof PersistenceCorruptionError) throw error;
    throw new PersistenceCorruptionError('command receipt row');
  }
}

function parseJsonObject(
  json: string,
  entity: string,
): Record<string, unknown> {
  try {
    return requireRecord(JSON.parse(json) as unknown);
  } catch {
    throw new PersistenceCorruptionError(entity);
  }
}

function requireRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new PersistenceCorruptionError('JSON object');
  }
  return value as Record<string, unknown>;
}

function requireExactObject(value: unknown, keys: readonly string[]) {
  const record = requireRecord(value);
  requireKeys(record, keys);
  return record;
}

function requireKeys(
  record: Record<string, unknown>,
  keys: readonly string[],
): void {
  const actual = Object.keys(record).sort();
  const expected = [...keys].sort();
  if (!isDeepStrictEqual(actual, expected)) {
    throw new PersistenceCorruptionError('JSON object');
  }
}

function requireString(value: unknown): string {
  if (typeof value !== 'string')
    throw new PersistenceCorruptionError('text value');
  return value;
}

function requireInteger(value: unknown, entity: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    throw new PersistenceCorruptionError(entity);
  }
  return value;
}

function requireNonnegativeInteger(value: unknown, entity: string): number {
  const number = requireInteger(value, entity);
  if (number < 0) throw new PersistenceCorruptionError(entity);
  return number;
}

function requirePositiveInteger(value: unknown, entity: string): number {
  const number = requireInteger(value, entity);
  if (number < 1) throw new PersistenceCorruptionError(entity);
  return number;
}

function requireBooleanInteger(value: unknown): boolean {
  if (value === 0) return false;
  if (value === 1) return true;
  throw new PersistenceCorruptionError('boolean integer');
}

function requireBoolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') {
    throw new PersistenceCorruptionError(label);
  }
  return value;
}

function requireEnum<const T extends readonly string[]>(
  value: unknown,
  allowed: T,
): T[number] {
  if (typeof value !== 'string' || !allowed.includes(value)) {
    throw new PersistenceCorruptionError('enum value');
  }
  return value;
}

function asPromise<T>(operation: () => T): Promise<T> {
  try {
    return Promise.resolve(operation());
  } catch (error) {
    return Promise.reject(
      error instanceof Error ? error : new Error('SQLite operation failed.'),
    );
  }
}
