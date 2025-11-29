from WeatherService import WeatherService


svc = WeatherService("bb513ddd9bd24387ac6182658252911")
safe, message, info = svc.check_weather_safety(24.8607, 67.0011)

print(message)
print(info)
print(svc.get_weather_summary(info))
