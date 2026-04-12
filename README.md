# SafarConnect

A full-stack **ride-hailing platform** for Pakistan with real-time tracking, ML-powered driver matching, and weather safety gates.

## Quick Start

### Prerequisites

- Python 3.12, Node.js 18+, Redis 7+
- macOS/Linux (tested), Windows (untested)

### One-Command Setup

```bash
# From project root:
bun run dev

# Starts:
# • Redis (Docker, port 6379)
# • Flask API (port 5000)
# • Vite frontend (port 3000)
```

Visit **http://localhost:3000** → sign up as rider/driver → book a ride.

## Key Features

### Rider Flow

1. **Sign up & login** with secure JWT auth
2. **Book a ride** — pick location via map, get fare estimate, check weather alert
3. **View driver options** — ML-ranked by acceptance probability
4. **Live tracking** — real-time driver location, ETA, progress bar
5. **Rate driver** — 1–5 stars + feedback

### Driver Flow

1. **Sign up** with vehicle details & discount preference
2. **Receive requests** — incoming ride alerts with passenger info
3. **Accept/reject** — weather-gated (won't accept in dangerous conditions)
4. **Broadcast GPS** — rider sees real-time location
5. **Complete & earn** — automatic fare debit, ride archived

### Platform Highlights

- **ML Driver Recommender** — GradientBoosting model learns from accept/reject history
- **Real-time Socket.IO** — rider & driver location sync without polling
- **Weather Safety** — blocks rides if wind > 40 km/h or heavy rain
- **Live Fare Calculation** — distance + duration via OpenRouteService + weather surge
- **Secure JWT** — Redis token whitelist, auto-logout on expiry

---

## Tech Stack

Backend: Python 3.12 + Flask 3 + Socket.IO | Frontend: React 18 + TypeScript + Vite | Database: PostgreSQL (Supabase) + SQLAlchemy | Real-time: Socket.IO | ML: scikit-learn (GradientBoosting) | APIs: OpenRouteService, WeatherAPI.com

## Status

**Complete & Working:**

- Full rider → driver matching flow with live tracking
- ML-ranked driver recommendations based on accept/reject history
- Real-time location sync via Socket.IO
- Weather safety gates (blocks rides in dangerous conditions)
- JWT auth with Redis token invalidation

---

## Environment Variables

Create a file at `backend/.env` with the following variables:

```env
# ── Database ────────────────────────────────────────────────────────────────
# PostgreSQL connection string (Supabase transaction pooler recommended)
DATABASE_URL=postgresql+psycopg://USER:PASSWORD@HOST:PORT/postgres

# ── JWT ─────────────────────────────────────────────────────────────────────
# Generate with: python -c "import secrets; print(secrets.token_hex(32))"
SECRET_KEY=your-strong-random-secret-key

# ── Third-party APIs ────────────────────────────────────────────────────────
# OpenRouteService — get a free key at https://openrouteservice.org/
ORS_API_KEY=your-openrouteservice-api-key

# WeatherAPI.com — get a free key at https://www.weatherapi.com/
# NOTE: Must be named WEATHER_API_KEY (not OPENWEATHER_API_KEY)
WEATHER_API_KEY=your-weatherapi-key

# ── Redis ───────────────────────────────────────────────────────────────────
# Currently hardcoded to localhost:6379 in app.py
# (Planned: make configurable via REDIS_URL env var)
```

> **Note:** The current codebase has a bug where `.env` uses `OPENWEATHER_API_KEY` but `app.py`
> reads `WEATHER_API_KEY`. Until fixed in code, add **both** keys to `.env` and set them to the same value.

No frontend `.env` is currently used. The API base URL is hardcoded in each component as `http://localhost:5000`.
To override it, search-and-replace `http://localhost:5000` with your server URL until environment file support is added.
