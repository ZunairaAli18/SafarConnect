import os
import requests
import folium
from fare_calculator import FareCalculator

class RouteService:
    def __init__(self, api_key=None):
        self.api_key = api_key or os.getenv("ORS_API_KEY","eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6ImEwOWY2YjhjNTcwOTQwMzZhZTM1YzJhYmNmYWFiOWY4IiwiaCI6Im11cm11cjY0In0=")
        self.base_url = "https://api.openrouteservice.org/v2/directions/driving-car"

    def get_route(self, start, end):
        """
        start/end: (lon, lat)
        returns (distance_km, duration_min, coordinates)
        """
        headers = {"Authorization": self.api_key}
        params = {"start": f"{start[0]},{start[1]}", "end": f"{end[0]},{end[1]}"}
        r = requests.get(self.base_url, headers=headers, params=params, timeout=10)
        r.raise_for_status()
        data = r.json()

        seg = data["features"][0]["properties"]["segments"][0]
        coords = data["features"][0]["geometry"]["coordinates"]

        distance_km = seg["distance"] / 1000
        duration_min = seg["duration"] / 60
        return distance_km, duration_min, coords


# if __name__ == "__main__":
#     # Example coordinates (Berlin to Munich)
#     start = (13.4050, 52.5200)  # Berlin (lon, lat)
#     end = (11.5820, 48.1351)    # Munich (lon, lat)

#     service = RouteService(api_key="eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6ImEwOWY2YjhjNTcwOTQwMzZhZTM1YzJhYmNmYWFiOWY4IiwiaCI6Im11cm11cjY0In0=")

#     try:
#         distance, duration, coords = service.get_route(start, end)
#         print(f"Distance: {distance:.2f} km")
#         print(f"Duration: {duration:.2f} min")

#         calculator = FareCalculator(base=100, per_km=30, per_min=2, surge=1.2)
#         fare = calculator.compute(distance, duration)
#         print(f"Estimated Fare: Rs {fare}")


#         # Convert coordinates from (lon, lat) to (lat, lon)
#         coords_latlon = [(lat, lon) for lon, lat in coords]

#         # Create map centered at the start point
#         m = folium.Map(location=[start[1], start[0]], zoom_start=6)

#         # Add route line
#         folium.PolyLine(coords_latlon, color="blue", weight=5, opacity=0.7).add_to(m)

#         # Add start and end markers
#         folium.Marker([start[1], start[0]], popup="Start (Berlin)", icon=folium.Icon(color="green")).add_to(m)
#         folium.Marker([end[1], end[0]], popup="End (Munich)", icon=folium.Icon(color="red")).add_to(m)

#         # Save map to HTML and open in browser
#         m.save("route_map.html")
#         print("✅ Route map saved as 'route_map.html'")

#     except Exception as e:
#         print("❌ Error fetching route:", e)
