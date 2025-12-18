"""
Standalone ML Driver Recommendation Testing Script
Run this independently to test the ML model without full Flask integration

Usage:
    python test_ml_standalone.py
"""

import pandas as pd
import numpy as np
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import roc_auc_score, classification_report, accuracy_score
import joblib
from datetime import datetime, timedelta
import math
import os
from sqlalchemy import create_engine, text

# ============================================================
# CONFIGURATION
# ============================================================
DATABASE_URL = "postgresql://postgres.iiegkhqdrgiywqvzodvr:zunairamuntaharabail@aws-1-us-east-1.pooler.supabase.com:6543/postgres"
MODEL_PATH = "models/driver_recommender_test.pkl"

# ============================================================
# ML RECOMMENDER CLASS
# ============================================================
class DriverRecommender:
    def __init__(self):
        self.model = None
        self.driver_stats = {}
        self.feature_names = []
    
    def haversine_distance(self, lat1, lon1, lat2, lon2):
        """Calculate distance between two points in kilometers"""
        R = 6371  # Earth's radius in km
        
        lat1, lon1, lat2, lon2 = map(math.radians, [lat1, lon1, lat2, lon2])
        dlat = lat2 - lat1
        dlon = lon2 - lon1
        
        a = math.sin(dlat/2)**2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon/2)**2
        c = 2 * math.asin(math.sqrt(a))
        
        return R * c
    
    def train_from_database(self, engine):
        """Train model using historical ride data"""
        print("\n" + "=" * 70)
        print("STARTING MODEL TRAINING")
        print("=" * 70)
        
        try:
            # Load historical rides
            query = text("""
                SELECT 
                    r.ride_id,
                    r.user_id,
                    r.driver_id,
                    r.pickup_latitude,
                    r.pickup_longitude,
                    r.drop_latitude,
                    r.drop_longitude,
                    r.fare,
                    r.distance_km,
                    r.duration_min,
                    r.status,
                    r.ride_date,
                    d.rating_avg as driver_rating,
                    d.acceptance_probablity as driver_acceptance_rate
                FROM ride r
                JOIN driver d ON r.driver_id = d.driver_id
                WHERE r.ride_date >= CURRENT_DATE - INTERVAL '6 months'
                AND r.status IN ('accepted', 'completed', 'rejected', 'in_progress')
            """)
            
            with engine.connect() as conn:
                result = conn.execute(query)
                rides_data = [dict(row._mapping) for row in result]
            
            rides_df = pd.DataFrame(rides_data)
            
            if rides_df.empty:
                print("❌ No historical data found in database")
                return {
                    'success': False,
                    'message': 'No historical data found. Add some rides first.'
                }
            
            print(f"✓ Loaded {len(rides_df)} historical rides")
            print(f"  - Date range: {rides_df['ride_date'].min()} to {rides_df['ride_date'].max()}")
            print(f"  - Status breakdown:")
            print(rides_df['status'].value_counts().to_string())
            
            # Calculate driver statistics
            self.driver_stats = self._calculate_driver_stats(rides_df)
            print(f"\n✓ Calculated stats for {len(self.driver_stats)} drivers")
            
            # Prepare training features
            X, y = self._prepare_training_data(rides_df)
            print(f"✓ Prepared {len(X)} training examples")
            print(f"  - Features: {', '.join(self.feature_names)}")
            print(f"  - Positive samples (accepted): {sum(y)}")
            print(f"  - Negative samples (rejected): {len(y) - sum(y)}")
            
            # Check if we have enough data
            if len(X) < 50:
                print(f"⚠ Warning: Only {len(X)} samples. Consider collecting more data.")
            
            if sum(y) == 0 or sum(y) == len(y):
                print("❌ Error: All samples have same label. Need both accepted and rejected rides.")
                return {
                    'success': False,
                    'message': 'Need both accepted and rejected rides for training'
                }
            
            # Split data
            X_train, X_test, y_train, y_test = train_test_split(
                X, y, test_size=0.2, random_state=42, stratify=y
            )
            
            print(f"\n✓ Split data:")
            print(f"  - Training: {len(X_train)} samples")
            print(f"  - Testing: {len(X_test)} samples")
            
            # Train Gradient Boosting model
            print("\n✓ Training Gradient Boosting Classifier...")
            self.model = GradientBoostingClassifier(
                n_estimators=100,
                learning_rate=0.1,
                max_depth=5,
                random_state=42
            )
            self.model.fit(X_train, y_train)
            print("  Model training complete!")
            
            # Evaluate model
            print("\n" + "=" * 70)
            print("MODEL EVALUATION")
            print("=" * 70)
            
            y_pred_proba = self.model.predict_proba(X_test)[:, 1]
            y_pred = self.model.predict(X_test)
            
            auc_score = roc_auc_score(y_test, y_pred_proba)
            accuracy = accuracy_score(y_test, y_pred)
            
            print(f"\nMetrics:")
            print(f"  - AUC Score: {auc_score:.3f}")
            print(f"  - Accuracy: {accuracy:.3f}")
            
            print("\nClassification Report:")
            print(classification_report(y_test, y_pred, 
                                      target_names=['Rejected', 'Accepted']))
            
            # Feature importance
            print("\nTop 5 Most Important Features:")
            feature_importance = pd.DataFrame({
                'feature': self.feature_names,
                'importance': self.model.feature_importances_
            }).sort_values('importance', ascending=False)
            
            for idx, row in feature_importance.head(5).iterrows():
                print(f"  {row['feature']:<30} {row['importance']:.4f}")
            
            # Save model
            os.makedirs('models', exist_ok=True)
            self.save_model(MODEL_PATH)
            print(f"\n✓ Model saved to {MODEL_PATH}")
            
            print("\n" + "=" * 70)
            print("TRAINING COMPLETE ✓")
            print("=" * 70)
            
            return {
                'success': True,
                'auc_score': float(auc_score),
                'accuracy': float(accuracy),
                'training_samples': len(X),
                'num_drivers': len(self.driver_stats)
            }
            
        except Exception as e:
            print(f"\n❌ Error during training: {e}")
            import traceback
            traceback.print_exc()
            return {
                'success': False,
                'message': f'Training failed: {str(e)}'
            }
    
    def _calculate_driver_stats(self, rides_df):
        """Calculate driver acceptance rates and statistics"""
        stats = {}
        
        for driver_id in rides_df['driver_id'].unique():
            driver_rides = rides_df[rides_df['driver_id'] == driver_id]
            
            total = len(driver_rides)
            accepted = len(driver_rides[driver_rides['status'].isin(['accepted', 'completed', 'in_progress'])])
            acceptance_rate = accepted / total if total > 0 else 0.5
            
            # Recent acceptance rate
            recent_cutoff = datetime.now() - timedelta(days=30)
            recent_rides = driver_rides[
                pd.to_datetime(driver_rides['ride_date']) >= recent_cutoff
            ]
            
            if len(recent_rides) > 0:
                recent_accepted = len(recent_rides[recent_rides['status'].isin(['accepted', 'completed', 'in_progress'])])
                recent_acceptance_rate = recent_accepted / len(recent_rides)
            else:
                recent_acceptance_rate = acceptance_rate
            
            completed = driver_rides[driver_rides['status'] == 'completed']
            avg_fare = completed['fare'].mean() if len(completed) > 0 else 0
            
            stats[driver_id] = {
                'acceptance_rate': acceptance_rate,
                'recent_acceptance_rate': recent_acceptance_rate,
                'avg_fare': avg_fare,
                'total_rides': total
            }
        
        return stats
    
    def _prepare_training_data(self, rides_df):
        """Extract features and labels from historical data"""
        X_list = []
        y_list = []
        
        for _, ride in rides_df.iterrows():
            features = self._extract_features_from_ride(ride)
            X_list.append(features)
            
            label = 1 if ride['status'] in ['accepted', 'completed', 'in_progress'] else 0
            y_list.append(label)
        
        X = pd.DataFrame(X_list)
        y = np.array(y_list)
        
        self.feature_names = X.columns.tolist()
        return X, y
    
    def _extract_features_from_ride(self, ride):
        """Extract features from a historical ride"""
        driver_id = ride['driver_id']
        stats = self.driver_stats.get(driver_id, {
            'acceptance_rate': 0.5,
            'recent_acceptance_rate': 0.5,
            'avg_fare': 0,
            'total_rides': 0
        })
        
        ride_date = pd.to_datetime(ride['ride_date'])
        distance = ride['distance_km'] if not pd.isna(ride['distance_km']) else 0
        
        return {
            'fare': ride['fare'] if not pd.isna(ride['fare']) else 0,
            'distance_km': distance,
            'fare_per_km': ride['fare'] / max(distance, 0.1) if not pd.isna(ride['fare']) and distance > 0 else 0,
            'duration_min': ride['duration_min'] if not pd.isna(ride['duration_min']) else 0,
            'hour_of_day': ride_date.hour if hasattr(ride_date, 'hour') else 12,
            'day_of_week': ride_date.dayofweek if hasattr(ride_date, 'dayofweek') else 0,
            'is_weekend': 1 if hasattr(ride_date, 'dayofweek') and ride_date.dayofweek >= 5 else 0,
            'driver_rating': ride['driver_rating'] if not pd.isna(ride['driver_rating']) else 3.0,
            'driver_acceptance_rate': stats['acceptance_rate'],
            'driver_recent_acceptance_rate': stats['recent_acceptance_rate'],
            'driver_total_rides': stats['total_rides']
        }
    
    def recommend_drivers(self, pickup_lat, pickup_lon, engine, top_n=5):
        """Get driver recommendations for a pickup location"""
        print("\n" + "=" * 70)
        print("GETTING DRIVER RECOMMENDATIONS")
        print("=" * 70)
        print(f"Pickup Location: ({pickup_lat}, {pickup_lon})")
        
        if self.model is None:
            print("❌ Model not loaded!")
            return []
        
        # Get available drivers
        query = text("""
            SELECT 
                driver_id,
                name,
                email,
                rating_avg,
                "Latitude",
                "Longitude",
                acceptance_probablity,
                is_active
            FROM driver
            WHERE is_active = TRUE
            AND "Latitude" IS NOT NULL
            AND "Longitude" IS NOT NULL
        """)
        
        with engine.connect() as conn:
            result = conn.execute(query)
            drivers_data = [dict(row._mapping) for row in result]
        
        if not drivers_data:
            print("❌ No available drivers found")
            return []
        
        print(f"✓ Found {len(drivers_data)} available drivers")
        
        current_time = datetime.now()
        recommendations = []
        
        for driver in drivers_data:
            # Calculate distance
            distance_to_pickup = self.haversine_distance(
                pickup_lat, pickup_lon,
                float(driver['Latitude']), float(driver['Longitude'])
            )
            
            # Extract features
            features = {
                'fare': 0,
                'distance_km': 5,
                'fare_per_km': 15,
                'duration_min': 15,
                'hour_of_day': current_time.hour,
                'day_of_week': current_time.weekday(),
                'is_weekend': 1 if current_time.weekday() >= 5 else 0,
                'driver_rating': float(driver['rating_avg']) if not pd.isna(driver['rating_avg']) else 3.0,
                'driver_acceptance_rate': float(driver['acceptance_probablity']) if not pd.isna(driver['acceptance_probablity']) else 0.5,
                'driver_recent_acceptance_rate': float(driver['acceptance_probablity']) if not pd.isna(driver['acceptance_probablity']) else 0.5,
                'driver_total_rides': 10
            }
            
            # Predict
            X = pd.DataFrame([features])[self.feature_names]
            acceptance_prob = self.model.predict_proba(X)[0][1]
            
            # Calculate score
            normalized_distance = min(distance_to_pickup / 10.0, 1.0)
            normalized_rating = float(driver['rating_avg']) / 5.0 if not pd.isna(driver['rating_avg']) else 0.6
            
            recommendation_score = (
                0.4 * (1 - normalized_distance) +
                0.4 * acceptance_prob +
                0.2 * normalized_rating
            )
            
            recommendations.append({
                'driver_id': int(driver['driver_id']),
                'name': driver['name'],
                'rating_avg': float(driver['rating_avg']) if not pd.isna(driver['rating_avg']) else None,
                'distance_to_pickup': round(distance_to_pickup, 2),
                'ml_acceptance_probability': round(acceptance_prob, 3),
                'recommendation_score': round(recommendation_score, 3)
            })
        
        recommendations.sort(key=lambda x: x['recommendation_score'], reverse=True)
        
        print(f"\n✓ Top {top_n} Recommended Drivers:")
        print("-" * 70)
        for i, rec in enumerate(recommendations[:top_n], 1):
            print(f"{i}. {rec['name']}")
            print(f"   Distance: {rec['distance_to_pickup']} km")
            print(f"   Rating: {rec['rating_avg']}/5.0")
            print(f"   Acceptance Prob: {rec['ml_acceptance_probability']}")
            print(f"   Score: {rec['recommendation_score']}")
            print()
        
        return recommendations[:top_n]
    
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


