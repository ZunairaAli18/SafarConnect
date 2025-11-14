import os
from flask import Flask, jsonify, request
from flask_socketio import SocketIO, emit,join_room,leave_room  # type: ignore
from dotenv import load_dotenv
from models import db
from db import drivers_from_ride, get_non_active, book_ride_proc, login_user, signup_user,login_driver,signup_driver,assign_driver_to_ride,cancel_ride_by_driver,complete_ride_by_driver,update_user_location,update_driver_location,get_pending_rides,accept_ride_proc,reject_ride_proc,update_driver_and_ride_location,start_ride_db,add_feedback_db,get_user_profile,get_driver_profile
from werkzeug.exceptions import Unauthorized
from sqlalchemy.exc import IntegrityError
from route_service import RouteService
from fare_calculator import FareCalculator
from time import time
from flask_cors import CORS

load_dotenv()

# ---------- factory ----------
route_service = RouteService(api_key=os.getenv("ORS_API_KEY"))
fare_calc = FareCalculator()
driver_locations = {}   # store driver_id → (lat, lon)


def create_app():
    app = Flask(__name__)
    app.config['SECRET_KEY'] = 'change_me'
    app.config['SQLALCHEMY_DATABASE_URI'] = os.environ['DATABASE_URL']
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    CORS(app, origins=["http://127.0.0.1:5500"])
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
    

    @app.post("/driver/signup")
    def driver_signup():
      data = request.get_json(force=True)
      driver, msg, ok = signup_driver(
        name=data["name"],
        email=data["email"],
        password=data["password"],
        license_no=data["license_no"]
      )
      if not ok:
        return jsonify(msg=msg), 409
      return jsonify(driver=driver, msg=msg, ok=ok), 201


    @app.post("/driver/login")
    def driver_login():
      data = request.get_json(force=True)
      driver, msg, ok = login_driver(
        email=data["email"],
        password=data["password"]
      )
      if not ok:
        return jsonify(msg=msg), 401
      return jsonify(driver=driver, msg=msg, ok=ok)

    

    
    @app.post("/user/<int:user_id>/current_loc")
    def update_user_current_loc(user_id):
      """
      Endpoint to update user's current location (for riders or drivers).
    Example JSON:
    {
        "latitude": 24.8607,
        "longitude": 67.0011
    }
      """
      data = request.get_json()
      lat = float(data.get("latitude"))
      lon = float(data.get("longitude"))

      ok, msg = update_user_location(user_id, lat, lon)
      return jsonify({"ok": ok, "msg": msg}), (200 if ok else 404)
    
    @app.post("/ride/<int:ride_id>/start")
    def start_ride_endpoint(ride_id):
     ok, msg = start_ride_db(ride_id)
     
     if not ok:
        return jsonify({"ok": False, "msg": msg}), 400
     return jsonify({"ok": True, "msg": msg})

    @app.post("/driver/<int:driver_id>/current_loc")
    def update_driver_current_loc(driver_id):
      """
    Endpoint to update the driver's current location.
    Example JSON:
    {
        "latitude": 24.8607,
        "longitude": 67.0011
    }
      """
      data = request.get_json()
      lat = float(data.get("latitude"))
      lon = float(data.get("longitude"))

      ok, msg = update_driver_location(driver_id, lat, lon)
      return jsonify({"ok": ok, "msg": msg}), (200 if ok else 404)
    @app.post("/driver/<int:driver_id>/get_requests")
    def driver_get_requests(driver_id):
      """
    Fetches all pending rides assigned to the driver.
      """
      try:
        rides = get_pending_rides(driver_id)
        if not rides:
            return jsonify(msg="No pending rides found", rides=[], ok=True), 200
        return jsonify(rides=rides, ok=True, msg="Pending rides fetched successfully"), 200
      except Exception as e:
        return jsonify(msg=str(e), ok=False), 500
    
    @app.post("/driver/<int:driver_id>/accept_ride")
    def accept_ride(driver_id):
     """
    Driver accepts a ride. Updates ride status and driver active flag via stored procedure.
     """
     data = request.get_json(force=True)
     ride_id = data.get("ride_id")

     if not ride_id:
        return jsonify(msg="ride_id is required", ok=False), 400

     ok, msg = accept_ride_proc(driver_id, ride_id)
     status_code = 200 if ok else 400
     return jsonify(ok=ok, msg=msg), status_code
    
    @app.post("/driver/<int:driver_id>/reject")
    def reject_ride(driver_id):
     """
    Driver rejects a ride. Updates ride status to 'rejected' via stored procedure.
     """
     data = request.get_json(force=True)
     ride_id = data.get("ride_id")

     if not ride_id:
        return jsonify(msg="ride_id is required", ok=False), 400

     ok, msg = reject_ride_proc(driver_id, ride_id)
     status_code = 200 if ok else 400
     return jsonify(ok=ok, msg=msg), status_code
    
    @app.post("/ride/<int:ride_id>/complete")
    def ride_complete(ride_id):
     data = request.get_json()
     driver_id = data.get("driver_id")

     ok, msg = complete_ride_by_driver(driver_id, ride_id)
     return jsonify({"ok": ok, "msg": msg}), (200 if ok else 400)

    # @app.get("/drivers/active")
    # def active_drivers():
    #     return jsonify(drivers_from_ride())

    # @socketio.on('list_non_active')
    # def ws_list_non_active():
    #     drivers = get_non_active()
    #     emit('non_active_list', drivers)

    # @socketio.on('book_ride')
    # def ws_book_ride(data):
    #     ok, ride_id, msg = book_ride_proc(
    #         data['user_id'],
    #         data['driver_id'],
    #         data['pickup'],
    #         data['drop'],
    #         data['ride_date'],
    #         data['fare']
    #     )
    #     # broadcast driver status change to every connected client
    #     emit('driver_status_change',
    #          {'driver_id': data['driver_id'], 'active': True},
    #          broadcast=True)
    #     # send booking result back to caller
    #     emit('book_result', {'success': ok, 'ride_id': ride_id, 'msg': msg})

    @app.post("/<int:driver_id>/<int:ride_id>/cancel_ride")
    def cancel_ride(driver_id, ride_id):
    

       ok, msg = cancel_ride_by_driver(driver_id, ride_id)

       return jsonify({"ok": ok, "msg": msg}), (200 if ok else 404) 
    
    

 
    
    @app.post("/estimate_fare")
    def estimate_fare():
      data = request.get_json()

      pickup_lat = float(data["pickup_lat"])
      pickup_lon = float(data["pickup_lon"])
      drop_lat   = float(data["drop_lat"])
      drop_lon   = float(data["drop_lon"])
      print(pickup_lat,pickup_lon,drop_lat,drop_lon)
    # 1️⃣ Get optimized route details (distance & duration)
      distance_km, duration_min,_ = route_service.get_route(
        (pickup_lon, pickup_lat),
        (drop_lon, drop_lat)
      )

    # 2️⃣ Compute estimated fare
      estimated_fare = fare_calc.compute(distance_km, duration_min)
      print(estimate_fare)
    # 3️⃣ Send result back to frontend
      return jsonify({
        "distance_km": round(distance_km, 2),
        "duration_min": round(duration_min, 1),
        "estimated_fare": round(estimated_fare, 2)
      })
    
    @app.post("/request_driver")
    def request_driver():
        data = request.get_json()
        ride_id = int(data["ride_id"])
        driver_id = int(data["driver_id"])

        response, status = assign_driver_to_ride(ride_id, driver_id)
        return jsonify(response), status

    @app.post("/create_ride_request")
    def create_ride_request():
     data = request.get_json()

    #  Extract data from frontend
     pickup_name = data["pickup_name"]        # e.g. "Gulberg"
     drop_name   = data["drop_name"]   
     pickup_lat = float(data["pickup_lat"])
     pickup_lon = float(data["pickup_lon"])
     drop_lat   = float(data["drop_lat"])
     drop_lon   = float(data["drop_lon"])
     user_id    = int(data["user_id"])
     min_fare   = float(data["min_fare"])
     max_fare   = float(data["max_fare"])
     estimated_fare = float(data["estimated_fare"])
     distance_km = float(data.get("distance_km", 0))
     duration_min = float(data.get("duration_min", 0))
     ride_date  = db.func.current_date()

    #  Validate estimated fare
     if not (min_fare <= estimated_fare <= max_fare):
        return jsonify({
            "ok": False,
            "msg": f"Estimated fare Rs {estimated_fare:.2f} is outside your selected range ({min_fare}–{max_fare})."
        }), 400
     from models import Ride
    #  Create the ride entry in DB
     new_ride = Ride(
        pickup=pickup_name,
        drop=drop_name,
        ride_date=ride_date,
        fare=estimated_fare,
        driver_id=None,
        user_id=user_id,
        pickup_latitude=pickup_lat,
        pickup_longitude=pickup_lon,
        drop_latitude=drop_lat,
        drop_longitude=drop_lon,
        current_latitude=None,
        current_longitude=None,
        distance_km=distance_km,
        duration_min=duration_min,
        last_route_update=db.func.now()
     )

     db.session.add(new_ride)
     db.session.commit()

    #  Return response
     return jsonify({
        "ride_id": new_ride.ride_id,
        "estimated_fare": round(estimated_fare, 2),
        "distance_km": round(distance_km, 2),
        "duration_min": round(duration_min, 1),
        "msg": f"Ride request created successfully at Rs {estimated_fare:.2f}"
     }), 201
    
