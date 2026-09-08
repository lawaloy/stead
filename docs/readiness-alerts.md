# Weekly Readiness and Risk Alerts

Stead can send opted-in customers weekly goal summaries and material
risk/recovery alerts by SMS. Both preference switches default to off. Saving
one preference does not implicitly enable the other.

## Customer preferences

Authenticated customers read and update preferences through
`GET /alerts/preferences` and `PATCH /alerts/preferences`. The API returns safe
defaults before the first save:

- weekly summaries off;
- risk/recovery alerts off;
- SMS channel;
- Monday at 09:00 UTC.

The mobile preference screen allows each switch, weekday, local delivery hour,
and IANA time zone to be changed. Time zones and the 0–23 hour range are
validated by the API. SMS is the only channel in this release.

## Weekly summary rule

The evaluator uses the customer's IANA time zone. Once the selected local day
and hour has been reached, it queues one summary for that Sunday-based calendar
week. The persisted weekly key and the queue's unique deduplication key prevent
repeat delivery when the evaluator runs again or the process restarts.

The message includes goal name, readiness percentage, stability status and
score, and required monthly savings pace.

## Material risk and recovery rules

A risk alert is material when the current active goal is not stable and either:

- this is the first opted-in non-stable observation;
- status worsens from stable to warning/critical or warning to critical; or
- the stability score falls at least 15 points below the last notified score.

After a risk alert, further risk alerts are suppressed for 24 hours. A
suppressed observation does not replace the notified baseline, so a still-
material condition can be reported when the cooldown ends. Recovery is sent
when a previously notified warning or critical goal returns to stable.

The evaluator stores observed and notified state separately for each user and
goal. Every queued alert also has a unique event key, user ID, and goal ID for
deduplication and operational diagnosis. Phone numbers and message bodies are
encrypted at rest and redacted after terminal delivery, matching OTP queue
handling.

## Runtime and validation boundary

The modular-monolith scheduler evaluates enabled preferences once per minute
and prevents overlapping runs in one process. Delivery uses the existing queue
lease, retry, dead-letter, Twilio, Termii, and development-provider paths.

Automated tests cover rule thresholds, timezone scheduling, preference
validation, encrypted/deduplicated queueing, consumer delivery, generated API
contracts, and mobile controls. Real Twilio or Termii delivery on target Android
and iOS devices remains a production-validation step; automated provider mocks
do not establish that external sender configuration or carrier delivery works.
