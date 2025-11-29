import requests
from typing import Dict, Tuple
from datetime import datetime

class WeatherService:
    """
    Service to check real-time weather conditions and determine safety for rides.
    Uses WeatherAPI.com for accurate real-time weather.
    """

    def __init__(self, api_key: str):
        self.api_key = api_key
        self.base_url = "https://api.weatherapi.com/v1/current.json"

        # Safety thresholds
        self.max_safe_wind_kph = 40      # Above 40 km/h → unsafe
        self.moderate_wind_kph = 25      # 25–40 km/h → advisory
        self.low_visibility_km = 1.5     # Below 1.5 km → unsafe
        self.heavy_rain_mm = 8           # Above 8 mm → unsafe

        # Severe weather conditions
        self.severe_conditions = [
            "Thunderstorm", "Tornado", "Blizzard", "Ice Pellets", "Freezing Rain", "Heavy Rain"
        ]

        # Mild advisory
        self.mild_conditions = [
            "Haze", "Fog", "Mist", "Smoke", "Dust"
        ]

    def get_weather(self, lat: float, lon: float) -> Dict:
        """
        Fetch current weather data for given coordinates.
        """
        try:
            params = {
                "key": self.api_key,
                "q": f"{lat},{lon}",
                "aqi": "no"
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
        Returns: is_safe (bool), alert_message (str), weather_details (dict)
        """
        weather_data = self.get_weather(lat, lon)
        if not weather_data:
            return True, "⚠️ Unable to fetch weather data. Please check conditions manually.", {}

        current = weather_data["current"]
        main_weather = current["condition"]["text"]
        wind_kph = current.get("wind_kph", 0)
        visibility_km = current.get("vis_km", 10)
        rain_mm = current.get("precip_mm", 0)
        temp_c = current.get("temp_c", 0)

        weather_details = {
            "condition": main_weather,
            "temperature": temp_c,
            "wind_kph": wind_kph,
            "visibility_km": visibility_km,
            "rain_mm": rain_mm,
            "timestamp": datetime.now().isoformat()
        }

        alerts = []
        severity = "safe"

        # Severe conditions
        if main_weather in self.severe_conditions:
            alerts.append(f"⚠️ SEVERE WEATHER ALERT: {main_weather}")
            severity = "severe"

        # Mild advisory
        if main_weather in self.mild_conditions:
            alerts.append(f"⚠️ Weather Advisory: {main_weather}")

        # Wind checks
        if wind_kph > self.max_safe_wind_kph:
            alerts.append(f"⚠️ High Winds: {wind_kph} km/h (Unsafe for riding)")
            severity = "severe"
        elif wind_kph > self.moderate_wind_kph:
            alerts.append(f"⚠️ Moderate Winds: {wind_kph} km/h")
            if severity == "safe":
                severity = "moderate"

        # Visibility check
        if visibility_km < self.low_visibility_km:
            alerts.append(f"⚠️ Low Visibility: {visibility_km} km (Reduced visibility)")
            if severity == "safe":
                severity = "moderate"

        # Rain check
        if rain_mm > self.heavy_rain_mm:
            alerts.append(f"⚠️ Heavy Rain: {rain_mm} mm (Road conditions may be hazardous)")
            severity = "severe"
        elif rain_mm > 2:
            alerts.append(f"⚠️ Moderate Rain: {rain_mm} mm")
            if severity == "safe":
                severity = "moderate"

        # Determine ride safety
        is_safe = severity != "severe"

        if alerts:
            alert_message = "\n".join(alerts)
            if not is_safe:
                alert_message += "\n\n🚫 For your safety, rides are currently restricted due to dangerous weather conditions."
            else:
                alert_message += "\n\n⚠️ Please exercise caution if you proceed with this ride."
        else:
            alert_message = "✅ Weather conditions are favorable for your ride."

        weather_details["severity"] = severity
        weather_details["is_safe"] = is_safe

        return is_safe, alert_message, weather_details

    def get_weather_summary(self, weather_details: Dict) -> str:
        """
        Generate a short weather summary for display.
        """
        if not weather_details:
            return "Weather data unavailable"

        temp = weather_details.get("temperature", "N/A")
        condition = weather_details.get("condition", "Unknown")
        wind = weather_details.get("wind_kph", "N/A")

        return f"{condition} • {temp}°C • Wind: {wind} km/h"
