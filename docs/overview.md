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

The codebase has the MVP flow in place, but production readiness still depends on operational validation:

- Next planned work: complete the numbered items in [Next Work Queue](#61-next-work-queue), removing each item from this document as it is completed.
- Configure a real SMS provider in the target environment.
- Run an end-to-end OTP request and verify pass with a real phone number.
- Validate mobile token persistence and session expiry behavior against a real API environment.
- Add stronger device-aware abuse controls beyond the current phone and IP limits.
- Expand operator-facing visibility around repeated auth failures, lockouts, and dead-letter notification jobs.
- Add broader contract enforcement between the API response shapes and the mobile Zod schemas.
- Weekly readiness updates and risk warning alerts are still roadmap items; the current notification pipeline is used for OTP delivery.

### 6.1 Next Work Queue

Real-provider OTP validation is intentionally deferred until a paid or verified SMS provider account is ready. Local/dev SMS mode and notification job inspection now exist, so the next implementation items are focused on validation depth and production debugging readiness.

1. Expand contract and integration coverage around auth plus notification queue.
   - Confirm request OTP creates an OTP record, auth event, and persisted notification job.
   - Confirm `DEV_EXPOSE_OTP=true` still exercises the persisted notification job pipeline.
   - Confirm the consumer can process a job through the SMS abstraction.
   - Confirm failures retry and eventually dead-letter.
   - Keep mobile Zod schemas covered by representative API response contract tests.

2. Run the local OTP flow end to end through the dev provider.
   - Start the API with `SMS_PROVIDER=dev` and `DEV_EXPOSE_OTP=true`.
   - Keep `SMS_PROVIDER=dev` limited to non-production environments; startup validation rejects it in production.
   - Request OTP from the mobile app.
   - Verify the OTP, land in the authenticated app flow, and inspect the notification job as `sent`.
   - Confirm token persistence survives an app restart.

3. Prepare for real-provider validation.
   - Pick the first live provider for the target environment.
   - Configure provider credentials outside source control.
   - Run request OTP -> notification job -> provider delivery -> verify OTP with a real phone number.
   - Capture the operator playbook for diagnosing send failures and dead-letter jobs.

Once these are done, the next validation target is request OTP -> notification job -> verify OTP -> authenticated mobile session against a real provider-backed environment.
