# Fixed composite baseline

Run `python fixed_composite.py reviewed-snapshot.json` on staging to produce a `fixed-composite-shadow-v1` report. Input is the same point-in-time reviewed snapshot accepted by `shadow_replay.py`; see component-scoring.md and review-corpus-intake.md. Import the output with the Replay file control in the staging evidence review page, using the matching packet and declared cutoff.

The fixed score is news × 0.40 + patterns × 0.38 + volume × 0.10 + options × 0.07 + risk/reward × 0.05. Each component is normalized to 0–100 by the existing evidence-reviewed rubric. Every admitted row includes component score, weight, contribution, total and tied competition rank. The page checks the contribution arithmetic before displaying it. Adaptive scores are omitted from this baseline report.

Both liquidity and risk gates require explicit point-in-time evidence. Underlying component reviews are required; pre-scored legacy fixtures cannot qualify for this report. Missing evidence, future evidence, missing news provenance or failed gates withhold the complete candidate. Weights are never redistributed. The existing conservative event-review checks are reused, so this version can withhold candidates without assessed catalyst evidence even when other dimensions exist.

This is an offline baseline, not an implemented production composite, an automatic rating model or a probability of profit. No scanner import or ranking changes are made. The previously implemented paired replay remains available separately for later adaptive comparisons. No historical missing reviews, scores or quote windows are filled in. Synthetic tests demonstrate arithmetic and withholding behavior, not predictive improvement.

Next evidence requirement: complete contemporaneous reviews across multiple sessions, then chronological holdouts and ask-to-bid quote estimates with missing windows reported. Promotion requires evidence beyond the quote transport pilot.
