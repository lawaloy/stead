# Observability and Sensitive-Data Logging

<details open>
<summary><strong>Show or hide document contents</strong></summary>

This document defines Stead's application logging, request correlation, mobile
error reporting, and sensitive-data boundaries. Deployment-provider setup and
alert ownership remain production operations rather than repository secrets.

## API Logging Contract

The API writes structured logs to standard output. `LOG_FORMAT=json` is the
default and is required for deployed environments; `LOG_FORMAT=text` is
available for local readability. `LOG_LEVEL` accepts `debug`, `info`, `warn`,
or `error` and defaults to `info`.

Every HTTP response includes `x-request-id`. A safe client value is preserved;
otherwise the API generates one. Request logs contain the method, sanitized
route path, status, duration, and request ID, but never resource UUIDs, the
query string, or request body.
The same identifier is available to logs written during request handling.

Queued notification jobs persist their originating correlation ID. Work that
starts outside a request receives a generated ID, and consumer logs restore
that context while delivering the job. This makes an API action traceable into
asynchronous SMS delivery without persisting a provider credential or message
body in logs.

## Sensitive-Data Boundary

Do not log access or refresh tokens, authorization headers, cookies, OTPs,
passwords, phone numbers, notification payloads, request/response bodies, or
provider credentials. The central API logger redacts known sensitive object
keys as defense in depth, but it cannot safely redact arbitrary interpolated
strings. Pass an event name plus structured, non-sensitive metadata.

Direct `console` calls are rejected by linting in API and mobile production
code. Add observability through the central facilities instead.

## Mobile Error Reporting

The mobile app includes an optional Sentry integration. It is disabled when
`EXPO_PUBLIC_SENTRY_DSN` is empty. When enabled, Stead sends only allowlisted
operational context: area, operation, sanitized route, request ID, and status.
Default PII collection is disabled; request URLs, payloads, headers, cookies,
query strings, and breadcrumbs are removed before sending. Error messages and
names are replaced with fixed classifications while retaining stack frames,
and API error details are not attached.

Set these public runtime values for a release build:

```dotenv
EXPO_PUBLIC_SENTRY_DSN=https://public-key@host/project-id
EXPO_PUBLIC_APP_ENV=production
EXPO_PUBLIC_SENTRY_TRACES_SAMPLE_RATE=0
```

For native source-map upload, configure `SENTRY_ORG` and `SENTRY_PROJECT` in
the build environment and store `SENTRY_AUTH_TOKEN` as a protected EAS/CI
secret. Never use the `EXPO_PUBLIC_` prefix for the auth token.

## Verification and Operational Boundary

Unit tests cover logger redaction, correlation, mobile event scrubbing, and
request-ID propagation. The existing live mobile/API journey starts the built
API as a real process and verifies that its JSON request log is parseable,
correlated, and free of probe secrets. Run the complete repository gate with
`npm run verify:full`.

Before production, operators must configure log and Sentry destinations,
retention, access controls, dashboards, alert thresholds, ownership, and an
incident-response drill. A repository test confirms emission contracts; it
does not prove a production dashboard or on-call route is working.

## Remaining Production Gaps

Treat this section as the canonical observability follow-up list. Product and
release documents should link here instead of copying it.

### Required before customer release

- Connect API logs and mobile Sentry events to production destinations with
  documented retention, access control, and ownership.
- Configure protected Sentry organization, project, and source-map credentials;
  attach release and build identifiers; and verify a controlled failure in
  Android and iOS release builds resolves to the original source.
- Create dashboards and actionable alerts for API availability, error rate and
  latency; notification queue depth, oldest-job age, retries and terminal
  failures; scheduler health; SMS-provider failures; and database health.
- Document alert thresholds, responders, escalation routes, and runbooks, then
  complete an incident-response drill that proves the alert reaches its owner.

### Follow-up instrumentation

- Give each scheduler evaluation and queue-poll cycle an operation ID so
  failures that happen before a notification job is claimed remain traceable.
- Add vendor-neutral counters and latency distributions for HTTP requests,
  notification processing, scheduler runs, and provider outcomes.
- Add backend spans or an APM integration when the deployment platform is
  selected; the current request ID is correlation, not distributed tracing.
- Decide whether handled backend failures need a dedicated error tracker in
  addition to structured logs and alerts.

Structured-field redaction does not make arbitrary interpolated strings safe.
The logging policy and lint rule remain mandatory even after the production
destinations are configured.

</details>
