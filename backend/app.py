import os
from flask import Flask, jsonify, request
from sqlalchemy import text,create_engine
import jwt
import datetime
from functools import wraps
from flask_socketio import SocketIO, emit,join_room,leave_room  # type: ignore
from dotenv import load_dotenv
from ml_recommender import DriverRecommender
from models import db
import redis
from db import drivers_from_ride, get_non_active, book_ride_proc, login_user, signup_user,login_driver,signup_driver,assign_driver_to_ride,cancel_ride_by_driver,complete_ride_by_driver,update_user_location,update_driver_location,get_pending_rides,accept_ride_proc,reject_ride_proc,update_driver_and_ride_location,start_ride_db,add_feedback_db,get_user_profile,get_driver_profile,get_vehicle_by_driver_id,create_vehicle,update_vehicle,update_driver_discount,start_ride_transaction,complete_ride_transaction,get_available_drivers
from werkzeug.exceptions import Unauthorized
from sqlalchemy.exc import IntegrityError
from route_service import RouteService
from fare_calculator import FareCalculator
from time import time
from flask_cors import CORS
from WeatherService import WeatherService
import pandas as pd
import numpy as np 
import eventlet

load_dotenv()

# ---------- factory ----------
route_service = RouteService(api_key=os.getenv("ORS_API_KEY"))
fare_calc = FareCalculator()
driver_locations = {}   # store driver_id → (lat, lon)
weather_service = WeatherService(api_key=os.getenv("OPENWEATHER_API_KEY"))
engine = create_engine("postgresql://postgres.iiegkhqdrgiywqvzodvr:zunairamuntaharabail@aws-1-us-east-1.pooler.supabase.com:6543/postgres", pool_pre_ping=True, pool_size=5)

SECRET_KEY='cb2a1f2a23921e96d3570d83082763beffb231cbb9ed0084238972d134c26f01'
r = redis.Redis(host='localhost', port=6379, db=0, decode_responses=True)

def create_access_token(user_id=None, driver_id=None, expires_in=3600):
    payload = {
        "exp": datetime.datetime.utcnow() + datetime.timedelta(seconds=expires_in),
        "iat": datetime.datetime.utcnow()
    }
    if user_id:
        payload["user_id"] = user_id
        payload["user_type"] = "user"
        key = f"user:{user_id}"
    if driver_id:
        payload["driver_id"] = driver_id
        payload["user_type"] = "driver"
        key = f"driver:{driver_id}"
    token = jwt.encode(payload, SECRET_KEY, algorithm="HS256")
    r.set(token, key, ex=expires_in)

    return token


def token_required(user_type=None):
    def decorator(f):
     @wraps(f)
     def decorated(*args, **kwargs):
        token = None

        # token comes from Authorization header → "Bearer <token>"
        if "Authorization" in request.headers:
            auth_header = request.headers["Authorization"]
            if auth_header.startswith("Bearer "):
                token = auth_header.split(" ")[1]

        if not token:
            return jsonify(msg="Token is missing"), 401
        
        if not r.exists(token):
           return jsonify(msg="Token is invalid or logged out"), 401
        
        try:
            data = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
            if user_type == "driver" and "driver_id" not in data:
                  return jsonify(msg="Driver token required"), 403
            if user_type == "user" and "user_id" not in data:
                  return jsonify(msg="User token required"), 403
            if user_type == "user":
             request.user_id = data["user_id"]   # attach user id to request
            else: 
             request.driver_id = data.get("driver_id")
            
            
        except jwt.ExpiredSignatureError:
            r.delete(token)
            return jsonify(msg="Token has expired"), 401
        except jwt.InvalidTokenError:
            return jsonify(msg="Invalid token"), 401

        return f(*args, **kwargs)
     return decorated
    return decorator

def save_weather_data(ride_id, weather_details, is_safe):
    """
    Helper function to save weather data in the database.
    Creates a new weather check record each time (historical tracking).
    
    Args:
        ride_id: The ride ID to associate weather data with
        weather_details: Dictionary containing weather information
        is_safe: Boolean indicating if conditions are safe
    """
    from models import Weather
    
    try:
        # Always create new record to maintain weather check history
        weather_record = Weather(
            ride_id=ride_id,
            checked_at=db.func.current_timestamp(),
            temperature=weather_details.get('temperature'),
            wind_speed=weather_details.get('wind_speed_ms'),
            visibility=weather_details.get('visibility_m'),
            humidity=weather_details.get('humidity'),
            weather_code=weather_details.get('weather_code'),
            condition=weather_details.get('condition'),
            is_safe=is_safe
        )
        db.session.add(weather_record)
        db.session.commit()
        return True
    except Exception as e:
        print(f"Error saving weather data: {e}")
        db.session.rollback()
        return False
    
