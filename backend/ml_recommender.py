"""
ML-Based Driver Recommendation System
Adapted for PostgreSQL/Supabase with Flask-SQLAlchemy
"""

import pandas as pd
import numpy as np
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.model_selection import train_test_split
import joblib
import math
from datetime import datetime
import os


class DriverRecommender:
    def __init__(self):
      self.model = None
      self.driver_stats = {}
      self.feature_names = []

      model_path = os.path.join("models", "driver_recommender.pkl")

    # Auto-load model if exists
      if os.path.exists(model_path):
        try:
            self.load_model(model_path)
            print("✓ ML Model Loaded Successfully")
        except Exception as e:
            print("⚠ Model file corrupted — retraining required.")
            self.model = None
      else:
        print("⚠ No model found. It will be trained automatically on first request.")

    def ensure_model_trained(self, db):
      """Automatically train the model if missing."""
      if self.model is None:
        print("⚠ Model not trained — training now...")
        result = self.train_from_database(db)

        if not result["success"]:
            print("❌ Auto-training failed:", result["message"])
            return False

        print("✓ Model trained automatically.")
        return True

      return True

    def haversine_distance(self, lat1, lon1, lat2, lon2):
        """Calculate distance between two points in kilometers"""
        R = 6371  # Earth's radius in km

        lat1, lon1, lat2, lon2 = map(math.radians, [lat1, lon1, lat2, lon2])
        dlat = lat2 - lat1
        dlon = lon2 - lon1

        a = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
        c = 2 * math.asin(math.sqrt(a))

        return R * c

    def train_from_database(self, db):
        """Train model using historical ride data from PostgreSQL"""
        print("=" * 60)
        print("TRAINING ML MODEL FROM DATABASE")
        print("=" * 60)

        from models import Ride, Driver

        # Load rides with accepted/rejected/completed status
        rides = db.session.query(
            Ride.ride_id,
            Ride.user_id,
            Ride.driver_id,
            Ride.pickup_latitude,
            Ride.pickup_longitude,
            Ride.drop_latitude,
            Ride.drop_longitude,
            Ride.fare,
            Ride.distance_km,
            Ride.status,
            Ride.ride_date,
            Driver.rating_avg.label('driver_rating')
        ).join(Driver, Ride.driver_id == Driver.driver_id) \
            .filter(Ride.status.in_(['accepted', 'rejected', 'completed', 'cancelled'])) \
            .filter(Ride.driver_id.isnot(None)) \
            .all()

        if not rides or len(rides) < 3:
            return {
                'success': False,
                'message': f'Insufficient training data. Need at least 10 rides with driver assignments, found {len(rides) if rides else 0}'
            }

        # Convert to DataFrame
        rides_df = pd.DataFrame([{
            'ride_id': r.ride_id,
            'user_id': r.user_id,
            'driver_id': r.driver_id,
            'pickup_latitude': r.pickup_latitude,
            'pickup_longitude': r.pickup_longitude,
            'drop_latitude': r.drop_latitude,
            'drop_longitude': r.drop_longitude,
            'fare': float(r.fare) if r.fare else 0,
            'distance_km': r.distance_km or 0,
            'status': r.status,
            'ride_date': r.ride_date,
            'driver_rating': r.driver_rating or 3.0
        } for r in rides])

        print(f"✓ Loaded {len(rides_df)} historical rides")

        # Calculate driver statistics
        self.driver_stats = self._calculate_driver_stats(rides_df)
        print(f"✓ Calculated stats for {len(self.driver_stats)} drivers")

        # Prepare training data
        X, y = self._prepare_training_data(rides_df)
        print(f"✓ Prepared {len(X)} training examples")

        if len(X) < 3:
            return {
                'success': False,
                'message': 'Not enough valid training examples'
            }

        # Split data
        test_size = 0.0 if len(X) < 5 else min(0.2, 5 / len(X)) # At least 5 samples for test, or 20%
        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=test_size, random_state=42
        )

        # Train model
        print("✓ Training Gradient Boosting model...")
        self.model = GradientBoostingClassifier(
            n_estimators=50,
            learning_rate=0.1,
            max_depth=3,
            random_state=42
        )
        self.model.fit(X_train, y_train)

        # Calculate accuracy
        train_acc = self.model.score(X_train, y_train)
        test_acc = self.model.score(X_test, y_test) if len(X_test) > 0 else train_acc

        print(f"\n{'=' * 60}")
        print(f"MODEL PERFORMANCE:")
        print(f"{'=' * 60}")
        print(f"Training Accuracy: {train_acc:.3f}")
        print(f"Test Accuracy: {test_acc:.3f}")
        print(f"Total samples: {len(X)}")

        # Save model
        os.makedirs('models', exist_ok=True)
        self.save_model('models/driver_recommender.pkl')
        print(f"\n✓ Model saved to models/driver_recommender.pkl")

        return {
            'success': True,
            'train_accuracy': float(train_acc),
            'test_accuracy': float(test_acc),
            'training_samples': len(X),
            'num_drivers': len(self.driver_stats)
        }

    def _calculate_driver_stats(self, rides_df):
        """Calculate driver acceptance rates"""
        stats = {}

        for driver_id in rides_df['driver_id'].unique():
            driver_rides = rides_df[rides_df['driver_id'] == driver_id]

            total = len(driver_rides)
            # Count accepted and completed as positive
            accepted = len(driver_rides[driver_rides['status'].isin(['accepted', 'completed'])])
            acceptance_rate = accepted / total if total > 0 else 0.5

            # Average fare
            avg_fare = driver_rides['fare'].mean()

            stats[driver_id] = {
                'acceptance_rate': acceptance_rate,
                'total_rides': total,
                'avg_fare': avg_fare
            }

        return stats

    def _prepare_training_data(self, rides_df):
        """Extract features and labels"""
        X_list = []
        y_list = []

        for _, ride in rides_df.iterrows():
            # Skip if missing critical data
            if pd.isna(ride['pickup_latitude']) or pd.isna(ride['pickup_longitude']):
                continue

            features = self._extract_features_from_ride(ride)
            X_list.append(features)

            # Label: 1 if accepted/completed, 0 if rejected/cancelled
            label = 1 if ride['status'] in ['accepted', 'completed'] else 0
            y_list.append(label)

        X = pd.DataFrame(X_list)
        y = np.array(y_list)

        self.feature_names = X.columns.tolist()
        return X, y

    def _extract_features_from_ride(self, ride):
        """Extract features from a ride record"""
        driver_id = ride['driver_id']
        stats = self.driver_stats.get(driver_id, {
            'acceptance_rate': 0.5,
            'total_rides': 0,
            'avg_fare': 0
        })

        # Calculate distance if not available
        distance = ride['distance_km']
        if distance == 0 or pd.isna(distance):
            if not pd.isna(ride['drop_latitude']) and not pd.isna(ride['drop_longitude']):
                distance = self.haversine_distance(
                    ride['pickup_latitude'], ride['pickup_longitude'],
                    ride['drop_latitude'], ride['drop_longitude']
                )

        fare = ride['fare'] if ride['fare'] > 0 else 100

        return {
            'fare': fare,
            'distance_km': distance,
            'fare_per_km': fare / max(distance, 0.1),
            'driver_rating': ride['driver_rating'],
            'driver_acceptance_rate': stats['acceptance_rate'],
            'driver_total_rides': stats['total_rides']
        }

    # Replace the recommend_drivers method in your ml_recommender.py

    def recommend_drivers(self, pickup_lat, pickup_lon, available_drivers_df, db=None):
        """
        Recommend drivers based on ML predictions
        """
        if self.model is None:
            if db is not None:
                trained = self.ensure_model_trained(db)
                if not trained:
                    print("❌ Cannot recommend drivers — model cannot be trained yet")
                    return []
            else:
                print("❌ Model not trained and no database connection provided")
                return []

        if available_drivers_df.empty:
            print("⚠ No drivers in DataFrame")
            return []

        # ✅ FIX: Use correct column names (case-sensitive)
        available_drivers_df['distance_to_pickup'] = available_drivers_df.apply(
            lambda row: self.haversine_distance(
                pickup_lat, pickup_lon,
                row['Latitude'], row['Longitude']  # ✅ Capital L
            ), axis=1
        )

        print(f"✓ Calculated distances for {len(available_drivers_df)} drivers")

        # Prepare features for prediction
        features_list = []
        for _, driver in available_drivers_df.iterrows():
            driver_id = driver['driver_id']
            stats = self.driver_stats.get(driver_id, {
                'acceptance_rate': driver.get('acceptance_probablity', 0.5),
                'total_rides': 10,
                'avg_fare': 200
            })

            # Estimate fare based on distance
            estimated_distance = driver['distance_to_pickup'] * 2
            estimated_fare = 50 + (estimated_distance * 15)

            features = {
                'fare': estimated_fare,
                'distance_km': estimated_distance,
                'fare_per_km': estimated_fare / max(estimated_distance, 0.1),
                'driver_rating': driver['rating_avg'] or 3.0,
                'driver_acceptance_rate': stats['acceptance_rate'],
                'driver_total_rides': stats['total_rides']
            }
            features_list.append(features)

        # Create feature DataFrame
        X = pd.DataFrame(features_list)[self.feature_names]
        if X.empty:
            print("⚠ No features generated")
            return []

        # Predict acceptance probability
        acceptance_probs = self.model.predict_proba(X)[:, 1]

        print(f"✓ Predicted acceptance probabilities: {acceptance_probs[:3]}")

        # Calculate final score
        max_distance = available_drivers_df['distance_to_pickup'].max()
        if max_distance == 0:
            max_distance = 1

        normalized_distance = 1 - (available_drivers_df['distance_to_pickup'] / max_distance)
        normalized_rating = available_drivers_df['rating_avg'].fillna(3.0) / 5.0

        final_scores = (
                0.3 * normalized_distance +
                0.4 * acceptance_probs +
                0.3 * normalized_rating
        )

        # Add results to dataframe
        available_drivers_df['ml_acceptance_probability'] = acceptance_probs
        available_drivers_df['recommendation_score'] = final_scores

        # ✅ ADD vehicle info to results
        available_drivers_df['vehicle_type'] = available_drivers_df.get('vehicle_type', 'Unknown')
        available_drivers_df['vehicle_number'] = available_drivers_df.get('vehicle_number', 'N/A')

        # Sort by score
        recommended = available_drivers_df.sort_values('recommendation_score', ascending=False)

        print(f"✓ Top 3 scores: {recommended['recommendation_score'].head(3).tolist()}")

        return recommended[[
            'driver_id', 'name', 'rating_avg', 'distance_to_pickup',
            'ml_acceptance_probability', 'recommendation_score',
            'vehicle_type', 'vehicle_number'
        ]].to_dict('records')

    def update_driver_acceptance_probability(self, db, driver_id):
        """
        Update driver's acceptance probability after a ride decision
        This is called after accept/reject to update the DB
        """
        from models import Ride, Driver
        from sqlalchemy import func

        # Get driver's ride history
        rides = db.session.query(Ride).filter(
            Ride.driver_id == driver_id,
            Ride.status.in_(['accepted', 'completed', 'rejected', 'cancelled'])
        ).all()

        if len(rides) == 0:
            return 0.5  # Default

        # Calculate acceptance rate
        accepted = sum(1 for r in rides if r.status in ['accepted', 'completed'])
        acceptance_rate = accepted / len(rides)

        # Update in database
        driver = db.session.query(Driver).filter(Driver.driver_id == driver_id).first()
        if driver:
            # Use raw SQL to update the column with correct capitalization
            from sqlalchemy import text
            db.session.execute(
                text('UPDATE driver SET acceptance_probablity = :rate WHERE driver_id = :did'),
                {'rate': acceptance_rate, 'did': driver_id}
            )
            db.session.commit()

        return acceptance_rate

    def save_model(self, filepath):
        """Save model to disk"""
        joblib.dump({
            'model': self.model,
            'driver_stats': self.driver_stats,
            'feature_names': self.feature_names
        }, filepath)

    def load_model(self, filepath):
        """Load model from disk"""
        data = joblib.load(filepath)
        self.model = data['model']
        self.driver_stats = data['driver_stats']
        self.feature_names = data['feature_names']
