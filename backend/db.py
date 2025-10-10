from sqlalchemy import create_engine, text
import os
from dotenv import load_dotenv
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