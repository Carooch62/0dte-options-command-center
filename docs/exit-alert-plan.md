# Position exit notifications — implementation boundary

Price-first purchase recording is implemented. The entered actual premium drives
the editable plan; source asks no longer substitute when that field is blank.
The default percentage checkpoints remain examples until the user chooses a plan.

Exit notifications are NOT live. Existing setup alerts and their qualification
gates are not a position exit monitor. The current quote pilot has a five-minute
tick; it cannot establish instantaneous or streaming notifications.

Required implementation and activation sequence:

1. Confirm the actual premium, quantity, exact option identity, chosen loss/profit
   checkpoints and expiration. Save an explicitly approved, versioned position
   plan to owner-protected encrypted storage; closing/editing/removing a position
   must cancel/supersede its old monitor. Browser-local storage cannot monitor a
   closed Safari tab on its own.
2. Verify hosted authorization and real rotating-token renewal, then exact option
   metadata and current two-sided quote clocks in actual open market sessions.
3. Poll saved open positions independently of scanner eligibility. Do not apply
   entry ask <= $0.30, delta, news, candidate caps or unchanged-scan checkpoints to
   exits. Check current executable BID for long-option review checkpoints, not ask,
   mark or last-trade price. Missing/stale/ambiguous quotes mean unknown, not a hit.
4. Use an independently verified exchange session and standard multiplier/identity;
   reject expired, halted, nontradable or mismatched contracts. Process bounded
   batches fairly with throttling/backoff; measure request latency and quote age
   before choosing a faster cadence. Preserve the $0 cost constraint. State the
   actual polling interval and delivery delay; never call five-minute polling real
   time. An underlying invalidation alert requires its own fresh underlying quote.
5. Send a private Discord checkpoint summary naming the exact option and reason:
   review a sale / sell to close in Robinhood. Keep raw provider prices and Greeks
   out of Discord under the existing personal-use decision. An alert is not a
   filled sale, guarantee or submitted broker order.
6. Deduplicate per position/plan revision/checkpoint; handle retries and ambiguous
   webhook timeouts explicitly. Test actual delivery, close cancellation, plan
   replacement, missing quotes, expired sessions, failed renewal and no duplicates.
   Keep delivery disabled until these checks pass. Ask for explicit plan activation
   rather than turning illustrative default levels into automatic sell advice.

Next release must include private plan sync and a separately gated position monitor;
this document does not claim those components are implemented or activated.

## Detailed benchmark display

The purchase draft and saved open-position review now show three loss and three
profit premiums per share, with a compact tier-2 profit reference and expandable
input/source-clock reasoning. Changing actual entry/time recomputes the draft;
manually edited checkpoints remain intact. Saved checkpoints are not overwritten
by subsequent reference tables. Exact contract ID and expiry are required to
retrieve option-specific context for saved positions; missing contracts stay unknown.

The reference ladder is explicitly illustrative: loss -10/-20/-30%, profit
+25/+50/+75%, rounded to cents. It is not a calibrated recommended strategy. With
aligned entry/underlying/option clocks, an OPEN session, valid expiration, usable
signed delta/gamma/daily theta, two-sided spread and directional stock targets,
the module can instead show provisional local Greek sensitivity scenarios. The
15/30/60-minute horizons start at the fill, stay within the current session and
limit stock displacements to 3%. These bounds are engineering guardrails, not
empirical accuracy claims. An incomplete ladder uses reference mode throughout.

The scenario proxy is paid premium + delta*dS + gamma*dS^2/2 + theta*minutes/1440
minus the observed spread. Constant IV/Greeks and unverified Greek calculation
clocks prevent an executable-price or forecast claim. Theta diagnostics remain
observations and are not measured decay since entry. Expiration is displayed in
calendar days; broker deadlines remain separate. Catalyst/headline timing, setup,
trend, pattern and volume context explain thesis review, without an arbitrary
numeric catalyst uplift. A resolved catalyst never cancels a loss review.

This is a display/planning release. It does not implement or activate exit alerts,
private position sync, streaming monitoring, broker orders or automatic sales.
