# SafarConnect

A full-stack ride-hailing platform for the Pakistani market — think Uber/Careem. Riders book trips, ML recommends the best available driver, real-time Socket.IO tracking keeps both sides in sync, and a weather-safety gate blocks rides during dangerous conditions.

---

## Table of Contents

- [Tech Stack](#tech-stack)
- [Architecture Overview](#architecture-overview)
- [Features — What's Implemented](#features--whats-implemented)
  - [Backend](#backend)
  - [Frontend](#frontend)
  - [Database](#database)
- [Project Status](#project-status)
- [Known Issues & Gaps](#known-issues--gaps)
- [Recommended Improvements](#recommended-improvements)
- [Environment Variables](#environment-variables)
- [Running the App Locally](#running-the-app-locally)
  - [Prerequisites](#prerequisites)
  - [Backend Setup](#backend-setup)
  - [Frontend Setup](#frontend-setup)
- [API Reference](#api-reference)
- [Directory Structure](#directory-structure)

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Backend** | Python 3.x, Flask 3, Flask-SocketIO, eventlet |
| **ORM / DB** | SQLAlchemy 2, PostgreSQL (Supabase), psycopg3 |
| **Token Store** | Redis 7 (JWT invalidation) |
| **ML** | scikit-learn (GradientBoostingClassifier), pandas, numpy |
| **Routing API** | OpenRouteService (driving directions & distances) |
| **Weather API** | WeatherAPI.com (real-time conditions) |
| **Frontend** | React 18, TypeScript, Vite |
| **UI Components** | Radix UI, Tailwind CSS, shadcn-style components |
| **Maps** | Leaflet 1.9 + OpenStreetMap tiles (loaded via CDN) |
| **Geocoding** | Nominatim (OpenStreetMap reverse/forward geocoding) |
| **Real-time** | Socket.IO (server) + socket.io-client (browser) |
| **Animations** | Motion (Framer Motion) |

---

## Architecture Overview

```
Browser (React SPA)
      │  REST + Socket.IO
      ▼
Flask App  (app.py / create_app())
      ├── REST endpoints   → db.py helpers → PostgreSQL (Supabase)
      ├── Socket.IO rooms  → real-time location / ride events
      ├── ML Recommender   → models/driver_recommender.pkl
      ├── RouteService     → OpenRouteService API
      ├── WeatherService   → WeatherAPI.com
      └── Redis            → JWT token whitelist / invalidation
```

---

## Features — What's Implemented

### Backend

| # | Feature | File(s) | Status |
|---|---|---|---|
| 1 | **JWT Auth (Rider & Driver)** — login, signup, logout with Redis token whitelist | `app.py`, `db.py` | ✅ Complete |
| 2 | **Rider auth** — signup via `signup_user` stored procedure, login with bcrypt-hashed passwords | `db.py` | ✅ Complete |
| 3 | **Driver auth** — signup via `signup_driver` SP, login via `login_driver` SP | `db.py` | ✅ Complete |
| 4 | **Rider profile** — GET `/user/<id>/profile` | `app.py` | ✅ Complete |
| 5 | **Driver profile** — GET `/driver/<id>/profile` | `app.py` | ✅ Complete |
| 6 | **Vehicle management** — GET/POST/PUT `/driver/<id>/vehicle` | `app.py` | ✅ Complete |
| 7 | **Driver discount** — PUT `/driver/<id>/discount` (0–100 %) | `app.py` | ✅ Complete |
| 8 | **Driver stats** — GET `/driver/<id>/stats` (total rides, avg rating) | `app.py` | ✅ Complete |
| 9 | **Location updates** — POST rider & driver current location | `app.py`, `db.py` | ✅ Complete |
| 10 | **Fare estimation** — POST `/estimate_fare` with distance + duration, incl weather check | `app.py`, `fare_calculator.py` | ✅ Complete |
| 11 | **Route service** — driving distance/duration via OpenRouteService | `route_service.py` | ✅ Complete |
| 12 | **Weather safety gate** — blocks rides in severe weather (wind > 40 km/h, heavy rain, etc.) | `WeatherService.py` | ✅ Complete |
| 13 | **Ride request creation** — POST `/create_ride_request` with fare range validation | `app.py` | ✅ Complete |
| 14 | **ML driver recommendation** — GradientBoosting on historical rides, auto-fallback to distance-based | `ml_recommender.py`, `app.py` | ✅ Complete |
| 15 | **Driver acceptance probability** — updated after every accept/reject | `ml_recommender.py` | ✅ Complete |
| 16 | **Request driver** — POST `/request_driver` (assigns driver + emits Socket event) | `app.py` | ✅ Complete |
| 17 | **Pending ride requests for driver** — POST `/driver/<id>/get_requests` | `app.py`, `db.py` | ✅ Complete |
| 18 | **Accept ride** — weather check → `accept_ride` SP → socket emit to rider | `app.py` | ✅ Complete |
| 19 | **Reject ride** — `reject_ride` SP → socket emit | `app.py` | ✅ Complete |
| 20 | **Start ride** — POST `/ride/<id>/start` → `start_ride_transaction` SP | `app.py` | ✅ Complete |
| 21 | **Complete ride** — POST `/ride/<id>/complete` → `complete_ride_transaction` SP (creates Payment record) | `app.py` | ✅ Complete |
| 22 | **Cancel ride (driver)** — POST `/<driver_id>/<ride_id>/cancel_ride` | `app.py` | ✅ Complete |
| 23 | **Post-ride feedback / rating** — POST `/ride/<id>/feedback` | `app.py`, `db.py` | ✅ Complete |
| 24 | **Live location via Socket.IO** — `driver_location_update` event → broadcasts `ride_location` + `ride_progress` to rider room | `app.py` | ✅ Complete |
| 25 | **Weather check (standalone)** — POST `/check_weather` | `app.py` | ✅ Complete |
| 26 | **ML model training endpoint** — POST `/train_model` | `app.py` | ✅ Complete |
| 27 | **Model status** — GET `/model_status` | `app.py` | ✅ Complete |
| 28 | **Weather data persistence** — saved to `weather` table per ride | `app.py`, `models.py` | ✅ Complete |

### Frontend

| # | Component | Route | Status |
|---|---|---|---|
| 1 | **Home Page** | `/` | ✅ Animated landing, rider/driver entry |
| 2 | **Rider Login** | `/rider-login` | ✅ Complete |
| 3 | **Rider Signup** | `/rider-signup` | ✅ Complete |
| 4 | **Driver Login** | `/driver-login` | ✅ Complete |
| 5 | **Driver Signup** | `/driver-signup` | ✅ Complete |
| 6 | **Rider Profile** | `/rider-profile` | ✅ Profile + geolocation, logout |
| 7 | **Driver Profile** | `/driver-profile` | ✅ Profile + vehicle management + discount |
| 8 | **Ride Booking** | `/book-ride` | ✅ Leaflet map, Nominatim search, fare estimate, weather alert |
| 9 | **Ride Confirmation** | `/confirm-ride` | ✅ ML-recommended driver list, Socket wait for acceptance |
| 10 | **Live Ride Tracking (Rider)** | `/live-tracking` | ✅ Real-time driver marker, ETA, progress bar |
| 11 | **Driver Dashboard** | `/driver-dashboard` | ✅ Pending requests, stats, Socket.IO ride notifications |
| 12 | **Driver Live Ride** | `/driver-live-ride` | ✅ GPS broadcast, start/complete/cancel controls |
| 13 | **Ride Completion** | `/ride-complete` | ✅ Star rating + comment submission |
| 14 | **Auth context + API client** | `App.tsx` | ✅ JWT in localStorage, auto-redirect, token expiry handling |

### Database

- **Tables:** `driver`, `User`, `ride`, `payment`, `rating`, `vehicle`, `weather`
- **Stored Procedures:** `signup_user`, `signup_driver`, `login_driver`, `book_ride`, `get_pending_rides`, `accept_ride`, `reject_ride`, `start_ride_transaction`, `complete_ride_transaction`, `drivers_from_ride`, `get_non_active_drivers`
- **Passwords:** hashed with `pgcrypto` (`crypt()`)
- **Hosting:** Supabase (PostgreSQL)

---

## Project Status

The core ride-hailing flow — from booking to completion — is fully implemented and functional end-to-end. The ML recommendation system, real-time tracking, and weather safety features are beyond MVP level. The project is at a **functional prototype / early beta** stage.

**What works today:**
- Full rider book-a-ride flow (search → fare estimate → driver selection → live tracking → completion + rating)
- Full driver flow (receive request → accept/reject → start ride → broadcast location → complete)
- JWT-secured REST API with Redis-backed token invalidation
- ML-based driver recommendation with distance fallback
- Weather-gated ride acceptance

**What is incomplete or rough:**
- No ride history for riders
- No rider-side ride cancellation
- No admin panel
- Payment is label-only (no gateway integration)
- No SMS/OTP verification on signup
- No `.gitignore` — `.env` with secrets is currently tracked

---

## Known Issues & Gaps

| # | Issue | Severity |
|---|---|---|
| 1 | **Env var mismatch**: `app.py` reads `WEATHER_API_KEY` but `.env` sets `OPENWEATHER_API_KEY` — weather service will receive `None` | 🔴 Bug |
| 2 | **`SECRET_KEY` not in `.env`** — falls back to a hardcoded default, which is a security risk in production | 🔴 Security |
| 3 | **`.env` file committed to repo** — contains live DB credentials and API keys | 🔴 Security |
| 4 | **`test_Alone.py` has hardcoded DB URL** with real credentials | 🔴 Security |
| 5 | **`python_wth.py` has hardcoded WeatherAPI key** | 🟡 Security |
| 6 | **Redis URL hardcoded** to `localhost:6379` — not configurable via env | 🟡 Config |
| 7 | **Socket.IO `cors_allowed_origins='*'`** — should be restricted to the frontend origin | 🟡 Security |
| 8 | **API base URL hardcoded** as `http://localhost:5000` in every frontend component | 🟡 Config |
| 9 | **ORS API key hardcoded** as default in `route_service.py` constructor | 🟡 Security |
| 10 | **No rate limiting** on any endpoint | 🟡 Security |
| 11 | **No rider ride cancellation** endpoint or UI | 🟠 Missing feature |
| 12 | **No ride history** endpoint for riders | 🟠 Missing feature |
| 13 | **Payment is label-only** — no actual gateway (Stripe, JazzCash, Easypaisa, etc.) | 🟠 Missing feature |
| 14 | **Surge pricing exists in `FareCalculator`** but is always `1.0` — never dynamically adjusted | 🟠 Partial |
| 15 | **ML model needs seed data** — requires at least 3–10 accepted/rejected rides before training | 🟡 Operational |
| 16 | **No ML model auto-retraining schedule** — must call `/train_model` manually | 🟡 Operational |
| 17 | **Leaflet loaded via CDN** in each map component instead of as an npm package | 🟢 Tech debt |
| 18 | **No TypeScript strict mode** — `any` types used extensively in map/socket code | 🟢 Tech debt |
| 19 | **No React error boundaries** — a crash in one component can take down the whole app | 🟢 Tech debt |
| 20 | **`driver/get_requests` uses POST** with no body — semantically should be GET | 🟢 Minor |

---

## Recommended Improvements

### High Priority
1. **Fix the `WEATHER_API_KEY` env var name** — rename the `.env` key from `OPENWEATHER_API_KEY` to `WEATHER_API_KEY`
2. **Add `.gitignore`** — exclude `.env`, `__pycache__`, `node_modules`, `models/*.pkl`
3. **Rotate all committed secrets** — the Supabase DB password, ORS key, and WeatherAPI key visible in the repo should be rotated immediately
4. **Add `SECRET_KEY` to `.env`** — generate a strong random key with `python -c "import secrets; print(secrets.token_hex(32))"`
5. **Restrict CORS** — set `cors_allowed_origins` to `http://localhost:3000` (dev) and the production domain

### Medium Priority
6. **Move frontend API URL to `.env`** — use `import.meta.env.VITE_API_URL` in Vite and replace all hardcoded `http://localhost:5000` strings
7. **Add `REDIS_URL` env variable** — replace hardcoded `localhost:6379`
8. **Rider ride cancellation** — add `POST /ride/<id>/cancel` (user-auth) + frontend cancel button on confirmation/tracking pages
9. **Ride history** — add `GET /user/<id>/rides` endpoint and a "My Rides" tab on the rider profile
10. **Rate limiting** — add `Flask-Limiter` on auth and booking endpoints
11. **Input validation** — validate license plate format, phone number format, and fare inputs server-side

### Nice to Have
12. **Real payment gateway** — integrate JazzCash or Easypaisa for the Pakistani market (or Stripe for international)
13. **Dynamic surge pricing** — use time-of-day and demand data to set `FareCalculator.surge`  
14. **Admin dashboard** — manage users, drivers, active rides, revenue stats
15. **SMS/OTP verification** — verify phone numbers on rider/driver signup (Twilio or local SMS gateway)
16. **Driver online/offline toggle** — let drivers go "off duty" without logging out
17. **Push notifications** — use FCM so drivers receive ride requests even when the app is in the background
18. **Scheduled ML retraining** — use APScheduler or a cron job to retrain weekly
19. **Leaflet as npm package** — replace CDN-loaded Leaflet with `npm install leaflet @types/leaflet`
20. **TypeScript strict mode** — enable `"strict": true` in `tsconfig.json` and eliminate `any` types

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
# ⚠️  Must be named WEATHER_API_KEY (not OPENWEATHER_API_KEY)
WEATHER_API_KEY=your-weatherapi-key

# ── Redis ───────────────────────────────────────────────────────────────────
# Currently hardcoded to localhost:6379 in app.py
# (Planned: make configurable via REDIS_URL env var)
```

> **Note:** The current codebase has a bug where `.env` uses `OPENWEATHER_API_KEY` but `app.py`
> reads `WEATHER_API_KEY`. Until fixed in code, add **both** keys to `.env` and set them to the same value.

No frontend `.env` is currently used. The API base URL is hardcoded in each component as `http://localhost:5000`.  
To override it, search-and-replace `http://localhost:5000` with your server URL until [improvement #6](#medium-priority) is implemented.

---

## Running the App Locally

### Prerequisites

| Tool | Version |
|---|---|
| Python | 3.10+ |
| Node.js | 18+ |
| Redis | 7+ (must be running locally) |
| PostgreSQL | Supabase account (or local PostgreSQL 14+) |

### Backend Setup

```bash
# 1. Enter the backend directory
cd backend

# 2. Create a virtual environment
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate

# 3. Install dependencies
pip install -r requirements.txt

# 4. Create the .env file (see Environment Variables section above)
cp .env.example .env               # or create manually
# Edit .env with your real keys

# 5. Make sure Redis is running
redis-server                       # or: brew services start redis (macOS)

# 6. Start the Flask development server
python app.py
# Server starts on http://localhost:5000

# --- OR run with Gunicorn (production-style) ---
gunicorn -k eventlet -w 1 --bind 0.0.0.0:5000 "app:create_app()[0]"
```

> **Optional:** Train the ML model after you have some ride data:
> ```bash
> curl -X POST http://localhost:5000/train_model
> ```

### Frontend Setup

```bash
# 1. Enter the frontend directory
cd Frontend

# 2. Install npm dependencies
npm install

# 3. Start the Vite dev server
npm run dev
# Opens at http://localhost:3000

# --- Build for production ---
npm run build
# Output in Frontend/dist/
```

---

## API Reference

### Authentication

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/signup` | — | Register a new rider |
| `POST` | `/login` | — | Rider login → JWT |
| `POST` | `/user/logout` | Rider JWT | Invalidate rider token |
| `POST` | `/driver/signup` | — | Register a new driver |
| `POST` | `/driver/login` | — | Driver login → JWT |
| `POST` | `/driver/logout` | Driver JWT | Invalidate driver token |

### Rider

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/user/<id>/profile` | Rider JWT | Get rider profile |
| `POST` | `/user/<id>/current_loc` | Rider JWT | Update rider GPS location |
| `POST` | `/estimate_fare` | Rider JWT | Estimate fare + weather check |
| `POST` | `/create_ride_request` | Rider JWT | Create a new ride (pending) |
| `POST` | `/request_driver` | Rider JWT | Assign driver to ride + notify via socket |
| `POST` | `/recommend_drivers` | Rider JWT | Get ML-recommended available drivers |
| `POST` | `/ride/<id>/feedback` | Rider JWT | Submit rating + comment after ride |
| `POST` | `/check_weather` | — | Standalone weather safety check |

### Driver

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/driver/<id>/profile` | Driver JWT | Get driver profile |
| `GET` | `/driver/<id>/stats` | Driver JWT | Total rides + avg rating |
| `POST` | `/driver/<id>/current_loc` | Driver JWT | Update driver GPS location |
| `POST` | `/driver/<id>/get_requests` | — | Get pending ride requests |
| `POST` | `/driver/<id>/accept_ride` | Driver JWT | Accept a ride (weather check first) |
| `POST` | `/driver/<id>/reject` | Driver JWT | Reject a ride |
| `GET` | `/driver/<id>/vehicle` | Driver JWT | Get vehicle info |
| `POST` | `/driver/<id>/vehicle` | Driver JWT | Add vehicle |
| `PUT` | `/driver/<id>/vehicle` | Driver JWT | Update vehicle |
| `PUT` | `/driver/<id>/discount` | Driver JWT | Set driver discount % |

### Ride Lifecycle

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/ride/<id>/start` | Driver JWT | Start the ride |
| `POST` | `/ride/<id>/complete` | Driver JWT | Complete ride + create payment |
| `POST` | `/<driver_id>/<ride_id>/cancel_ride` | Driver JWT | Cancel an assigned ride |

### ML / Utilities

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/train_model` | — | Train ML recommender from DB |
| `GET` | `/model_status` | — | Check if ML model is loaded |
| `POST` | `/update_acceptance_probability/<id>` | — | Recalculate driver acceptance score |

### Socket.IO Events

| Event (emit) | Direction | Description |
|---|---|---|
| `join_ride` | Client → Server | Rider joins `ride_<id>` room |
| `join_driver_room` | Client → Server | Driver joins `driver_<id>` room |
| `leave_ride` | Client → Server | Leave ride room |
| `driver_location_update` | Driver → Server | Send GPS coords during active ride |
| `ride_location` | Server → Rider | Broadcast driver location |
| `ride_progress` | Server → Rider | Distance remaining, ETA, % progress |
| `ride_request_sent` | Server → Driver | New ride request notification |
| `driver_accepted` | Server → Rider | Driver accepted the request |
| `driver_rejected` | Server → Rider | Driver rejected the request |
| `ride_started` | Server → Rider | Ride has begun |
| `complete_ride_socket` | Server → Rider | Ride completed |
| `ping` / `pong` | Both | Connection heartbeat |

---

## Directory Structure

```
SafarConnect/
├── backend/
│   ├── app.py              # Flask app factory, all REST endpoints, Socket.IO handlers
│   ├── db.py               # SQLAlchemy helper functions, stored-procedure wrappers
│   ├── models.py           # SQLAlchemy ORM models (Driver, User, Ride, Payment, etc.)
│   ├── fare_calculator.py  # Simple fare formula (base + per_km + per_min × surge)
│   ├── route_service.py    # OpenRouteService wrapper (distance, duration, coordinates)
│   ├── WeatherService.py   # WeatherAPI.com wrapper + safety thresholds
│   ├── ml_recommender.py   # GradientBoosting driver recommender (train + predict)
│   ├── requirements.txt    # Python dependencies (pip)
│   ├── .env                # ⚠️ Secrets — should NOT be committed (add to .gitignore)
│   └── models/
│       └── driver_recommender.pkl   # Serialised ML model (generated by /train_model)
│
├── Frontend/
│   ├── package.json
│   ├── vite.config.ts
│   └── src/
│       ├── App.tsx                      # Root component, auth context, client-side routing
│       ├── main.tsx
│       ├── index.css
│       └── components/
│           ├── HomePage.tsx             # Animated landing page
│           ├── RiderLogin.tsx / RiderSignup.tsx
│           ├── DriverLogin.tsx / DriverSignup.tsx
│           ├── MyProfilePage.tsx        # Rider profile + location
│           ├── DriversProfilePage.tsx   # Driver profile + vehicle + discount
│           ├── RideBookingPage.tsx      # Map + location search + fare estimate
│           ├── RideConfirmationPage.tsx # Driver list + request → wait for accept
│           ├── LiveRideTrackingPage.tsx # Rider's real-time tracking map
│           ├── DriverDashboard.tsx      # Pending requests + driver stats
│           ├── DriverLiveRidePage.tsx   # Driver's active ride controls + GPS broadcast
│           ├── RideCompletionPage.tsx   # Post-ride rating + feedback
│           └── ui/                      # Radix-based shadcn-style UI components
│
├── ddl_statements.ddl      # Original DDL (Oracle Data Modeler export, for reference)
├── erd.dmd                 # Oracle Data Modeler project file
└── README.md               # This file
```
