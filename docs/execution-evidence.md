# Private execution evidence

The brokerage review accepts a separate `execution-review-v1` JSON import. Records stay in memory for the current page session and are included in the private research export. They are never sent to the public repository. Reloading clears the import; disconnect also clears it.

Each record requires `transaction_id` (the corresponding provider source ID), `symbol` (standard option contract symbol), `action` (`buy` or `sell`), `qty` (contracts), `price` (per share), `filled_at` (timezone-qualified ISO timestamp), `precision` (`minute` or `second`) and `source_ref` (the broker execution record or filled-order screenshot). Source IDs, symbol, quantity and price must agree with the reconciled provider record. Conflicts and unmatched evidence are reported.

For a screenshot displaying 12:47 PM EDT on October 6, 2026, use `2026-10-06T16:47:00Z` and `precision: "minute"`. The timestamp denotes the beginning of the displayed minute; it does not claim the fill happened at second zero. Scanner comparisons use that conservative beginning to avoid selecting information published later within the minute. Exact execution verification remains false unless both legs have second precision. Supplying a source reference is user-provided evidence, not independent broker API attestation.

Daily `data/archive/YYYY-MM-DD/brokerage-scans.json` files expose original decision-time candidate fields from compressed retained scans. They omit subsequent outcome labels and markouts. The review loads archives for reconciled entry dates and reports unavailable dates in the export. An archive being absent or empty does not establish a complete session. Full source snapshots and option observations remain in the compressed archive. Index creation is part of each scanner publication; earlier indexes were backfilled from retained source snapshots.

ML remains gated on audited timestamp/quote coverage, distinct sessions and chronological train/validation periods with an untouched test period. Fill screenshots with minute precision cannot establish exact entry Greeks or executable quotes.
