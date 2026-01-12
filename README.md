# Prediction Market

A prediction market platform that enables users to trade on the outcomes of future events using an Automated Market Maker (AMM) powered by the Logarithmic Market Scoring Rule (LMSR).

## Overview

Prediction Market is a full-stack application for creating and trading on prediction markets. Users can create markets, trade outcome shares, and earn rewards when their predictions are correct.

## Architecture

The platform consists of two main components:

### Backend (Django)

- RESTful API server handling market creation, order execution, and user management
- LMSR-based AMM implementation for automated price discovery and liquidity provision
- PostgreSQL database (Supabase) for persistent storage
- Support for both standalone markets and exclusive event groups with shared liquidity pools

### Frontend (Next.js)

- Modern React application built with Next.js 15 and App Router
- Real-time market data and portfolio tracking
- Responsive UI with Tailwind CSS and shadcn/ui components

## Key Features

- **Prediction Markets**: Create and trade on binary outcome markets
- **LMSR AMM**: Automated market maker providing continuous liquidity and fair pricing
- **Exclusive Events**: Support for mutually exclusive outcomes sharing a single liquidity pool
- **Portfolio Management**: Track positions, order history, and P&L

## Tech Stack

- **Backend**: Python, Django, PostgreSQL, Supabase
- **Frontend**: TypeScript, Next.js 15, React, Tailwind CSS
- **Infrastructure**: Supabase (Auth + Database)