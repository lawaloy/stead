# Overview

## Table of contents

- [Vision](#11-vision)
- [Problem Statement](#2-problem-statement)
- [Product Strategy](#3-product-strategy)
- [Current Implementation](#4-current-implementation)
- [System Architecture](#5-system-architecture)
- [Remaining Gaps](#6-remaining-gaps)

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
   - Per-phone and per-IP OTP request throttles
   - OTP resend cooldown
   - Verify attempt lockout
   - Auth event telemetry for request, resend, verify failure, lockout, and success outcomes

2. SMS and notification jobs
   - Twilio and Termii provider support
   - Local development SMS provider support
   - Provider configuration validation at startup
   - Persisted notification jobs for OTP delivery
   - Retry and dead-letter state
   - Provider metadata capture for sent jobs
   - Authenticated inspection endpoints for auth events and notification queue state

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
- Active goal setup
- Manual income/expense entry with optional active-goal tagging
- Stability dashboard

Mobile API responses are parsed with Zod schemas before the UI consumes them.

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

The MVP flow is implemented, and the server-side OTP notification pipeline now
has PostgreSQL-backed e2e coverage in CI. Production readiness still depends on
work at the client, repository-policy, and external-provider boundaries.

### 6.1 Active Milestone: Production-readiness validation

P0 work, in order:

1. Complete the local mobile auth acceptance pass documented in
   [Auth Hardening](auth-hardening.md#p0-local-mobile-auth-acceptance-pass).
   This is the next engineering task because the API pipeline is automated, but
   the mobile request, verification, authenticated routing, and restart behavior
   have not been validated together.
2. Make Dependency Review a blocking check and add it to the active `main`
   ruleset. The workflow currently uses `continue-on-error: true`; see the
   [Branch Protection Checklist](branch-protection-checklist.md).

P1 work:

1. Enforce API/mobile response contracts from one authoritative source. The
   current mobile schema tests use hand-authored fixtures and cannot detect an
   API serializer drifting independently.
2. Add stronger device-aware abuse controls beyond the current phone and IP
   limits.
3. Expand operator-facing visibility around repeated auth failures, lockouts,
   and dead-letter notification jobs.

Real-provider OTP validation remains externally blocked until a paid or
verified sender account is available. When available, configure credentials
outside source control, run a real-phone request and verify pass, and capture
the operator failure-response playbook.

Weekly readiness updates and risk warning alerts remain later roadmap items;
the current notification pipeline is used for OTP delivery.
