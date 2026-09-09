# Account and Data Self-Service

Stead customers can manage a display name and optional consent choices, export
their data as portable JSON, contact the configured support address, and
permanently delete their account from the mobile app.

## Product Policy

- The phone number is the account identifier and remains read-only. Changing a
  phone number requires a separately designed re-verification flow.
- Product analytics and product-research contact are optional, independent,
  off by default, and can be granted or withdrawn at any time.
- Every changed consent choice is appended with its timestamp. Re-saving an
  unchanged choice does not create a misleading new consent event.
- Core processing needed to authenticate the customer and provide financial
  planning is not represented as optional consent.
- The JSON export is generated on demand and includes profile data, current
  consent choices and their history, goals, transactions, alert preferences,
  sanitized authentication activity, and notification delivery metadata. OTP
  values, encrypted message payloads, IP addresses, device hashes, and internal
  auth metadata are never exported.

## Deletion and Retention

Deleting an account requires entering the exact confirmation text `DELETE` and
then confirming the native destructive-action prompt. The API blocks claimed
notifications and removes notification jobs, authentication records, consent
history, transactions, alert state/preferences, goals, and the user in one
database transaction. The client clears its token and all session-scoped cached
data only after the API confirms deletion.

Deletion is irreversible. A later OTP login with the same phone number creates
a new account and does not restore the old account's data. A provider message
already accepted for delivery cannot necessarily be recalled, but queued Stead
jobs are removed before account data deletion.

Production operators must configure backups to expire deleted customer data
within 30 days. Backups may be used only for disaster recovery, and deletion
requests must be re-applied after any restore. Redacted operational records
that contain no user ID, phone number, message content, or other customer
identifier may remain for aggregate reliability reporting.

## API Surface

- `GET /account` returns the profile and latest optional-consent choices.
- `PATCH /account/profile` updates or clears the display name.
- `PUT /account/consents` records changed optional-consent choices.
- `GET /account/export` returns the versioned JSON export.
- `DELETE /account` permanently deletes the account when the request body is
  `{ "confirmation": "DELETE" }`.

All routes require a bearer token. The OpenAPI contract in
[`contracts/openapi.yaml`](../contracts/openapi.yaml) is authoritative for
request and response shapes.

## Support Configuration

Set `EXPO_PUBLIC_SUPPORT_EMAIL` in the mobile build environment to show the
in-app support link. The app opens the device email client and does not collect
support content itself. Do not use a public issue tracker for customer data or
account requests.

## Verification Boundary

Automated API tests cover defaults, validation, consent history, sanitized
export, ownership, and database deletion. Mobile tests cover profile and
consent changes, export sharing, the typed deletion gate, session clearing, and
navigation to sign-in. Production backup expiry, support staffing, native share
sheets, and platform email clients still require operational/native validation.