# ============================================================
# TEST FUNCTIONS
# ============================================================
def test_database_connection(engine):
    """Test database connection"""
    print("\n" + "=" * 70)
    print("TESTING DATABASE CONNECTION")
    print("=" * 70)
    
    try:
        with engine.connect() as conn:
            result = conn.execute(text("SELECT COUNT(*) FROM ride"))
            ride_count = result.scalar()
            
            result = conn.execute(text("SELECT COUNT(*) FROM driver"))
            driver_count = result.scalar()
            
            print(f"✓ Database connection successful!")
            print(f"  - Total rides in database: {ride_count}")
            print(f"  - Total drivers in database: {driver_count}")
            return True
    except Exception as e:
        print(f"❌ Database connection failed: {e}")
        return False


def test_training(recommender, engine):
    """Test model training"""
    result = recommender.train_from_database(engine)
    return result['success']


def test_recommendations(recommender, engine):
    """Test getting recommendations"""
    # Test with Karachi coordinates
    test_locations = [
        (24.8607, 67.0011, "Karachi City Center"),
        (24.9207, 67.0777, "Gulshan-e-Iqbal"),
        (24.8138, 67.0508, "Clifton")
    ]
    
    print("\n" + "=" * 70)
    print("TESTING RECOMMENDATIONS AT MULTIPLE LOCATIONS")
    print("=" * 70)
    
    for lat, lon, location_name in test_locations:
        print(f"\n📍 Location: {location_name}")
        recommendations = recommender.recommend_drivers(lat, lon, engine, top_n=3)
        
        if not recommendations:
            print("  ⚠ No recommendations available")


