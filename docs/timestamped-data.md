# Timestamped quote research

`python timestamped_quotes.py INPUT.csv > PRIVATE_OUTPUT.json` imports Cboe DataShop Option Quotes CSV. Keep purchased data and output outside public GitHub unless your provider terms explicitly permit distribution. This importer is separate from live scanner data and does not enable a subscription or buy a dataset.

Source: https://datashop.cboe.com/option-quote-intervals
Specification: https://datashop.cboe.com/documents/Option_Quotes_Layout.pdf

The documented `quote_datetime` is the NBBO interval end in U.S. Eastern time. The importer converts it to UTC, supports the sample's minute-format dates and preserves precision, flags bad/crossed quotes and duplicates, and retains missing optional Greeks as unknown. Ambiguous daylight-saving timestamps fail validation. Adjusted contract multipliers remain unknown. Trade volume is interval volume, not cumulative daily volume.

Quote timing is distinct from availability: Cboe's intraday interval files are delayed by 15 minutes. Historical imports cannot prove a quote was available to the scanner before a trade. Keep this evidence separate to avoid leakage. No fees, fill profits, signal labels or model readiness are inferred.

For a research pilot, choose a few ETFs, short dates, one-minute intervals and Calcs (Greeks) included. Obtain the configured total and delivery/access terms before purchasing. A static unconfigured $0 subtotal is not a price quote. For automatic live scanning, assess an entitled API separately; this CSV importer alone does not speed up refreshes.

Other provider distinctions checked October 7, 2026: Alpaca Basic offers modified indicative option quotes, whereas OPRA requires a subscription; Tradier real-time market data requires brokerage access and Greeks are updated hourly. Neither is silently substituted for verified contemporaneous NBBO and Greeks.