def create_app():
    app = Flask(__name__)
    app.config['JWT_SECRET_KEY'] = 'cb2a1f2a23921e96d3570d83082763beffb231cbb9ed0084238972d134c26f01'
    app.config['SQLALCHEMY_DATABASE_URI'] = os.environ['DATABASE_URL']
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    CORS(app, origins=["http://127.0.0.1:3000", "http://localhost:3000"])
    db.init_app(app)
    socketio = SocketIO(app, cors_allowed_origins='*')
    # Initialize ML Recommender
    recommender = DriverRecommender()
    try:
        recommender.load_model('models/driver_recommender.pkl')
        print("✓ ML Model loaded")
    except:
        print("⚠ No model found. Train using /train_model")

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
        token = create_access_token(user_id=user["user_id"])
        print(user)
        return jsonify(user=user,token=token, msg=msg, ok=ok)

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
        token = create_access_token(user_id=user["user_id"])
        return jsonify(user=user, token=token, msg=msg, ok=ok), 201
    
    @app.post("/user/logout")
    @token_required(user_type="user")
    def user_logout():
       auth_header=request.headers.get("Authorization")
       if not auth_header or not auth_header.startswith("Bearer"):
          return jsonify(msg="Token missing"),401
       token=auth_header.split(" ")[1]
       r.delete(token)
       return jsonify(msg="Logged out suc   cessfully"), 200
       
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
      token=create_access_token(driver_id=driver["driver_id"])
      return jsonify(driver=driver,token=token, msg=msg, ok=ok), 201


    @app.post("/driver/login")
    def driver_login():
      data = request.get_json(force=True)
      driver, msg, ok = login_driver(
        email=data["email"],
        password=data["password"]
      )
      if not ok:
        return jsonify(msg=msg), 401
      token=create_access_token(driver_id=driver["driver_id"])
      return jsonify(driver=driver, token=token, msg=msg, ok=ok)

    @app.post("/driver/logout")
    @token_required(user_type="driver")
    def driver_logout():
       auth_header=request.headers.get("Authorization")
       if not auth_header or not auth_header.startswith("Bearer"):
          return jsonify(msg="Token missing"),401
       token=auth_header.split(" ")[1]
       r.delete(token)
       return jsonify(msg="Logged out successfully"), 200

    
    @app.post("/user/<int:user_id>/current_loc")
    @token_required(user_type="user") 
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
    @token_required(user_type="driver")
    def start_ride_endpoint(ride_id):
     """
    Start a ride. Driver must have accepted the ride first.
    
    Headers:
        Authorization: Bearer <driver_token>
    
    Returns:
        200: Ride started successfully
        400: Invalid request (wrong status, not assigned to driver, etc.)
        401: Unauthorized
        500: Server error
     """
    # Get driver_id from token (set by @token_required decorator)
     driver_id = request.driver_id
    
    # Call transaction function
     success, message = start_ride_transaction(ride_id, driver_id)
     if success:
       socketio.emit('ride_started', {
        'ride_id': ride_id,
        'status': 'in_progress',
        'driver_id': driver_id
        }, room=f'ride_{ride_id}')
       
     if not success:
        return jsonify({
            "ok": False, 
            "msg": message
        }), 400
    
     return jsonify({
        "ok": True, 
        "msg": message,
        "ride_id": ride_id,
        "status": "in_progress"
     }), 200
    # @app.post("/ride/<int:ride_id>/start")
    # @token_required(user_type="driver") 
    # def start_ride_endpoint(ride_id):
    #  ok, msg = start_ride_db(ride_id)
     
    #  if not ok:
    #     return jsonify({"ok": False, "msg": msg}), 400
    #  return jsonify({"ok": True, "msg": msg})

    @app.post("/driver/<int:driver_id>/current_loc")
    @token_required(user_type="driver") 
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
    @token_required(user_type="driver")
    def accept_ride(driver_id):
     """
    Driver accepts a ride. Updates ride status and driver active flag via stored procedure.
     """
     data = request.get_json(force=True)
     ride_id = data.get("ride_id")

     if not ride_id:
        return jsonify(msg="ride_id is required", ok=False), 400
     from models import Ride
     ride = Ride.query.get(ride_id)
     if not ride:
         return jsonify(msg="Ride not found", ok=False), 404
     
     is_safe, alert_msg, weather_details = weather_service.check_weather_safety(
         ride.pickup_latitude, 
         ride.pickup_longitude
     )
     save_weather_data(ride_id, weather_details, is_safe)
     if not is_safe:
         return jsonify({
             "ok": False,
             "msg": "Cannot accept ride due to unsafe weather conditions",
             "weather_alert": alert_msg,
             "weather_details": weather_details
         }), 400
     ok, msg = accept_ride_proc(driver_id, ride_id)
     response = {"ok": ok, "msg": msg}
     
     # Include weather info even if safe (as advisory)
     if weather_details.get('severity') in ['moderate', 'mild']:
         response["weather_warning"] = alert_msg
         response["weather_details"] = weather_details
     from models import Driver
     if ok:
        driver = Driver.query.get(driver_id)
        socketio.emit('driver_accepted', {
            'ride_id': ride_id,
            'driver_id': driver_id,
            'driver_name': driver.name if driver else 'Driver'
        
        }, room=f'ride_{ride_id}')
        print(f'Driver {driver_id} accepted ride {ride_id}')
    
     status_code = 200 if ok else 400
     recommender.update_driver_acceptance_probability(db, driver_id)
     return jsonify(response), status_code
    
    @app.post("/driver/<int:driver_id>/reject")
    @token_required(user_type="driver") 
    def reject_ride(driver_id):
     """
    Driver rejects a ride. Updates ride status to 'rejected' via stored procedure.
     """
     data = request.get_json(force=True)
     ride_id = data.get("ride_id")

     if not ride_id:
        return jsonify(msg="ride_id is required", ok=False), 400

     ok, msg = reject_ride_proc(driver_id, ride_id)
     print(msg);
     if ok:
        socketio.emit('driver_rejected', {
            'ride_id': ride_id,
            'driver_id': driver_id,
            'msg': msg
        }, room=f'ride_{ride_id}')
        print(f'Driver {driver_id} rejected ride {ride_id}')
    
     status_code = 200 if ok else 400
     recommender.update_driver_acceptance_probability(db, driver_id)
     return jsonify(ok=ok, msg=msg), status_code
    
    @app.post("/ride/<int:ride_id>/complete")
    @token_required(user_type="driver")
    def ride_complete(ride_id):
     """
    Complete a ride. Driver must have started the ride first.
    Creates payment record and frees up the driver.
    
    Request Body:
        {
            "payment_method": "cash" | "card" | "wallet" (optional, defaults to cash)
        }
    
    Headers:
        Authorization: Bearer <driver_token>
    
    Returns:
        200: Ride completed successfully with payment details
        400: Invalid request (wrong status, not assigned to driver, etc.)
        401: Unauthorized
        500: Server error
     """
    # Get driver_id from token (set by @token_required decorator)
     driver_id = request.driver_id
    
    # Get optional payment method from request body
     data = request.get_json() or {}
     payment_method = data.get("payment_method", "cash")
    
    # Validate payment method
     valid_methods = ["cash", "card", "wallet", "online"]
     if payment_method not in valid_methods:
        return jsonify({
            "ok": False,
            "msg": f"Invalid payment method. Must be one of: {', '.join(valid_methods)}"
        }), 400
    
    # Call transaction function
     success, message, payment_id, fare = complete_ride_transaction(
        driver_id, 
        ride_id, 
        payment_method
     )
     if success:
        socketio.emit('complete_ride_socket', {
        'ride_id': ride_id,
        'status': 'completed',
        'fare': float(fare),
        'payment_method': payment_method
        }, room=f'ride_{ride_id}')

     if not success:
        return jsonify({
            "ok": False, 
            "msg": message
        }), 400
    
     return jsonify({
        "ok": True, 
        "msg": message,
        "ride_id": ride_id,
        "payment_id": payment_id,
        "fare": float(fare),
        "payment_method": payment_method,
        "status": "completed"
     }), 200

    # @app.post("/ride/<int:ride_id>/complete")
    # @token_required(user_type="driver")
    # def ride_complete(ride_id):
    #  data = request.get_json()
    #  driver_id = data.get("driver_id")

    #  ok, msg = complete_ride_by_driver(driver_id, ride_id)
    #  return jsonify({"ok": ok, "msg": msg}), (200 if ok else 400)

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
    @token_required(user_type="driver")
    def cancel_ride(driver_id, ride_id):
    

       ok, msg = cancel_ride_by_driver(driver_id, ride_id)

       return jsonify({"ok": ok, "msg": msg}), (200 if ok else 404) 
    
    

 
    
    @app.post("/estimate_fare")
    @token_required(user_type="users")
    def estimate_fare():
      data = request.get_json()

      pickup_lat = float(data["pickup_lat"])
      pickup_lon = float(data["pickup_lon"])
      drop_lat   = float(data["drop_lat"])
      drop_lon   = float(data["drop_lon"])
      print(pickup_lat,pickup_lon,drop_lat,drop_lon)
      is_safe, alert_msg, weather_details = weather_service.check_weather_safety(
          pickup_lat, 
          pickup_lon
      )
    #  Get optimized route details (distance & duration)
      distance_km, duration_min,_ = route_service.get_route(
        (pickup_lon, pickup_lat),
        (drop_lon, drop_lat)
      )

    #  Compute estimated fare
      estimated_fare = fare_calc.compute(distance_km, duration_min)
      print(estimate_fare)
    #  Send result back to frontend
      return jsonify({
        "distance_km": round(distance_km, 2),
        "duration_min": round(duration_min, 1),
        "estimated_fare": round(estimated_fare, 2),
        "weather_safe": is_safe,
        "weather_alert": alert_msg,
        "weather_details": weather_details
      })
    
    @app.post("/request_driver")
    @token_required(user_type="user")
    def request_driver():
        data = request.get_json()
        ride_id = int(data["ride_id"])
        driver_id = int(data["driver_id"])
        from models import Ride
        ride = Ride.query.get(ride_id)
        if not ride:
            return jsonify({"ok": False, "msg": "Ride not found"}), 404

        # Check current weather at pickup location
        is_safe, alert_msg, weather_details = weather_service.check_weather_safety(
            ride.pickup_latitude,
            ride.pickup_longitude
        )
        save_weather_data(ride_id, weather_details, is_safe)
        if not is_safe:
            return jsonify({
                "ok": False,
                "msg": "Cannot assign driver due to unsafe weather conditions",
                "weather_alert": alert_msg,
                "weather_details": weather_details
            }), 400
        response, status = assign_driver_to_ride(ride_id, driver_id)
        if weather_details.get('severity') in ['moderate', 'mild']:
            response["weather_warning"] = alert_msg
        socketio.emit(
        "ride_request_sent",
        {"ride_id": ride_id, "driver_id": driver_id},
        room=f"driver_{driver_id}"
    )   
        return jsonify(response), status

    @app.post("/create_ride_request")
    @token_required(user_type="user")
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
     
     is_safe, alert_msg, weather_details = weather_service.check_weather_safety(
         pickup_lat, 
         pickup_lon
     )
    #  save_weather_data(ride_id, weather_details, is_safe)
     if not is_safe:
         return jsonify({
             "ok": False,
             "msg": "Ride request blocked due to severe weather conditions",
             "weather_alert": alert_msg,
             "weather_details": weather_details
         }), 400
     
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
        status="pending",
        last_route_update=db.func.now()
     )

     db.session.add(new_ride)
     db.session.commit()

     response = {
        "ok": True,
        "ride_id": new_ride.ride_id,
        "estimated_fare": round(estimated_fare, 2),
        "distance_km": round(distance_km, 2),
        "duration_min": round(duration_min, 1),
        "msg": f"Ride request created successfully at Rs {estimated_fare:.2f}"
     }

     # Include weather advisory if moderate conditions
     if weather_details.get('severity') in ['moderate', 'mild']:
         response["weather_warning"] = alert_msg
         response["weather_details"] = weather_details

     return jsonify(response), 201
    
   
     
    @app.post("/check_weather")
    def check_weather():
        """
        Standalone endpoint to check weather at any location.
        Useful for real-time updates.
        """
        data = request.get_json()
        lat = float(data.get("latitude"))
        lon = float(data.get("longitude"))

        is_safe, alert_msg, weather_details = weather_service.check_weather_safety(lat, lon)

        return jsonify({
            "ok": True,
            "is_safe": is_safe,
            "alert": alert_msg,
            "weather": weather_details
        })
    
