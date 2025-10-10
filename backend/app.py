import os
from flask import Flask, jsonify, request
from flask_socketio import SocketIO, emit 
from dotenv import load_dotenv
from models import db
from db import drivers_from_ride, get_non_active, book_ride_proc


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