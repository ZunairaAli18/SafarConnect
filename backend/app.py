import os
from flask import Flask, jsonify, request
from flask_socketio import SocketIO, emit  # type: ignore
from dotenv import load_dotenv
from models import db
from db import drivers_from_ride, get_non_active, book_ride_proc, login_user, signup_user,login_driver,signup_driver
from werkzeug.exceptions import Unauthorized
from sqlalchemy.exc import IntegrityError


load_dotenv()

# ---------- factory ----------


def create_app():
    app = Flask(__name__)
    app.config['SECRET_KEY'] = 'change_me'
    app.config['SQLALCHEMY_DATABASE_URI'] = os.environ['DATABASE_URL']
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    db.init_app(app)
    socketio = SocketIO(app, cors_allowed_origins='*')

    # ---- example blue-print / routes ----
    @app.get('/')
    def hello():
        return jsonify(msg='Flask ↔ Supabase ready!')

    @app.post("/login")
    def login():
        data = request.get_json(force=True)
        email = data.get("email")
        password = data.get("password")
        if not email or not password:
            return jsonify(msg="email and password required"), 400

        user, msg, ok = login_user(email, password)
        if not ok:
            raise Unauthorized(msg)
        return jsonify(user=user, msg=msg, ok=ok)

       # add at top

    # ---------- app.py ----------
    @app.post("/signup")
    def signup():
        print("Content-Type :", request.content_type)      # debug
        print("Raw body     :", request.get_data(as_text=True))

        data = request.get_json()          # remove force=True while debugging
        if data is None:                   # will be None if JSON bad/missing header
            return jsonify(msg="Body must be valid JSON"), 400

        required = {"name", "email", "password", "phone", "type"}
        if missing := required - data.keys():
            return jsonify(msg=f"missing fields: {missing}"), 400

        try:
            user, msg, ok = signup_user(
                name=data["name"],
                email=data["email"],
                password=data["password"],
                phone=data["phone"],
                utype=data["type"]
            )
        except IntegrityError as exc:
            if "unique" in str(exc.orig).lower():
                return jsonify(msg="Email already registered"), 409
            raise

        if not ok:                 # procedure returned ok=false
            return jsonify(msg=msg), 409

        return jsonify(user=user, msg=msg, ok=ok), 201
    

    # ---------- DRIVER SIGNUP ----------
    @app.post("/driver/signup")
    def driver_signup():
        data = request.get_json(force=True)
        required = {"name", "email", "password", "license_no"}
        if missing := required - data.keys():
            return jsonify(msg=f"Missing fields: {missing}"), 400

        try:
            driver, msg, ok = signup_driver(
                name=data["name"],
                email=data["email"],
                password=data["password"],
                license_no=data["license_no"]
            )
        except IntegrityError as exc:
            if "unique" in str(exc.orig).lower():
                return jsonify(msg="Email or license already registered"), 409
            raise

        if not ok:
            return jsonify(msg=msg), 409
        return jsonify(driver=driver, msg=msg, ok=ok), 201
    

    # ---------- DRIVER LOGIN ----------
    @app.post("/driver/login")
    def driver_login():
        data = request.get_json(force=True)
        if not data.get("email") or not data.get("password"):
            return jsonify(msg="email and password required"), 400

        driver, msg, ok = login_driver(data["email"], data["password"])
        if not ok:
            return jsonify(msg=msg), 401
        return jsonify(driver=driver, msg=msg, ok=ok)

    @app.get("/drivers/active")
    def active_drivers():
        return jsonify(drivers_from_ride())

    @socketio.on('list_non_active')
    def ws_list_non_active():
        drivers = get_non_active()
        emit('non_active_list', drivers)

    @socketio.on('book_ride')
    def ws_book_ride(data):
        ok, ride_id, msg = book_ride_proc(
            data['user_id'],
            data['driver_id'],
            data['pickup'],
            data['drop'],
            data['ride_date'],
            data['fare']
        )
        # broadcast driver status change to every connected client
        emit('driver_status_change',
             {'driver_id': data['driver_id'], 'active': True},
             broadcast=True)
        # send booking result back to caller
        emit('book_result', {'success': ok, 'ride_id': ride_id, 'msg': msg})
    return app, socketio


# ---------- run only when file is executed directly ----------
if __name__ == '__main__':
    app, socketio = create_app()
    # create it first
    with app.app_context():     # now app is a real object
        db.create_all()         # create missing tables
    socketio.run(app, debug=True)
