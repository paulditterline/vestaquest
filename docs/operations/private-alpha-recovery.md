# Private-alpha save and display recovery

VestaQuest treats the server's SQLite database as authoritative. The browser
stores only the active session ID; it never stores game state, dice state,
board credentials, or pending commands.

## Normal resume

- Refreshing or reopening the controller requests the saved session from the
  server.
- The response contains only the current controller status and legal numbered
  inputs.
- If a process restart interrupted a board sequence, reconnecting restarts its
  first pending durable presentation intent in sequence order.
- Input stays locked until the stable frame is confirmed as displayed.
- Repeated reconnects and a second controller viewing the same session coalesce
  onto the same dispatch; they do not duplicate a choice or board sequence.

If browser storage is unavailable, the active page still works, but automatic
resume after closing it is unavailable.

## Interrupted board output

A delivery that exhausts its safe retries changes the display status to
`BLOCKED`. VestaQuest stops sending later frames and does not accept another
game choice. This prevents the controller from advancing beyond an uncertain
physical board.

The controller then offers **Retry Board** and **New Game**:

- **Retry Board** resumes from the first pending durable frame. It does not
  reroll dice, repeat a game command, or skip a transient presentation.
- **New Game** abandons the blocked run from the controller's perspective and
  starts a separate session. The old session remains in SQLite for diagnosis.

After a server restart, no in-memory queue record is assumed to be valid. The
same Retry Board operation reconstructs the pending sequence from SQLite.

## Operator checks

1. Keep `.vestaquest/sessions.sqlite` private and include it in normal local
   backups while a run matters.
2. If the controller shows `LOCKED` after a restart, leave it open; reconnect
   automatically resumes pending output.
3. If it shows `BLOCKED`, resolve connectivity or competing-board activity,
   then press **Retry Board** once.
4. If retry blocks again, do not repeatedly force writes. Inspect the server
   log and board connectivity before another attempt.
5. Use **New Game** only when abandoning the interrupted run is acceptable.

Automated coverage verifies stable resume, pending-sequence resume, blocked
retry in the same process, blocked retry after process restart, controller
locking, and exact ordered delivery.
