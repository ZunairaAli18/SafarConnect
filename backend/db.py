from sqlalchemy import create_engine, text
import os
from dotenv import load_dotenv
from werkzeug.exceptions import Unauthorized

load_dotenv()
DATABASE_URL = os.environ["DATABASE_URL"]   # set in .env
engine = create_engine(DATABASE_URL, pool_pre_ping=True, pool_size=5)

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

# ---------- DRIVER SIGNUP ----------
def signup_driver(name: str, email: str, password: str, license_no: str):
    sql = text("""
        SELECT driver_id, name, email, license_no, msg, ok
        FROM driver_signup(:n, :e, :p, :l);
    """)
    params = dict(n=name, e=email, p=password, l=license_no)
    with engine.begin() as conn:
        row = conn.execute(sql, params).fetchone()

    if row and row.ok:
        return dict(row._mapping), row.msg, True
    return None, row.msg if row else "Unknown error", False


# ---------- DRIVER LOGIN ----------
def login_driver(email: str, password: str):
    sql = text("""
        SELECT driver_id, name, email, license_no, msg, ok
        FROM driver_login(:e, :p);
    """)
    params = dict(e=email, p=password)
    with engine.begin() as conn:
        row = conn.execute(sql, params).fetchone()

    if row and row.ok:
        return dict(row._mapping), row.msg, True
    return None, row.msg if row else "Invalid email or password. Try again", False
