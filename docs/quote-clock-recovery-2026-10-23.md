# Recover rejected provider-clock diagnostics — October 23, 2026

A quote can be rejected with `INVALID_QUOTE_CLOCK` when its provider timestamp
is ahead of the Worker receipt timestamp. The collector intentionally retains
that failed sample in history. Previously, tab recovery rejected the entire
session because it applied the passing-clock requirement to that diagnostic
sample as well; the page then discarded unusable recovery storage.

Recovery now retains a bounded provider-timestamp string only when the sample
is explicitly `REQUIRES_RECHECK`, its multiplier is null and its allowlisted
reasons include `INVALID_QUOTE_CLOCK`. This covers both an ahead-of-receipt
timestamp and an unreadable provider timestamp. The original string and receipt
time are preserved. Such samples cannot create first-passing entries or usable
capture windows. Unflagged invalid provider clocks and falsely passing samples
still fail recovery. Receipt clocks must always be valid and no later than the
recovery time; the 24-hour session limit and existing bounds remain enforced.

History clock parsing uses the same precision-normalizing parser as quote
validation, preserving the original timestamp strings in storage and export.
The quote check itself remains strict: the fix does not add a clock-skew grace
period or change prices, book checks, scoring or eligibility rules.

## Verification

- A synthetic regression reproduced the original failure before the repair.
- Unit checks cover mixed valid/rejected history, preserved first-passing
  decisions and request diagnostics, rejected-only history, unreadable provider
  clocks, and invalid receipt/unflagged clock rejection.
- A local replay of the supplied private test export preserved all 66 original
  observations, six original entries and 18 completed capture windows. The bad
  clock sample stayed rejected. The private file was not modified or committed.
- Candidate Mobile QA adds a synthetic 160-millisecond provider-clock lead,
  followed by same-tab reload and download. It checks history, original decision
  clocks, rejection status and the enabled refresh control after recovery.
- Exact candidate CI/build/mobile results are recorded on the release PR.

## Short phone check after deployment

If the original Quotes tab still has history, export it before reloading.
Reload that same Safari tab and check that its history and refresh control
return. Export again for comparison. No new 15-minute collection is necessary.
If the previous version already discarded the session, or its 24-hour retention
expired, this patch cannot reconstruct that browser session. Keep the original
export; a missing session does not erase the evidence in that file.

Rollback is a normal revert of this focused change through the existing release
workflow. Keep original exports first: the previous recovery implementation
again rejects histories containing the failed provider-clock diagnostic.
