# Overview

## Table of contents

- [Vision](#11-vision)
- [Problem Statement](#2-problem-statement)
- [Product Strategy](#3-product-strategy)
- [Current Implementation](#4-current-implementation)
- [System Architecture](#5-system-architecture)
- [Remaining Gaps](#6-remaining-gaps)

For the endpoint-by-endpoint product and verification matrix, see
[Project Status](project-status.md). That document is the source of truth for
distinguishing implemented code from mobile exposure, automated coverage, and
production validation.

## 1.1 Vision

Stead is a Financial Stability Layer that helps Nigerians stay prepared for future financial obligations by translating their cashflow into decision intelligence.

Stead answers one question:

“What can I safely spend today without creating future financial pressure?”

Today, Stead is not:

- A wallet
- A neobank
- A payment processor
- A lending company

Stead is:

- A financial stability engine
- A cashflow interpretation layer
- A decision-support system

Long term, Stead can evolve from a financial stability layer into a broader financial platform. The wedge is decision intelligence and financial stability first; over time, that layer can expand into richer money movement, account, and operating capabilities without losing the core focus on helping users act safely and stay financially prepared.

## 2. Problem Statement

Nigerians:

- Earn income monthly
- Face large, infrequent financial shocks (rent, school fees, emergencies)
- Lack a system to pace toward these obligations
- Often borrow or experience pressure due to poor visibility

Existing fintech players:

- Optimize for transaction volume
- Increase money movement
- Offer reactive loans

They do not optimize for:

- Stability
- Pre-spend intelligence
- Long-horizon readiness

## 3. Product Strategy

### 3.1 Category Definition

Stead defines:

- Financial Stability Infrastructure

This sits above wallets and banks.

Wallets move money.
Stead interprets money.

In the current phase, that positioning is intentional. Over time, Stead can grow from infrastructure and decisioning into a fuller financial product surface, closer to the breadth of modern fintech platforms, while keeping stability and pre-spend intelligence as the differentiator.

### 3.2 Wedge Use Case (v1)

Annual rent readiness.

Why:

- Predictable
- High emotional pain
- Universally relevant
- Strong retention driver

Internally, the system is goal-agnostic.

## 4. Current Implementation

### 4.1 API

The backend is a NestJS API backed by Prisma and Postgres.

Implemented API modules:

1. Phone authentication
   - OTP request and verify endpoints
   - Phone normalization by country
   - JWT-based sessions
   - Per-phone, per-IP, and keyed pseudonymous device OTP request throttles
   - OTP resend cooldown
   - Verify attempt lockout
   - Auth event telemetry for request, resend, verify failure, lockout, and success outcomes
   - Multi-window operator diagnostics for lockout trends, repeated phones/IPs/devices, and device-signal coverage

2. SMS and notification jobs
   - Twilio and Termii provider support
   - Local development SMS provider support
   - Provider configuration validation at startup
   - Persisted notification jobs for OTP delivery
   - Retry and dead-letter state
   - Provider metadata capture for sent jobs
   - Authenticated inspection endpoints for auth events and notification queue state
   - Queue health diagnostics for retries, stale processing locks, recent attempt failures, dead letters, and the latest failure

3. Obligation goals
   - Name
   - Amount
   - Due date
   - Optional monthly income estimate
   - Single active goal per user

4. Manual transactions
   - Income entry
   - Expense entry
   - Optional goal tagging
   - List, update, and delete support

5. Stability dashboard

   Displays:
   - Goal readiness %
   - Required monthly pace
   - Safe-to-spend amount
   - Stability score (0–100)
   - Risk status (stable / warning / critical)
   - Goal saved amount
   - Estimated balance

### 4.2 Mobile

The mobile app is an Expo Router app.

Implemented screens and flows:

- OTP request and verify
- Resend cooldown and clearer auth error states
- Dev OTP hint support when the API enables `DEV_EXPOSE_OTP=true`
- Token persistence and unauthorized-session clearing
- A stable installation UUID sent with API requests for server-side abuse correlation; the API persists only a keyed hash
- Active goal setup
- Manual income/expense entry in naira with a calendar-date input and optional
  active-goal tagging
- Transaction activity history with income/expense filters, visible net,
  editing, explicit goal-link management, and confirmed deletion
- Stability dashboard

Mobile API responses are parsed with Zod schemas before the UI consumes them.

The mobile product surface is still smaller than the API surface. Transaction
create/list/update/delete is exposed, but existing goals cannot yet be edited,
deactivated, or reviewed as history in the app.

## 5. System Architecture

### 5.1 High-Level Architecture

- Mobile App (React Native)
- API (NestJS)
- Postgres (via Prisma)
- SMS Provider (Twilio or Termii for OTP)
- In-process notification worker backed by the database

### 5.2 Current Boundaries

- Identity and access: users, OTP lifecycle, JWT sessions, auth telemetry
- Financial inputs: goals, transactions, goal contribution tagging
- Planning and scoring: readiness, monthly pace, safe-to-spend, stability score/status
- Messaging: notification jobs, SMS provider abstraction, retry/dead-letter state

## 6. Remaining Gaps

The repository contains a working core vertical slice, not a complete or
production-validated financial product.

Product milestones and enabling delivery work are tracked separately in
[Project Status](project-status.md#milestone-tracking). The largest current
gaps are:

1. Real-provider OTP validation on native Android and iOS devices.
2. Automated mobile screen and mobile-to-API journey coverage.
3. Mobile goal editing, deactivation, and history workflows.
4. Production session lifecycle, operational monitoring, backup/restore,
   privacy, retention, and account-deletion procedures.
5. Weekly readiness and risk alerts; the notification queue currently delivers
   OTPs only.
6. Automatic financial-data ingestion, richer obligation planning, customer
   profile/preferences, and internal operations tooling.

See [Project Status](project-status.md) for the full capability matrix, exact
test boundaries, and recommended delivery ordering. See
[Auth Hardening](auth-hardening.md) for the completed Expo web validation and
the still-deferred real-provider pass.
