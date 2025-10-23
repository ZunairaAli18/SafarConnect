from flask_sqlalchemy import SQLAlchemy
db = SQLAlchemy()

class Driver(db.Model):
    __tablename__ = 'driver'
    driver_id   = db.Column(db.Integer, primary_key=True)
    name        = db.Column(db.String(50), nullable=False)
    email       = db.Column(db.String(50), unique=True, nullable=False)
    password    = db.Column(db.String(255), nullable=False)
    license_no  = db.Column(db.String(20), unique=True, nullable=False)
    rating_avg  = db.Column(db.Float, default=0.0)

class User(db.Model):
    __tablename__ = 'user'
    user_id = db.Column(db.Integer, primary_key=True)
    name    = db.Column(db.String(50))
    email   = db.Column(db.String(50), nullable=False)
    phone   = db.Column(db.String(20))
    type    = db.Column(db.String(10))

class Ride(db.Model):
    __tablename__ = 'ride'
    ride_id    = db.Column(db.Integer, primary_key=True)
    pickup     = db.Column(db.String(150))
    drop       = db.Column(db.String(150))
    ride_date  = db.Column(db.Date)
    fare       = db.Column(db.Numeric(10,2))
    driver_id  = db.Column(db.Integer, db.ForeignKey('driver.driver_id'), nullable=False)
    user_id    = db.Column(db.Integer, db.ForeignKey('user.user_id'),   nullable=False)

class Payment(db.Model):
    __tablename__ = 'payment'
    payment_id = db.Column(db.Integer, primary_key=True)
    amount     = db.Column(db.Numeric(10,2))
    method     = db.Column(db.String(20))
    status     = db.Column(db.String(15))
    ride_id    = db.Column(db.Integer, db.ForeignKey('ride.ride_id'), unique=True, nullable=False)

class Rating(db.Model):
    __tablename__ = 'rating'
    rating_id = db.Column(db.Integer, primary_key=True)
    score     = db.Column(db.Float)
    comment   = db.Column(db.String(100))
    ride_id   = db.Column(db.Integer, db.ForeignKey('ride.ride_id'), unique=True, nullable=False)

class Vehicle(db.Model):
    __tablename__ = 'vehicle'
    vehicle_id = db.Column(db.Integer, primary_key=True)
    vehicle_no = db.Column(db.String(10))
    type       = db.Column(db.String(20))
    driver_id  = db.Column(db.Integer, db.ForeignKey('driver.driver_id'), unique=True, nullable=False)