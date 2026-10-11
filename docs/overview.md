# Product and System Overview

<details open>
<summary><strong>Show or hide document contents</strong></summary>

This document owns Stead's stable product framing and present system shape. It
does not track delivery progress; use [Project Status](project-status.md) for
current capabilities, evidence, priorities, and release gaps.

## Vision

Stead is a financial stability layer that helps Nigerians prepare for future
obligations by translating cash flow into decision intelligence.

It answers one question: **What can I safely spend today without creating
future financial pressure?**

Stead begins as a decision-support system rather than a wallet, bank, payment
processor, or lender. Over time it may grow into a broader financial platform,
but stability and pre-spend intelligence remain the differentiator.

## Problem

Many customers receive periodic income but face large, infrequent obligations
such as rent, school fees, and emergencies. Existing financial products make it
easy to move or borrow money, but rarely show whether today's spending creates
future pressure.

Stead focuses on:

- readiness for known obligations;
- pacing and safe-to-spend guidance;
- early warning when financial stability materially changes; and
- understandable history so customers can correct and trust their inputs.

## Product Strategy

The initial wedge is annual-rent readiness: it is predictable, painful,
widely relevant, and naturally recurring. The underlying model is goal-agnostic
so the same system can support other obligations without changing its core
decision logic.

The product surface spans five stable domains:

1. Identity and account lifecycle.
2. Goals and financial inputs.
3. Readiness and stability scoring.
4. Proactive alerts and notification delivery.
5. Data ingestion and customer-controlled export/deletion.

Detailed behavior belongs in the feature documents listed in the
[Documentation Guide](README.md).

## Current System Shape

Stead is currently a modular monolith with two primary applications:

- an Expo React Native mobile application as the customer surface; and
- a NestJS API backed by Prisma and PostgreSQL.

The API owns identity, accounts, goals, transactions, ingestion, scoring,
alerts, and persisted notification delivery. Twilio and Termii adapters isolate
external SMS delivery, while a development adapter supports local and automated
journeys.

`contracts/openapi.yaml` is authoritative for mobile-consumed API routes.
Generated API types and mobile types/Zod validators keep both sides aligned;
internal inspection routes remain operator-only.

## Current Boundaries

- **Identity and access:** authentication, sessions, account profile, consent,
  export, deletion, and auth telemetry.
- **Financial inputs:** obligation goals, transactions, goal contribution
  mapping, and file ingestion.
- **Planning and scoring:** readiness, required pace, safe-to-spend, stability
  score, and risk status.
- **Messaging:** customer preferences, notification jobs, provider abstraction,
  retry, cooldown, deduplication, and dead-letter state.

These boundaries are logical ownership boundaries inside one API deployment.
Future physical extraction is governed by the
[Architecture Roadmap](architecture-roadmap.md), not by this overview.

## Delivery Status

The repository contains a working core vertical slice, not a fully
production-validated financial product. [Project Status](project-status.md) is
the sole detailed source for:

- what is implemented and exposed to customers;
- what automated evidence exists;
- what has been validated in production-like conditions;
- the active customer-value milestone; and
- the remaining production-pilot blockers.

</details>
