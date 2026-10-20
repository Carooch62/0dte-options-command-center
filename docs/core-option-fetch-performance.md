# Core option fetch scheduling

The first instrumented production scan spent 13.9 seconds in option_expander.py followed by 9.9 seconds in core_0dte.py. The core stage already avoids duplicate requests, but required core ETFs absent from the expansion cohort wait until the entire expansion pool finishes.

Schedule those missing core ETFs first in the same four-worker option-fetch pool as the existing expansion cohort. Expansion selection, its 70-candidate budget, pinned tickers and rotating allocation remain the same. The added core cohort is exactly the group the subsequent core stage would otherwise fetch. Required core coverage is not reduced; existing failures stay failures and are not retried or reclassified. The core subprocess remains to record coverage and missing tickers, normally with no additional network work.

No extra concurrent requests, new provider, ranking changes, eligibility changes or quote-clock changes are introduced. core_prefetch_attempted records the otherwise separate core requests. Integration tests verify the combined cohort is unique, core coverage is complete, the second stage makes no duplicate requests and failed earlier attempts remain failed. A production timing comparison is needed before quantifying the benefit.