##LIVE TRACKING FEATURE HANDLING

    @socketio.on('connect')
    def handle_connect():
      """Handle client connection"""
      print(f'Client connected: {request.sid}')
      emit('connected', {'msg': 'Connected to server'})

    @socketio.on('disconnect')
    def handle_disconnect():
        """Handle client disconnection"""
        print(f'Client disconnected: {request.sid}')

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
          print(f"Passenger joined ride_{ride_id}")

    @socketio.on('join_driver_room')
    def handle_join_driver_room(data):
        """
    Driver joins their personal room to receive ride requests.
    Expects: { "driver_id": 1 }
    """
        driver_id = data.get('driver_id')
        if driver_id:
            join_room(f'driver_{driver_id}')
            emit('joined_driver_room', {'msg': f'Joined driver room {driver_id}'})
            print(f'Driver {driver_id} joined their room')

    @socketio.on('leave_ride')
    def leave_ride(data):
        """
    Leave a ride room
    Expects: { "ride_id": 19 }
        """
        ride_id = data.get("ride_id")
        if ride_id:
            leave_room(f"ride_{ride_id}")
            emit("left_room", {"msg": f"Left ride {ride_id}"})
            print(f"Left ride_{ride_id}")

    @socketio.on('ride_request_sent')
    def handle_ride_request_sent(data):    
      """
    Notify driver when a ride request is sent to them.
    Called after user sends request via /request_driver endpoint.
    Expects: { "ride_id": 19, "driver_id": 1 }
      """
      ride_id = data.get('ride_id')
      driver_id = data.get('driver_id')
    
      if ride_id and driver_id:
        from models import Ride, User
        ride = Ride.query.get(ride_id)
        user = User.query.get(ride.user_id) if ride else None
        
        if ride:
            # Emit to specific driver's room
            socketio.emit('new_ride_request', {
                'ride_id': ride_id,
                'user_id': ride.user_id,
                'user_name': user.name if user else 'User',
                'pickup': ride.pickup,
                'drop': ride.drop,
                'pickup_lat': ride.pickup_latitude,
                'pickup_lon': ride.pickup_longitude,
                'drop_lat': ride.drop_latitude,
                'drop_lon': ride.drop_longitude,
                'fare': float(ride.fare),
                'distance_km': float(ride.distance_km),
                'duration_min': float(ride.duration_min),
                'message': 'New ride request received!',
                'timestamp': str(datetime.datetime.now())
            }, room=f'driver_{driver_id}')
            
            print(f'Ride request {ride_id} notification sent to driver {driver_id}')

    @socketio.on('driver_accept_ride_socket')
    def handle_driver_accept_socket(data):    
      """
    Handle driver acceptance notification via socket.
    This is called AFTER the driver calls the /driver/<id>/accept_ride endpoint.
    Expects: { "ride_id": 19, "driver_id": 1, "driver_name": "Ahmed Khan" }
     """
      ride_id = data.get('ride_id')
      driver_id = data.get('driver_id')
      driver_name = data.get('driver_name')
    
      if ride_id and driver_id:
        # This is already handled in the accept_ride endpoint
        # Just log it here
        print(f'Socket confirmation: Driver {driver_id} accepted ride {ride_id}')

    @socketio.on('driver_reject_ride_socket')
    def handle_driver_reject_socket(data):    
     """
    Handle driver rejection notification via socket.
    This is called AFTER the driver calls the /driver/<id>/reject endpoint.
    Expects: { "ride_id": 19, "driver_id": 1 }
    """
     ride_id = data.get('ride_id')
     driver_id = data.get('driver_id')
    
     if ride_id and driver_id:
        # This is already handled in the reject_ride endpoint
        # Just log it here
        print(f'Socket confirmation: Driver {driver_id} rejected ride {ride_id}')

    @socketio.on('start_ride_socket')
    def handle_start_ride_socket(data):
     """
    Notify passenger that driver has started the ride.
    This is called AFTER the driver calls the /ride/<id>/start endpoint.
    Expects: { "ride_id": 19, "driver_id": 1 }
     """
     ride_id = data.get('ride_id')
     driver_id = data.get('driver_id')
    
     if ride_id and driver_id:
        # Notify user in the ride room - this is already handled in start_ride_endpoint
        print(f'Socket confirmation: Ride {ride_id} started by driver {driver_id}')

    @socketio.on('driver_location_update')
    def handle_driver_location(data):
      """
    Driver sends live location updates during active ride.
    This should be called every few seconds while ride is in progress.
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

    # Update location in database
      ok = update_driver_and_ride_location(driver_id, ride_id, lat, lon)
    
      if ok:
        # Confirm to driver
        emit('location_update_response', {"ok": True, "msg": "Location updated"})
        
        # Broadcast to passenger in this ride's room
        socketio.emit('ride_location', {
            "lat": lat,
            "lon": lon,
            "timestamp": datetime.datetime.now().isoformat()
        }, room=f"ride_{ride_id}")
        
        # Optional: Calculate and send ETA updates
        from models import Ride
        ride = Ride.query.get(ride_id)
        if ride and ride.drop_latitude and ride.drop_longitude:
            try:
                # Calculate remaining distance
                from math import radians, sin, cos, sqrt, atan2
                R = 6371  # Earth's radius in km
                
                lat1, lon1 = radians(lat), radians(lon)
                lat2, lon2 = radians(ride.drop_latitude), radians(ride.drop_longitude)
                
                dlat = lat2 - lat1
                dlon = lon2 - lon1
                
                a = sin(dlat/2)**2 + cos(lat1) * cos(lat2) * sin(dlon/2)**2
                c = 2 * atan2(sqrt(a), sqrt(1-a))
                distance_remaining = R * c
                
                # Estimate time (assuming 30 km/h average speed)
                eta_minutes = int((distance_remaining / 30) * 60)
                
                # Send progress update
                total_distance = ride.distance_km if ride.distance_km else 1
                progress = max(0, min(100, ((total_distance - distance_remaining) / total_distance) * 100))
                
                socketio.emit('ride_progress', {
                    "distance_remaining": round(distance_remaining, 2),
                    "eta_minutes": eta_minutes,
                    "progress": round(progress, 1)
                }, room=f"ride_{ride_id}")
                
            except Exception as e:
                print(f"Error calculating ETA: {e}")
      else:
        emit('location_update_response', {"ok": False, "msg": "Update failed"})

    @socketio.on('complete_ride_socket')
    def handle_complete_ride_socket(data):
      """
    Notify passenger that ride has been completed.
    This is called AFTER the driver calls the /ride/<id>/complete endpoint.
    Expects: { "ride_id": 19, "driver_id": 1 }
        """
      ride_id = data.get('ride_id')
      driver_id = data.get('driver_id')
    
      if ride_id and driver_id:
        # This is already handled in the ride_complete endpoint
        print(f'Socket confirmation: Ride {ride_id} completed by driver {driver_id}')

    @socketio.on('request_current_location')
    def handle_request_current_location(data):
        """
    Passenger requests driver's current location.
    Useful when passenger first joins the tracking page.
    Expects: { "ride_id": 19 }
        """
        ride_id = data.get('ride_id')
    
        if ride_id:
            from models import Ride
            ride = Ride.query.get(ride_id)
        
            if ride and ride.current_latitude and ride.current_longitude:
             emit('ride_location', {
                "lat": ride.current_latitude,
                "lon": ride.current_longitude,
                "timestamp": datetime.datetime.now().isoformat()
                })
            else:
             emit('location_error', {"msg": "Location not available yet"})

    @socketio.on('ping')
    def handle_ping(data):
      """
    Simple ping/pong for connection testing
      """
      emit('pong', {'msg': 'Connection active'})

    from models import Driver,Ride  
    @app.route("/driver/<int:driver_id>/stats", methods=["GET"])
    @token_required(user_type="driver")
    def driver_stats(driver_id):
    # Fetch driver
     driver = Driver.query.filter_by(driver_id=driver_id).first()
     if not driver:
        return jsonify({"ok": False, "msg": "Driver not found"}), 404

    # Total completed rides
     total_rides = Ride.query.filter_by(driver_id=driver_id, status='completed').count()

    # Average rating (use stored rating_avg)
     avg_rating = round(driver.rating_avg, 2) if driver.rating_avg else None

     return jsonify({
        "ok": True,
        "driver_id": driver.driver_id,
        "name": driver.name,
        "total_rides": total_rides,
        "average_rating": avg_rating
     })
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
    @token_required(user_type="user")
    def feedback_endpoint(ride_id):
     data = request.json
     user_id = data.get("user_id")
     rating = data.get("rating")
     comment = data.get("comment")

     ok, msg = add_feedback_db(ride_id, user_id, rating, comment)
     return jsonify({"ok": ok, "msg": msg})
    
    @app.get("/user/<int:user_id>/profile")
    @token_required(user_type="user")
    def user_profile(user_id):
      """
    Returns user profile data.
      """
      user, ok = get_user_profile(user_id)
      if not ok:
        return jsonify(ok=False, msg="User not found"), 404
      return jsonify(ok=True, user=user)
    
    @app.get("/driver/<int:driver_id>/profile")
    @token_required(user_type="driver")
    def driver_profile(driver_id):
     """
    Returns driver profile data.
     """
     from db import get_driver_profile
     driver, ok = get_driver_profile(driver_id)
     if not ok:
        return jsonify(ok=False, msg="Driver not found"), 404
     return jsonify(ok=True, driver=driver)
    
    @app.get("/driver/<int:driver_id>/vehicle")
    @token_required(user_type="driver")
    def get_driver_vehicle(driver_id):
     """
    Get vehicle information for a driver
     """
     vehicle = get_vehicle_by_driver_id(driver_id)
    
     if not vehicle:
        return jsonify(ok=False, msg="No vehicle found"), 404
    
     return jsonify(ok=True, vehicle=vehicle)
    
    @app.post("/driver/<int:driver_id>/vehicle")
    @token_required(user_type="driver")
    def add_driver_vehicle(driver_id):
     """
    Add vehicle for a driver
     """
     data = request.get_json()
    
    # Check if vehicle already exists
     existing = get_vehicle_by_driver_id(driver_id)
     if existing:
        return jsonify(ok=False, msg="Vehicle already exists. Use PUT to update."), 400
    
     vehicle_data = {
        "vehicle_no": data.get("vehicle_no"),
        "type": data.get("type"),
        "driver_id": driver_id
      }
    
     ok, msg, vehicle = create_vehicle(vehicle_data)
    
     if not ok:
        return jsonify(ok=False, msg=msg), 400
    
     return jsonify(ok=True, msg="Vehicle added successfully", vehicle=vehicle)
    
    @app.put("/driver/<int:driver_id>/vehicle")
    @token_required(user_type="driver")
    def update_driver_vehicle(driver_id):
     """
    Update vehicle information
     """
     data = request.get_json()
    
     vehicle_data = {
        "vehicle_no": data.get("vehicle_no"),
        "type": data.get("type")
     }
    
     ok, msg, vehicle = update_vehicle(driver_id, vehicle_data)
    
     if not ok:
        return jsonify(ok=False, msg=msg), 400
    
     return jsonify(ok=True, msg="Vehicle updated successfully", vehicle=vehicle)
    
    @app.put("/driver/<int:driver_id>/discount")
    @token_required(user_type="driver")
    def update_discount(driver_id):
     """
     Update driver's discount percentage
     """
     data = request.get_json()
     discount = data.get("discount")
    
    # Validation
     if discount is None:
        return jsonify(ok=False, msg="Discount value is required"), 400
    
     try:
        discount = float(discount)
        if discount < 0 or discount > 100:
            return jsonify(ok=False, msg="Discount must be between 0 and 100"), 400
     except (ValueError, TypeError):
        return jsonify(ok=False, msg="Invalid discount value"), 400
    
     ok, msg = update_driver_discount(driver_id, discount)
    
     if not ok:
        return jsonify(ok=False, msg=msg), 400
    
     return jsonify(ok=True, msg=msg, discount=discount)
    
    @app.post("/train_model")
    def train_model_endpoint():
        """
        Train the ML model from historical ride data
        Call this endpoint once to train the model

        Example: POST http://localhost:5000/train_model
        """
        try:
            result = recommender.train_from_database(db)

            if result['success']:
                return jsonify({
                    'ok': True,
                    'msg': 'Model trained successfully',
                    'details': result
                }), 200
            else:
                return jsonify({
                    'ok': False,
                    'msg': result['message']
                }), 400

        except Exception as e:
            return jsonify({
                'ok': False,
                'msg': f'Training failed: {str(e)}'
            }), 500
        
    @app.post("/recommend_drivers")
    def recommend_drivers_endpoint():
     try:
        # Read JSON body
        data = request.get_json()
        if not data or 'lat' not in data or 'lon' not in data:
            return jsonify({"ok": False, "error": "lat and lon are required"}), 400

        pickup_lat = float(data['lat'])
        pickup_lon = float(data['lon'])
        top_n = int(data.get('top_n', 5))  # default 5
        print(pickup_lat,pickup_lon,top_n)
        # Call the stored procedure
        query = text("""
            SELECT * FROM recommend_drivers(:lat, :lon, :top_n)
        """)
        result = db.session.execute(query, {
            "lat": pickup_lat,
            "lon": pickup_lon,
            "top_n": top_n
        })

        # Convert to list of dictionaries
        drivers = [
            {
                "driver_id": row.driver_id,
                "name": row.name,
                "distance_km": float(row.distance_km)
            }
            for row in result
        ]
        print(drivers)
        return jsonify({
            "ok": True,
            "recommended_drivers": drivers,
            "count": len(drivers)
        }), 200

     except Exception as e:
        return jsonify({
            "ok": False,
            "error": str(e)
        }), 500
        
    # @app.post("/recommend_drivers")
    # def recommend_drivers_endpoint():
    #     """
    #     Get recommended drivers for a ride request

    #     Request Body:
    #     {
    #         "pickup_lat": 24.8607,
    #         "pickup_lon": 67.0011,
    #         "top_n": 5  (optional, default 5)
    #     }

    #     Returns:
    #     {
    #         "ok": true,
    #         "recommended_drivers": [
    #             {
    #                 "driver_id": 1,
    #                 "name": "Ahmed Khan",
    #                 "rating_avg": 4.5,
    #                 "distance_to_pickup": 2.3,
    #                 "ml_acceptance_probability": 0.85,
    #                 "recommendation_score": 0.78
    #             },
    #             ...
    #         ],
    #         "count": 5
    #     }
    #     """
    #     try:
    #         data = request.get_json()

    #         # Validate input
    #         if not data or 'pickup_lat' not in data or 'pickup_lon' not in data:
    #             return jsonify({
    #                 'ok': False,
    #                 'msg': 'pickup_lat and pickup_lon are required'
    #             }), 400

    #         pickup_lat = float(data['pickup_lat'])
    #         pickup_lon = float(data['pickup_lon'])
    #         top_n = int(data.get('top_n', 5))

    #         # Get available drivers from database
    #         drivers_list = get_available_drivers()

    #         if not drivers_list:
    #             return jsonify({
    #                 'ok': False,
    #                 'msg': 'No available drivers found',
    #                 'recommended_drivers': []
    #             }), 200

    #         # Convert to DataFrame for ML processing
    #         drivers_df = pd.DataFrame(drivers_list)

    #         # Check if model is trained, if not train it
    #         if recommender.model is None:
    #             print("⚠ Model not found — Training now...")
    #             try:
    #                 result = recommender.train_from_database(db)
    #                 if not result['success']:
    #                     return jsonify({
    #                         "ok": False,
    #                         "msg": f"Model training failed: {result['message']}"
    #                     }), 500
    #             except Exception as train_err:
    #                 return jsonify({
    #                     "ok": False,
    #                     "msg": f"Model training failed automatically: {str(train_err)}"
    #                 }), 500

    #         # Get recommendations from ML model
    #         recommended = DriverRecommender.recommend_drivers(
    #             pickup_lat,
    #             pickup_lon,
    #             drivers_df,
    #             db
    #         )

    #         # Return top N
    #         top_recommendations = recommended[:top_n]

    #         return jsonify({
    #             'ok': True,
    #             'recommended_drivers': top_recommendations,
    #             'count': len(top_recommendations),
    #             'msg': f'Found {len(top_recommendations)} recommended drivers'
    #         }), 200

    #     except Exception as e:
    #         return jsonify({
    #             'ok': False,
    #             'msg': f'Recommendation failed: {str(e)}'
    #         }), 500

    @app.post("/update_acceptance_probability/<int:driver_id>")
    def update_acceptance_endpoint(driver_id):
        """
        Update driver's acceptance probability after a ride decision
        This should be called after a driver accepts or rejects a ride

        Example: POST http://localhost:5000/update_acceptance_probability/1
        """
        try:
            new_probability = recommender.update_driver_acceptance_probability(db, driver_id)

            return jsonify({
                'ok': True,
                'driver_id': driver_id,
                'new_acceptance_probability': round(new_probability, 3),
                'msg': 'Acceptance probability updated'
            }), 200

        except Exception as e:
            return jsonify({
                'ok': False,
                'msg': f'Update failed: {str(e)}'
            }), 500

    @app.get("/model_status")
    def model_status_endpoint():
        """
        Check if ML model is trained and ready

        Example: GET http://localhost:5000/model_status
        """
        try:
            if recommender.model is None:
                return jsonify({
                    'ok': False,
                    'model_trained': False,
                    'msg': 'Model not trained. Use /train_model endpoint to train.'
                }), 200

            return jsonify({
                'ok': True,
                'model_trained': True,
                'num_drivers_tracked': len(recommender.driver_stats),
                'num_features': len(recommender.feature_names),
                'features': recommender.feature_names,
                'msg': 'Model is ready'
            }), 200

        except Exception as e:
            return jsonify({
                'ok': False,
                'msg': str(e)
            }), 500
    
    return app, socketio
    
    

# ---------- run only when file is executed directly ----------
if __name__ == '__main__':
    app, socketio = create_app()
    # create it first
    with app.app_context():     # now app is a real object
        db.create_all()         # create missing tables
    # eventlet.monkey_patch()
    socketio.run(app, host="0.0.0.0", port=5000, debug=True, use_reloader=False)


