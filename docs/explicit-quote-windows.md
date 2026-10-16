# Explicit quote observation windows

New private browser exports include `validation_policy.horizons_minutes: [5, 10, 15]`.
The offline `shadow_outcomes.py` CLI honors this declaration and validates it against
the supported 5/10/15 and legacy 5/15/30 profiles. Inputs without a policy retain
the legacy profile, so historical reports are not silently reinterpreted.

The 60-second target-to-target-plus-tolerance interval uses each contract's
provider observation time, not button-click time. Receipt may follow observation.
First passing quote receipt remains that contract's decision cutoff. Later
qualifying contracts therefore have later targets. Missing, stale, crossed,
conflicting and wide-book outcomes remain withheld. Quotes are not fills.

No research scoring or production rankings change. This companion supports the
isolated quote-session browser PR; it must not be merged to main through the
broad scanner staging PR merely to ship timing support.
