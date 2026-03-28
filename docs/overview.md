# Overview

## Table of contents

- [Vision](#11-vision)
- [Problem Statement](#2-problem-statement)
- [Product Strategy](#3-product-strategy)
- [MVP Scope (v1)](#4-mvp-scope-v1)
- [System Architecture](#5-system-architecture)

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

Stead defines a new category:

Financial Stability Infrastructure

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

## 4. MVP Scope (v1)

### 4.1 Core Features

1. Phone Authentication
   - Real OTP via SMS provider
   - JWT-based sessions

2. Obligation Goal (Single Active Goal)
   - Name
   - Amount
   - Due date
   - Optional monthly income estimate

3. Manual Transactions
   - Income entry
   - Expense entry
   - Optional “contributes to goal” tagging

4. Stability Dashboard

   Displays:
   - Goal readiness %
   - Required monthly pace
   - Safe-to-spend amount
   - Stability score (0–100)
   - Risk status (stable / warning / critical)

5. Basic Alerts
   - Weekly readiness update
   - Risk warning alert

## 5. System Architecture

### 5.1 High-Level Architecture

- Mobile App (React Native)
- API (NestJS)
- Postgres (via Prisma)
- SMS Provider (OTP only)

No custody.
No payment movement.