##LIVE TRACKING FEATURE HANDLING
    @socketio.on('join_ride')
    def join_ride(data):
      """
     Passenger joins a room to receive live driver location for this ride.
     Expects: { "ride_id": 19 }
     """
      ride_id = data.get("ride_id")
      if ride_id:
        join_room(f"ride_{ride_id}")
        emit("joined_room", {"msg": f"Joined ride {ride_id}"})
    
    @socketio.on('driver_location_update')
    def handle_driver_location(data):
      """
    Driver sends live location updates.
    Expects:
    {
        "driver_id": 1,
        "ride_id": 19,
        "latitude": 24.8600,
        "longitude": 67.0015
    }
      """
      driver_id = data.get("driver_id")
      ride_id = data.get("ride_id")
      lat = data.get("latitude")
      lon = data.get("longitude")

      if not all([driver_id, ride_id, lat, lon]):
        emit('location_update_response', {"ok": False, "msg": "Missing fields"})
        return

      ok = update_driver_and_ride_location(driver_id, ride_id, lat, lon)
      if ok:
        emit('location_update_response', {"ok": True, "msg": "Location updated"})
        # Broadcast to passengers in this ride's room only
        emit('ride_location', {"lat": lat, "lon": lon}, room=f"ride_{ride_id}")
      else:
        emit('location_update_response', {"ok": False, "msg": "Update failed"})
    
    @socketio.on('leave_ride')
    def leave_ride(data):
     ride_id = data.get("ride_id")
     if ride_id:
        leave_room(f"ride_{ride_id}")
        emit("left_room", {"msg": f"Left ride {ride_id}"})

  
    # @socketio.on("driver_location")
    # def ws_driver_location(data):
    #   driver_id = data["driver_id"]
    #   ride_id   = data["ride_id"]
    #   lat, lon  = float(data["lat"]), float(data["lon"])

    # # --- store latest position in memory ---
    #   driver_locations[driver_id] = {
    #     "ride_id": ride_id,
    #     "lat": lat,
    #     "lon": lon,
    #     "updated": time()
    #    }

    # # --- use it for route optimization ---
    #   from models import Ride, db
    #   ride = Ride.query.get(ride_id)
    #   if not ride:
    #     emit("error", {"msg": "Ride not found"})
    #     return

    #   drop_lon, drop_lat = map(float, ride.drop.split(','))
    #   distance_km, duration_min = route_service.get_route((lon, lat), (drop_lon, drop_lat))

    # --- send ETA & distance updates ---
    #   emit("ride_update", {
    #     "ride_id": ride_id,
    #     "driver_id": driver_id,
    #     "distance_remaining_km": round(distance_km, 2),
    #     "duration_remaining_min": round(duration_min, 1),
    #     "fare": float(ride.fare)
    #   }, broadcast=True)

    # # --- occasionally sync to DB ---
    #   if time() - driver_locations[driver_id]["updated"] > 60:  # every ~1 minute
    #     ride.current_latitude  = lat
    #     ride.current_longitude = lon
    #     ride.distance_km       = distance_km
    #     ride.duration_min      = duration_min
    #     ride.last_route_update = db.func.now()
    #     db.session.commit()

    # @socketio.on("ride_complete")
    # def ws_ride_complete(data):
    #  ride_id = data["ride_id"]
    #  lat, lon = data["lat"], data["lon"]

    #  from models import Ride, db
    #  ride = Ride.query.get(ride_id)
    #  if ride:
    #     ride.current_latitude  = lat
    #     ride.current_longitude = lon
    #     ride.last_route_update = db.func.now()
    #     db.session.commit()

    #  emit("ride_complete_ack", {"ride_id": ride_id, "msg": "Ride data saved"})
    
    @app.post("/ride/<int:ride_id>/feedback")
    def feedback_endpoint(ride_id):
     data = request.json
     user_id = data.get("user_id")
     rating = data.get("rating")
     comment = data.get("comment")

     ok, msg = add_feedback_db(ride_id, user_id, rating, comment)
     return jsonify({"ok": ok, "msg": msg})
    
    @app.get("/user/<int:user_id>/profile")
    def user_profile(user_id):
      """
    Returns user profile data.
      """
      user, ok = get_user_profile(user_id)
      if not ok:
        return jsonify(ok=False, msg="User not found"), 404
      return jsonify(ok=True, user=user)
    
    @app.get("/driver/<int:driver_id>/profile")
    def driver_profile(driver_id):
     """
    Returns driver profile data.
     """
     from db import get_driver_profile
     driver, ok = get_driver_profile(driver_id)
     if not ok:
        return jsonify(ok=False, msg="Driver not found"), 404
     return jsonify(ok=True, driver=driver)

    return app, socketio
    
    

# ---------- run only when file is executed directly ----------
if __name__ == '__main__':
    app, socketio = create_app()
    # create it first
    with app.app_context():     # now app is a real object
        db.create_all()         # create missing tables
    socketio.run(app, debug=True)

