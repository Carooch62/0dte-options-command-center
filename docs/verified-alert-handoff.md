# Verified option alert handoff

`watch-alert.js` prepares the exact contract message from a current OPEN scan and a fresh, individually checked Robinhood option quote. It rejects stale, ambiguous, wide, expensive or untradeable contracts and a link that is missing or tied to a different Robinhood instrument ID. The supplied link must come from a separately verified provider-supported contract URL resolver; a plausible URL string alone does not establish a working deep link. This module does not infer or manufacture a Robinhood link.

No notification is wired to the pilot. `WATCH_QUOTE_PILOT_ENABLED` remains off. The existing Discord watch messages are delayed research rechecks, not verified option alerts. Before sending real verified alerts: confirm the provider permits unattended collection and how sessions renew; establish an exact provider link from a tested source; configure the owner-controlled Discord webhook; test delivery and duplicate suppression. The SMS adapter has been removed. Keep secrets private and never place an order from the alert handler.

## Private readiness check

The owner-protected `GET /private/watch/readiness` reports non-secret requirements and enabled flags. It does not collect quotes, resolve a Robinhood link, send a Discord message, or change any switch. Hosted polling permission and the exact contract link remain unverified and are reported as missing until a provider-supported implementation is reviewed. The existing `POST /private/watch` test action can check a configured Discord webhook after owner authentication.
