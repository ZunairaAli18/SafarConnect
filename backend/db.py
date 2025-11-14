from sqlalchemy import create_engine, text
import os
from dotenv import load_dotenv
from werkzeug.exceptions import Unauthorized
from models import Ride,db

load_dotenv()
DATABASE_URL = os.environ["DATABASE_URL"]   # set in .env
engine = create_engine(DATABASE_URL, pool_pre_ping=True, pool_size=5)

def update_driver_location(driver_id: int, lat: float, lon: float):
    """
    Updates a driver's current latitude and longitude in the database.
    Returns (ok, message)
    """
    sql = text("""
        UPDATE public.driver
        SET "Latitude" = :lat,
            "Longitude" = :lon,
            last_updated = NOW()
        WHERE driver_id = :did
        RETURNING driver_id;
    """)
    with engine.begin() as conn:
        row = conn.execute(sql, {"lat": lat, "lon": lon, "did": driver_id}).fetchone()

    if row:
        return True, f"Driver {driver_id}'s location updated successfully."
    return False, f"Driver {driver_id} not found."

def update_user_location(user_id: int, lat: float, lon: float):
    """
    Updates the user's current latitude/longitude and refreshes last_updated timestamp.
    Returns (ok, message)
    """
    sql = text("""
        UPDATE public."User"
        SET current_latitude = :lat,
            current_longitude = :lon,
            last_updated = NOW()
        WHERE user_id = :uid
        RETURNING user_id;
    """)
    with engine.begin() as conn:
        row = conn.execute(sql, {"lat": lat, "lon": lon, "uid": user_id}).fetchone()

    if row:
        return True, f"User {user_id}'s location updated successfully."
    return False, f"User {user_id} not found."

def complete_ride_by_driver(driver_id: int, ride_id: int):
    """
    Marks a ride as completed by the driver and sets driver active again.
    Returns (ok, message)
    """
    with engine.begin() as conn:
        # 1️⃣ Update ride status
        complete_sql = text("""
            UPDATE ride
            SET status = 'completed'
            WHERE ride_id = :r AND driver_id = :d AND status = 'in_progress'
            RETURNING ride_id;
        """)
        row = conn.execute(complete_sql, {"r": ride_id, "d": driver_id}).fetchone()

        if not row:
            return False, "Ride not found or driver not authorized"

        # 2️⃣ Mark driver active again
        activate_sql = text("""
            UPDATE driver
            SET is_active = TRUE
            WHERE driver_id = :d;
        """)
        conn.execute(activate_sql, {"d": driver_id})

    return True, f"Ride {ride_id} marked as completed. Driver {driver_id} is now active again"

def cancel_ride_by_driver(driver_id: int, ride_id: int):
    """
    Cancels a ride if it belongs to the given driver.
    Also marks the driver as active again.
    Returns (ok, message)
    """
    with engine.begin() as conn:
        #  Cancel the ride
        cancel_sql = text("""
            UPDATE ride
            SET status = 'cancelled'
            WHERE ride_id = :r AND driver_id = :d
            RETURNING ride_id;
        """)
        row = conn.execute(cancel_sql, {"r": ride_id, "d": driver_id}).fetchone()

        if not row:
            return False, "Ride not found or driver not authorized"

        # 2️⃣ Mark driver active again
        activate_sql = text("""
            UPDATE driver
            SET is_active = TRUE
            WHERE driver_id = :d;
        """)
        conn.execute(activate_sql, {"d": driver_id})

    return True, f"Ride {ride_id} cancelled successfully by driver {driver_id} (driver now active)"


def assign_driver_to_ride(ride_id, driver_id):
    """Assign a driver to the ride and mark it as pending."""
    ride = Ride.query.get(ride_id)
    if not ride:
        return {"ok": False, "msg": "Ride not found"}, 404

    # Update driver and status
    ride.driver_id = driver_id
    ride.status = "pending"
    db.session.commit()

    return {
        "ok": True,
        "msg": f"Driver {driver_id} assigned to ride {ride_id} with status 'pending'."
    }, 200

def drivers_from_ride():
    sql = text("SELECT * FROM drivers_from_ride()")
    with engine.begin() as conn:          # engine is a real object here
        rows = conn.execute(sql).fetchall()
    return [dict(r._mapping) for r in rows]

def get_non_active():
    sql = text("SELECT * FROM get_non_active_drivers()")
    with engine.begin() as conn:
        rows = conn.execute(sql).fetchall()
    return [dict(r._mapping) for r in rows]

def book_ride_proc(uid, did, pickup, drop, date, fare):
    sql = text("SELECT * FROM book_ride(:u,:d,:p,:dr,:dt,:f)")
    params = dict(u=uid, d=did, p=pickup, dr=drop, dt=date, f=fare)
    with engine.begin() as conn:
        ok, rid, msg = conn.execute(sql, params).fetchone()
    return ok, rid, msg

