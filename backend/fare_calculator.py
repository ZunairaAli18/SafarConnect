class FareCalculator:
    def __init__(self, base=100, per_km=30, per_min=2, surge=1.0):
        self.base, self.per_km, self.per_min, self.surge = base, per_km, per_min, surge

    def compute(self, distance_km, duration_min):
        fare = (self.base + self.per_km*distance_km + self.per_min*duration_min) * self.surge
        return round(fare, 2)
