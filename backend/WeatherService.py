import os
import requests
from typing import Dict, Tuple
from datetime import datetime

class WeatherService:
    """
    Service to check real-time weather conditions and determine safety for rides.
    Uses OpenWeatherMap API (free tier available).
    """
    
    def __init__(self, api_key: str):
        self.api_key = api_key
        self.base_url = "https://api.openweathermap.org/data/2.5/weather"
        
        # Define unsafe weather thresholds
        self.unsafe_conditions = {
            'Thunderstorm': 'severe',
            'Tornado': 'severe',
            'Squall': 'severe',
            'Ash': 'severe',
            'Dust': 'moderate',
            'Sand': 'moderate',
            'Fog': 'moderate',
            'Smoke': 'moderate',
            'Haze': 'mild'
        }
        
        # Wind speed threshold (m/s) - 15 m/s = ~54 km/h
        self.max_safe_wind_speed = 15
        
        # Rain intensity thresholds (mm/h)
        self.heavy_rain_threshold = 7.6
        
        # Visibility threshold (meters)
        self.min_safe_visibility = 1000
    
    def get_weather(self, lat: float, lon: float) -> Dict:
        """
        Fetch current weather data for given coordinates.
        
        Args:
            lat: Latitude
            lon: Longitude
            
        Returns:
            Dict containing weather data
        """
        try:
            params = {
                'lat': lat,
                'lon': lon,
                'appid': self.api_key,
                'units': 'metric'  # Use Celsius
            }
            
            response = requests.get(self.base_url, params=params, timeout=5)
            response.raise_for_status()
            return response.json()
            
        except requests.exceptions.RequestException as e:
            print(f"Weather API error: {e}")
            return None
    
    def check_weather_safety(self, lat: float, lon: float) -> Tuple[bool, str, Dict]:
        """
        Check if weather conditions are safe for a ride.
        
        Args:
            lat: Latitude
            lon: Longitude
            
        Returns:
            Tuple of (is_safe: bool, alert_message: str, weather_details: dict)
        """
        weather_data = self.get_weather(lat, lon)
        
        if not weather_data:
            # If weather API fails, allow ride but warn user
            return True, "Unable to fetch weather data. Please check conditions manually.", {}
        
        # Extract relevant data
        main_weather = weather_data.get('weather', [{}])[0].get('main', '')
        description = weather_data.get('weather', [{}])[0].get('description', '')
        wind_speed = weather_data.get('wind', {}).get('speed', 0)
        visibility = weather_data.get('visibility', 10000)  # Default 10km
        rain = weather_data.get('rain', {}).get('1h', 0)  # Rain in last hour
        
        weather_details = {
            'condition': main_weather,
            'description': description,
            'wind_speed_ms': wind_speed,
            'wind_speed_kmh': round(wind_speed * 3.6, 1),
            'visibility_m': visibility,
            'rain_mm': rain,
            'temperature': weather_data.get('main', {}).get('temp'),
            'timestamp': datetime.now().isoformat()
        }
        
        alerts = []
        severity = 'safe'
        
        # Check for severe weather conditions
        if main_weather in self.unsafe_conditions:
            condition_severity = self.unsafe_conditions[main_weather]
            
            if condition_severity == 'severe':
                alerts.append(f"⚠️ SEVERE WEATHER ALERT: {description.title()}")
                severity = 'severe'
            elif condition_severity == 'moderate':
                alerts.append(f"⚠️ Weather Advisory: {description.title()}")
                severity = 'moderate' if severity != 'severe' else severity
            else:
                alerts.append(f"Weather Notice: {description.title()}")
                severity = 'mild' if severity == 'safe' else severity
        
        # Check wind speed
        if wind_speed > self.max_safe_wind_speed:
            alerts.append(f"⚠️ High Winds: {round(wind_speed * 3.6, 1)} km/h (Unsafe for riding)")
            severity = 'severe' if severity != 'severe' else severity
        elif wind_speed > 10:
            alerts.append(f"⚠️ Moderate Winds: {round(wind_speed * 3.6, 1)} km/h")
            severity = 'moderate' if severity == 'safe' else severity
        
        # Check visibility
        if visibility < self.min_safe_visibility:
            alerts.append(f"⚠️ Low Visibility: {visibility}m (Reduced visibility)")
            severity = 'moderate' if severity == 'safe' else severity
        
        # Check rain intensity
        if rain > self.heavy_rain_threshold:
            alerts.append(f"⚠️ Heavy Rain: {rain}mm/h (Road conditions may be hazardous)")
            severity = 'severe' if severity != 'severe' else severity
        elif rain > 2.5:
            alerts.append(f"⚠️ Moderate Rain: {rain}mm/h")
            severity = 'moderate' if severity == 'safe' else severity
        
        # Determine if ride should be blocked
        is_safe = severity != 'severe'
        
        if alerts:
            alert_message = "\n".join(alerts)
            if not is_safe:
                alert_message += "\n\n🚫 For your safety, rides are currently restricted due to dangerous weather conditions."
            else:
                alert_message += "\n\n⚠️ Please exercise caution if you proceed with this ride."
        else:
            alert_message = "✅ Weather conditions are favorable for your ride."
        
        weather_details['severity'] = severity
        weather_details['is_safe'] = is_safe
        
        return is_safe, alert_message, weather_details
    
    def get_weather_summary(self, weather_details: Dict) -> str:
        """
        Generate a short weather summary for display.
        """
        if not weather_details:
            return "Weather data unavailable"
        
        temp = weather_details.get('temperature', 'N/A')
        condition = weather_details.get('description', 'Unknown')
        wind = weather_details.get('wind_speed_kmh', 'N/A')
        
        return f"{condition.title()} • {temp}°C • Wind: {wind} km/h"