def login_user(email: str, password: str):
    """
    Returns (user_dict or None, message, success_bool).
    Mirrors the logic of your original stored procedure.
    """
    sql = text("""
        SELECT u.user_id,
               u.name,
               u.email,
               u.phone,
               u.type
        FROM public."user" u
        WHERE u.email = :email
          AND u.password = crypt(:pwd, u.password)
        LIMIT 1
    """)
    with engine.begin() as conn:
        row = conn.execute(sql, {"email": email, "pwd": password}).fetchone()

    if row:                         # login succeeded
        return dict(row._mapping), "Login successful", True
    else:                           # no match
        return None, "Invalid email or password", False
    
# ---------- db.py ----------
from sqlalchemy.exc import IntegrityError   # add this at top (used in route)
def signup_user(name: str, email: str, password: str, phone: str, utype: str):
    sql = text("""
        SELECT user_id, name, email, phone, type, msg, ok
        FROM signup_user(:n, :e, :p, :ph, :t);
    """)
    params = dict(n=name, e=email, p=password, ph=phone, t=utype)
    with engine.begin() as conn:
        row = conn.execute(sql, params).fetchone()

    print("row from DB ->", row)          # keep while debugging
    if row and row.ok:                    # ok comes from the procedure now
        return dict(row._mapping), row.msg, True
    return None, row.msg if row else "Unknown error", False

def signup_driver(name: str, email: str, password: str, license_no: str):
    sql = text("""
        SELECT * FROM signup_driver(:p_name, :p_email, :p_password, :p_license_no)
    """)
    params = dict(p_name=name, p_email=email, p_password=password, p_license_no=license_no)
    with engine.begin() as conn:
        row = conn.execute(sql, params).fetchone()
    if row and row.driver_id is not None:
        return dict(row._mapping), row.message, True
    return None, row.message if row else "Signup failed", False




# ---------- DRIVER LOGIN HELPER ----------
def login_driver(email: str, password: str):
    """
    Calls the login_driver stored procedure in the database.
    Verifies hashed password in the DB.
    Returns: (driver_dict, message, ok)
    """
    sql = text("""
        SELECT driver_id, name, email, license_no, message AS msg, TRUE AS ok
        FROM login_driver(:p_email, :p_password)
    """)
    params = dict(p_email=email, p_password=password)
    
    with engine.begin() as conn:
        row = conn.execute(sql, params).fetchone()
    
    if row:
        return dict(row._mapping), row.msg, True
    return None, "Invalid email or password", False

def get_pending_rides(driver_id: int):
    """
    Calls the stored procedure get_pending_rides to fetch pending rides for a driver.
    Returns a list of ride dictionaries.
    """
    sql = text("SELECT * FROM get_pending_rides(:driver_id)")
    with engine.begin() as conn:
        rows = conn.execute(sql, {"driver_id": driver_id}).fetchall()

    # Convert SQLAlchemy Row objects to dictionaries
    return [dict(r._mapping) for r in rows]

def accept_ride_proc(driver_id: int, ride_id: int):
    """
    Calls the accept_ride stored procedure.
    Returns (ok, msg)
    """
    sql = text("SELECT * FROM accept_ride(:driver_id, :ride_id)")
    with engine.begin() as conn:
        row = conn.execute(sql, {"driver_id": driver_id, "ride_id": ride_id}).fetchone()

    if row:
        return row.ok, row.msg
    return False, "Unknown error occurred"


def reject_ride_proc(driver_id: int, ride_id: int):
    """
    Calls the reject_ride stored procedure.
    Returns (ok, msg)
    """
    sql = text("SELECT * FROM reject_ride(:driver_id, :ride_id)")
    with engine.begin() as conn:
        row = conn.execute(sql, {"driver_id": driver_id, "ride_id": ride_id}).fetchone()

    if row:
        return row.ok, row.msg
    return False, "Unknown error occurred"


def update_driver_and_ride_location(driver_id: int, ride_id: int, lat: float, lon: float):
    """
    Updates driver's location and the ride's current location in DB.
    """
    with engine.begin() as conn:
        # Update driver
        conn.execute(
            text("""
                UPDATE driver
                SET "Latitude" = :lat,
                    "Longitude" = :lon,
                    last_updated = NOW()
                WHERE driver_id = :driver_id
            """),
            {"lat": lat, "lon": lon, "driver_id": driver_id}
        )

        # Update active ride location
        conn.execute(
            text("""
                UPDATE ride
                SET current_latitude = :lat,
                    current_longitude = :lon,
                    last_route_update = NOW()
                WHERE ride_id = :ride_id
            """),
            {"lat": lat, "lon": lon, "ride_id": ride_id}
        )

    return True

def start_ride_db(ride_id: int):
    sql = text("SELECT start_ride(:rid) AS msg;")

    with engine.begin() as conn:
        result = conn.execute(sql, {"rid": ride_id}).fetchone()
        if result:
            return True, result.msg
        return False, "Database error"

def add_feedback_db(ride_id: int, user_id: int, rating: int, comment: str):
    sql = text("SELECT add_ride_feedback(:ride_id, :user_id, :rating, :comment) AS msg;")
    try:
        with engine.begin() as conn:
            result = conn.execute(sql, {
                "ride_id": ride_id,
                "user_id": user_id,
                "rating": rating,
                "comment": comment
            }).fetchone()
        return True, result[0]
    except Exception as e:
        return False, str(e)
