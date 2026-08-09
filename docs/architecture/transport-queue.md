# Transport queue semantics

The Slice 2 queue provides ordered, single-process delivery—not exactly-once physical display.

- One queue owns one board transport and allows one write attempt in flight.
- A nonzero transport cadence delays the first attempt by a full interval. This conservative startup guard avoids writing immediately after an unknown pre-restart or external write.
- Essential frames are FIFO barriers and are never coalesced.
- A replaceable frame may supersede only a pending frame with the same key after the latest unresolved essential barrier.
- Retry attempts reuse the same frozen, validated layout. They observe cadence, exponential backoff, and a longer `Retry-After` value.
- After an ambiguous Cloud send, the queue waits through the write interval, reads the current board, and treats an exact layout match as reconciled. If it does not match, retry remains possible.
- Terminal failure blocks the head of the queue. `whenQuiescent()` observes delivered or blocked state; `whenIdle()` means no pending, in-flight, or blocked records remain.
- Abort outcomes report whether an attempted write may already have been delivered.

Cloud has no documented idempotency key or delivery-status endpoint. A current-layout match cannot prove which actor wrote it, whether a transient frame was observed, or whether the same layout appeared earlier. Delivery is therefore ordered and at-least-once under ambiguity.

The Slice 2 queue is intentionally in memory. Settled IDs/layouts are retained for duplicate-ID protection over this short-lived spike. Slice 3 must move pending intent and the last write-attempt timestamp into the authoritative session/outbox transaction, establish bounded retention, and restore the cadence deadline after restart before the queue becomes a long-running service.
