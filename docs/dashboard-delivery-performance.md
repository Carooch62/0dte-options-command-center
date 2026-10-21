# Faster initial dashboard delivery

The public research snapshot remains complete in `data/market-dashboard.json`. A derived `market-dashboard-today.json` preserves every stock row, same-day contract, eligibility field, timestamp, ranking and metadata value, while omitting the later-expiration option groups. Only the browser's initial same-day view uses that file. Selecting week, two-week or month loads the original complete research snapshot. No option universe, price filter, risk gate, public provider delay or Robinhood behavior changes.

The scanner workflow generates the initial-view file after successful pipeline validation, including when the exchange is closed and the retained research snapshot is reused. Git publishes both files together. Each response is a complete snapshot, so the browser never joins rows from different scans. A missing optional initial-view file falls back to the original file; server errors and invalid responses retain the current snapshot and display a failure. During an unavailable expiration switch the board shows an explicit loading/failure state, rather than interpreting unloaded option groups as empty. Existing saved expiration preferences remain supported.

Measured against retained scan `scheduled-5975087`, 206 rows:

| Metric | Complete snapshot | Initial same-day view |
|---|---:|---:|
| JSON bytes | 48,078,285 | 2,149,183 |
| gzip bytes, level 6 | 3,372,673 | 160,527 |
| Local JSON parse median, seven runs | 128.4 ms | 6.8 ms |

This is a 95.5% reduction in uncompressed initial payload and 95.2% in the compressed comparison. GitHub already serves gzip; savings come from fetching the required view, not adding compression. Parse timings are a local benchmark, not a phone or production network guarantee. Changing to a later-expiration view still downloads the full research file.

Verification includes equality of all same-day row fields across the measured real snapshot, preservation of negative zero during serialization, source-file immutability, missing-file compatibility, malformed/mismatched-response rejection, and phone/desktop browser checks for expiration-loading failures and recovery. Revert by restoring the original dashboard-app load call; the complete research data remains available throughout.
