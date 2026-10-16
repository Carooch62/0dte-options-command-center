# Quote-session recovery release

Scope: browser-only quote workflow hardening. No scanner scores, order placement,
authentication policy, private endpoint permissions or production ranking changes.

## Changes

- Recover a bounded candidate batch, exact metadata and timed observations from
  same-tab sessionStorage after reload. Original provider and receipt clocks survive.
- Recovery expires after 24 hours. Storage failures warn to export; expired or
  damaged records are rejected. Closing the tab is not a durable retention method.
- Store only allowlisted contract and quote fields. Credentials, accounts and
  holdings are excluded. This is private browser-local data, not public repository data.
- Ask before replacing or clearing captured observations. Matching and refreshing
  the current cohort do not clear evidence history.
- Use 5/10/15-minute prompts and export the explicit evaluation policy. Each contract
  starts at its own first passing quote receipt. Provider clocks must land in the
  target-to-target-plus-60-second interval; a tap alone cannot satisfy a window.
- Show counts and an optional fresh-within-$0.30 filter. Hidden failures remain in
  the cohort, refresh requests and exports. Quote checks do not imply setup eligibility.

## Release gates

Run combined JavaScript and Python regression tests, browser asset build and
390px/430px mobile QA. Browser QA covers load/match/quote, export policy, reload
recovery, cancel-replacement, filtering and clearing prices after sign-in failure.
Unit tests cover malformed/expired recovery, unavailable storage and field allowlists.

The companion staging outcome change honors explicit 5/10/15 exports while
retaining 5/15/30 for legacy archives without a policy. Keep scoring in shadow mode.
Do not combine this release with the broad staging scanner PR.

## Controlled post-deploy check (not completed by pre-release CI)

1. Sign in privately, load a current batch and match exact contracts.
2. Refresh once and export. Reload, confirm the same cohort and baseline survive.
3. Verify old timestamps stay old and stale prices are not marked verified.
4. Refresh at 5/10/15, export, then evaluate with the companion staging CLI.
5. Cancel a batch replacement and confirm observations remain; clear only after export.

No fresh provider or authenticated hosted claim follows from synthetic browser tests.
If Cloudflare sign-in blocks the agent browser, perform the smoke test in the user's
signed-in session. Do not weaken Access protections.

## Rollback

Revert only this isolated PR and redeploy the previous browser assets. Existing
downloaded exports remain unchanged. Recovery is tab-local and removable with
Clear this quote session before rollback; no server-side data migration is involved.