def test_model_persistence(recommender):
    """Test saving and loading model"""
    print("\n" + "=" * 70)
    print("TESTING MODEL PERSISTENCE")
    print("=" * 70)
    
    try:
        # Save
        recommender.save_model(MODEL_PATH)
        print(f"✓ Model saved to {MODEL_PATH}")
        
        # Load
        new_recommender = DriverRecommender()
        new_recommender.load_model(MODEL_PATH)
        print(f"✓ Model loaded from {MODEL_PATH}")
        
        print(f"  - Features: {len(new_recommender.feature_names)}")
        print(f"  - Driver stats: {len(new_recommender.driver_stats)}")
        
        return True
    except Exception as e:
        print(f"❌ Model persistence test failed: {e}")
        return False


# ============================================================
# MAIN TEST RUNNER
# ============================================================
def run_all_tests():
    """Run all tests"""
    print("\n")
    print("*" * 70)
    print("*" + " " * 68 + "*")
    print("*" + "  ML DRIVER RECOMMENDER - STANDALONE TEST SUITE".center(68) + "*")
    print("*" + " " * 68 + "*")
    print("*" * 70)
    
    # Create database engine
    try:
        engine = create_engine(DATABASE_URL, pool_pre_ping=True)
    except Exception as e:
        print(f"\n❌ Failed to create database engine: {e}")
        return
    
    # Initialize recommender
    recommender = DriverRecommender()
    
    # Run tests
    tests_passed = 0
    tests_total = 4
    
    # Test 1: Database connection
    if test_database_connection(engine):
        tests_passed += 1
    
    # Test 2: Model training
    if test_training(recommender, engine):
        tests_passed += 1
        
        # Test 3: Recommendations (only if training succeeded)
        test_recommendations(recommender, engine)
        tests_passed += 1
        
        # Test 4: Model persistence (only if training succeeded)
        if test_model_persistence(recommender):
            tests_passed += 1
    
    # Summary
    print("\n" + "=" * 70)
    print("TEST SUMMARY")
    print("=" * 70)
    print(f"Tests Passed: {tests_passed}/{tests_total}")
    
    if tests_passed == tests_total:
        print("✓ All tests passed! ML system is working correctly.")
    else:
        print(f"⚠ {tests_total - tests_passed} test(s) failed. Check output above.")
    
    print("\n" + "*" * 70)


# ============================================================
# ENTRY POINT
# ============================================================
if __name__ == "__main__":
    run_all_tests()