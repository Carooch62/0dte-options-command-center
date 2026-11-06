# Verified option alert handoff

`watch-alert.js` prepares the exact contract message from a current OPEN scan and a fresh, individually checked Robinhood option quote. It rejects stale, ambiguous, wide, expensive or untradeable contracts and a link that is missing or tied to a different Robinhood instrument ID. The supplied link must come from a separately verified provider-supported contract URL resolver; a plausible URL string alone does not establish a working deep link. This module does not infer or manufacture a Robinhood link.

No notification is wired to the pilot. `WATCH_QUOTE_PILOT_ENABLED` remains off. The existing Discord watch messages are delayed research rechecks, not verified option alerts. Before sending real verified alerts: confirm the provider permits unattended collection and how sessions renew; establish an exact provider link from a tested source; configure the owner-controlled Discord webhook; test delivery and duplicate suppression. The SMS adapter has been removed. Keep secrets private and never place an order from the alert handler.

## Private readiness check

The owner-protected `GET /private/watch/readiness` reports non-secret requirements and enabled flags. It does not collect quotes, resolve a Robinhood link, send a Discord message, or change any switch. Hosted polling permission and the exact contract link remain unverified and are reported as missing until a provider-supported implementation is reviewed.

The owner-protected `/private/watch/setup` page accepts a private Discord webhook URL. `PUT /private/watch/webhook` encrypts it with the existing private 32-byte Worker encryption key and stores it in the private KV namespace. Status returns only `configured` and its management source; it never returns the webhook. `DELETE` removes a URL set through this page. A pre-existing Cloudflare secret takes priority and is managed in Cloudflare instead. The page's Send test message button uses the existing `POST /private/watch` action and sends a labeled `TEST ONLY` Discord message; it does not change the live alert switches. Keep the webhook URL out of chat and GitHub.
