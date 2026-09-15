# Transaction File Import

## Purpose

Transaction file import is the first automatic financial-data ingestion slice.
It reduces repetitive manual entry without requiring Stead to hold bank
credentials or depend on a bank-connectivity provider.

This first release accepts a bounded Stead CSV format. Direct support for each
bank's export format remains discovery work because column names, transaction
direction, dates, and amount conventions vary by institution.

## CSV format

The first row must contain these case-insensitive column names. They may appear
in any order and the file may contain additional columns:

| Column        | Accepted value                                          |
| ------------- | ------------------------------------------------------- |
| `date`        | An unambiguous calendar date in `YYYY-MM-DD` format     |
| `description` | A non-empty description of at most 280 characters       |
| `amount`      | A positive naira amount with at most two decimal places |
| `type`        | `income`, `expense`, `credit`, `debit`, `in`, or `out`  |

Amounts may include `NGN` or `₦` and comma separators when the CSV field is
quoted. For example:

```csv
date,description,amount,type
2026-09-01,Salary,"NGN 250,000.00",credit
2026-09-02,Groceries,12500.50,debit
```

Files are limited to 200,000 characters and 500 transaction rows. The API JSON
parser has a bounded 1 MB request limit so the contract maximum, JSON escaping,
and multibyte descriptions can be accepted without opening an unrestricted
request-body surface.

## Customer flow

1. The customer chooses a `.csv` file on Android, iOS, or web.
2. Mobile sends the CSV for preview. Nothing is persisted during this step.
3. The preview shows valid rows, row-level corrections, and transactions that
   were already imported. Valid non-duplicates are selected by default.
4. The customer may remove rows and optionally link all selected transactions
   to their active goal.
5. Confirmation reparses the original CSV on the API. The client cannot turn an
   invalid preview row into a write by modifying normalized fields.
6. PostgreSQL inserts the selected rows and skips import duplicates atomically.
   The activity list and dashboard are then refreshed.

## Duplicate behavior

Each valid row receives a deterministic fingerprint derived from its normalized
date, direction, amount, description, and occurrence number among identical
rows in the same file. The database enforces uniqueness per customer.

This means:

- retrying the same file does not double-count its transactions;
- two identical legitimate rows in one file remain distinct;
- another customer can import the same statement-shaped data independently;
- manually entered transactions are not guessed to be duplicates;
- deleting an imported transaction permits a later re-import.

## Data and security boundaries

- Authentication and existing goal-ownership rules protect both endpoints.
- The raw CSV is processed in the request and is not stored.
- Only confirmed, normalized transaction fields and the non-reversible
  fingerprint are persisted.
- Invalid rows are never partially written.
- The API never accepts a client-supplied amount, direction, date, or
  fingerprint during confirmation; it derives them again from the CSV.

## Remaining discovery

- Validate the canonical CSV template with launch customers.
- Collect representative exports from target Nigerian banks with explicit
  customer consent and build institution-specific adapters only for validated
  formats.
- Decide whether direct bank connectivity provides enough additional value to
  justify provider consent, account-linking, synchronization, and reconciliation
  complexity.
- Add category suggestions only after the imported-description quality is
  understood; this release preserves descriptions but does not infer categories.
