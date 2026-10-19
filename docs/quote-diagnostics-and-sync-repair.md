# Quote diagnostics and large snapshot sync repair

## Separate metadata from quote-check eligibility

The existing private export sets `multiplier` to 100 only when the entire quote check passes. A null value therefore does not by itself establish missing provider multiplier metadata. Old exports do not retain individual check reasons, so do not backfill those reasons or treat null as proof of a metadata defect.

New observations add `metadata_multiplier` (the finite positive instrument multiplier, otherwise null) and `quote_check_reasons` (allowlisted reason codes). These are diagnostic fields only. The existing `multiplier` eligibility sentinel, entry selection, original quote clocks, spread/freshness rules, $0.30 checks and scanner rankings are unchanged. Diagnostics survive tab recovery; unknown reason strings and arbitrary content are not persisted. Old sessions remain compatible and their missing diagnostics remain missing.

In the Oct 19 morning export, the XLF 55.5 call expiring Oct 19 had books that independently failed the 30%-of-midpoint spread limit. The first $0.02/$0.03 book has a $0.01 spread, or 40% of its $0.025 midpoint. Its exported null multiplier could not establish a metadata problem. A separate current read-only Robinhood lookup on Oct 19 returned a 100 multiplier for exact instrument 04bdb484-5cc6-420a-8c69-b7e9b9f5ed29. That current lookup does not prove what metadata was received during the earlier test. No chain-level fallback or assumed multiplier is introduced.

## Large encrypted provider snapshots

Plaid snapshot serialization previously spread the complete encrypted byte array into one `String.fromCharCode` call. A sufficiently large snapshot exceeded the JavaScript argument stack and surfaced `Maximum call stack size exceeded`. Convert bounded 32 KiB chunks before base64 encoding instead. AES-GCM, key handling, IV format, existing encrypted storage format, Access checks and snapshot decryption are unchanged. This does not expand brokerage permissions or reconnect/erase an account.

A regression exercises the actual scheduled sync with 150 synthetic Unicode transactions and an encrypted payload over 500 KiB. The original code reproduces the exact stack error; the repair encrypts, stores, decrypts and restores every transaction, clears the prior error, and preserves the last good encrypted snapshot if a later provider request fails. Synthetic test data is not an upload of brokerage records. A successful live account sync still requires verification after deployment.
