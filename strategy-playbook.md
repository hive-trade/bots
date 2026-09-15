# Educational strategy examples

This repository contains generic teaching examples, not HiveTrade production
strategies, tuned thresholds, private data, or performance claims.

Start by asking the user what they want to test. A market price is not proof of
an edge. These ideas demonstrate software interfaces only:

- **Price limit:** choose a side and buy only when its ask is below a user-defined
  cap. This is the included `strategy.mjs`; it is not a predictive model.
- **External estimate:** compare the user's own estimated probability with the
  available ask after accounting for fees. Skip missing, stale, or mismatched data.
- **Observation-only:** record the decision without trading until the user has
  evaluated the rule on historical and fresh data.

Before implementing an idea, identify the exact market, resolution source,
observation timestamp, price limit, budget, failure behavior and exit policy.
Test stale data, inverted outcomes, missing books and settlement edge cases.
Kalshi's HiveTrade bot interface currently accepts only the documented directional
series; do not promise that an arbitrary category can be traded through it.

Keep the user's model and data in their own project. Do not fetch or publish
HiveTrade's private built-in strategies as part of setup.
