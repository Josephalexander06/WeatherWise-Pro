from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import httpx
import os
from dotenv import load_dotenv
from datetime import datetime, timedelta
import json
import asyncio
import math
from typing import Dict, List, Set, Tuple
from dataclasses import dataclass
from collections import defaultdict
import time
from functools import lru_cache

load_dotenv()

app = FastAPI()

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Performance monitoring middleware
@app.middleware("http")
async def add_process_time_header(request, call_next):
    start_time = time.time()
    response = await call_next(request)
    process_time = time.time() - start_time
    response.headers["X-Process-Time"] = str(process_time)
    
    # Log slow requests
    if process_time > 1.0:
        print(f"SLOW REQUEST: {request.method} {request.url} - {process_time:.2f}s")
    
    return response
class LocationSearchRequest(BaseModel):
    query: str
    
    # Allow extra fields to prevent 422 errors
    class Config:
        extra = 'ignore'

class WeatherRequest(BaseModel):
    temperature: float
    windSpeed: float
    precipitation: float
    humidity: float
    uvIndex: float
    activityName: str
    locationName: str
    locationCountry: str
    
    class Config:
        extra = 'ignore'

class ForecastDay(BaseModel):
    date: str
    temperature: float
    condition: str
    precipitation: float
    windSpeed: float
    humidity: float
    
    class Config:
        extra = 'ignore'

class ForecastInsightRequest(BaseModel):
    locationName: str
    locationCountry: str
    forecast: List[ForecastDay]
    
    class Config:
        extra = 'ignore'

class LocationWeatherRequest(BaseModel):
    lat: float
    lon: float
    locationName: str
    locationCountry: str
    startDate: str
    endDate: str
    
    class Config:
        extra = 'ignore'

class ActivityPlacesRequest(BaseModel):
    lat: float
    lon: float
    activity: str
    locationName: str
    
    class Config:
        extra = 'ignore'

class PlaceSearchRequest(BaseModel):
    lat: float
    lon: float
    activity: str
    locationName: str
    
    # Add optional fields that frontend might send
    locationCountry: Optional[str] = None
    startDate: Optional[str] = None
    endDate: Optional[str] = None
    
    class Config:
        extra = 'ignore'

class BulkLoadRequest(BaseModel):
    places: List[dict]
    
    class Config:
        extra = 'ignore'
# Free APIs - No API keys required
OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"
GEOCODING_API_URL = "https://geocoding-api.open-meteo.com/v1/search"

ACTIVITY_SEARCH_TERMS = {
    'beach': [
        'beach', 'seaside', 'shore', 'coast', 'sand beach', 'seashore', 
        'oceanfront', 'bay', 'waterfront', 'coastal area', 'beachfront'
    ],
    'hiking': [
        'hiking trail', 'mountain trail', 'nature trail', 'hiking', 'walking trail',
        'trekking', 'hill trail', 'forest trail', 'nature walk', 'hiking path'
    ],
    'camping': [
        'campsite', 'campground', 'camping', 'tent camping', 'rv park',
        'caravan park', 'camping ground', 'outdoor camping'
    ],
    'picnic': [
        'park', 'garden', 'picnic area', 'recreation area', 'picnic site',
        'public park', 'city park', 'green space', 'picnic spot'
    ],
    'sports': [
        'sports complex', 'stadium', 'sports field', 'playing field', 'athletic field',
        'sports ground', 'sports center', 'arena', 'sports facility'
    ],
    'photo': [
        'viewpoint', 'scenic spot', 'landmark', 'monument', 'scenic viewpoint',
        'observation point', 'lookout', 'vista point', 'panoramic view'
    ]
}

# Performance Enhancement: Data Structures for Fast Activity Search
@dataclass
class ActivityPlace:
    name: str
    lat: float
    lon: float
    type: str
    address: str
    activity_type: str
    relevance_score: float = 0.0

# Enhance the search engine to prioritize local results
class ActivitySearchEngine:
    def __init__(self):
        # Spatial indexing using simple grid system
        self.grid_size = 0.1  # ~11km grid
        self.places_by_grid: Dict[Tuple[int, int], List[ActivityPlace]] = defaultdict(list)
        self.places_by_activity: Dict[str, List[ActivityPlace]] = defaultdict(list)
        self.name_index: Dict[str, ActivityPlace] = {}
        self.coordinate_index: Dict[Tuple[float, float], ActivityPlace] = {}
        
        # Activity synonyms for better matching
        self.activity_synonyms = {
            'beach': {'beach', 'seaside', 'shore'},
            'hiking': {'hiking', 'trail', 'mountain', 'nature', 'walking', 'trekking', 'path', 'track', 'walk'},
            'camping': {'camping', 'campsite', 'campground', 'tent', 'rv', 'caravan', 'outdoor'},
            'picnic': {'picnic', 'park', 'garden', 'recreation', 'bbq', 'barbecue', 'green', 'public'},
            'sports': {'sports', 'stadium', 'field', 'arena', 'complex', 'athletic', 'playing', 'ground', 'sport'},
            'photo': {'viewpoint', 'scenic', 'landmark', 'monument', 'vista', 'panorama', 'lookout', 'view'}
        }
    
    # ... (keep existing methods the same, but enhance calculate_relevance)
    
    def calculate_relevance(self, place: ActivityPlace, query: str, center_lat: float, center_lon: float) -> float:
        """Calculate relevance score for a place with Kerala priority"""
        score = 0.0
        
        # Distance score (closer = better)
        distance = self._calculate_distance(place.lat, place.lon, center_lat, center_lon)
        distance_score = max(0, 1 - (distance / 100.0))  # Normalize to 100km range
        score += distance_score * 0.4
        
        # Name matching score
        name_lower = place.name.lower()
        query_lower = query.lower()
        
        if query_lower in name_lower:
            score += 0.3
        elif any(word in name_lower for word in query_lower.split()):
            score += 0.2
        
        # Activity type matching
        if place.activity_type in query_lower:
            score += 0.3
        
        # Kerala priority boost
        if "kerala" in place.address.lower() or "kerala" in name_lower:
            score += 0.2
        
        # Ernakulam/Kochi specific boost
        if any(city in place.address.lower() for city in ['ernakulam', 'kochi', 'cochin']):
            score += 0.1
        
        return min(1.0, score)  # Cap at 1.0
        
    def _get_grid_key(self, lat: float, lon: float) -> Tuple[int, int]:
        """Convert coordinates to grid key"""
        return (int(lat / self.grid_size), int(lon / self.grid_size))
    
    def _get_nearby_grids(self, lat: float, lon: float, radius_km: float = 10.0) -> List[Tuple[int, int]]:
        """Get nearby grid cells for a given location"""
        center_grid = self._get_grid_key(lat, lon)
        grids = []
        
        # Calculate grid range based on radius
        grid_range = max(1, int(radius_km / 11.0))  # Approximate km per grid
        
        for lat_offset in range(-grid_range, grid_range + 1):
            for lon_offset in range(-grid_range, grid_range + 1):
                grids.append((center_grid[0] + lat_offset, center_grid[1] + lon_offset))
                
        return grids
    
    def add_place(self, place: ActivityPlace):
        """Add a place to search indexes"""
        grid_key = self._get_grid_key(place.lat, place.lon)
        coord_key = (round(place.lat, 4), round(place.lon, 4))
        
        # Add to spatial index
        self.places_by_grid[grid_key].append(place)
        
        # Add to activity index
        self.places_by_activity[place.activity_type].append(place)
        
        # Add to other indexes
        self.name_index[place.name.lower()] = place
        self.coordinate_index[coord_key] = place
    
    def calculate_relevance(self, place: ActivityPlace, query: str, center_lat: float, center_lon: float) -> float:
        """Calculate relevance score for a place"""
        score = 0.0
        
        # Distance score (closer = better)
        distance = self._calculate_distance(place.lat, place.lon, center_lat, center_lon)
        distance_score = max(0, 1 - (distance / 50.0))  # Normalize to 50km range
        score += distance_score * 0.4
        
        # Name matching score
        name_lower = place.name.lower()
        query_lower = query.lower()
        
        if query_lower in name_lower:
            score += 0.3
        elif any(word in name_lower for word in query_lower.split()):
            score += 0.2
        
        # Activity type matching
        if place.activity_type in query_lower:
            score += 0.3
        
        return score
    
    def _calculate_distance(self, lat1: float, lon1: float, lat2: float, lon2: float) -> float:
        """Calculate distance between two points in km"""
        R = 6371  # Earth radius in km
        
        dlat = math.radians(lat2 - lat1)
        dlon = math.radians(lon2 - lon1)
        
        a = (math.sin(dlat/2) * math.sin(dlat/2) +
             math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) *
             math.sin(dlon/2) * math.sin(dlon/2))
        
        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
        return R * c
    
    async def search_nearby(self, lat: float, lon: float, activity: str, limit: int = 15) -> List[ActivityPlace]:
        """Fast search for activity places nearby"""
        start_time = asyncio.get_event_loop().time()
        
        # Get nearby grids
        nearby_grids = self._get_nearby_grids(lat, lon, radius_km=20.0)
        
        # Collect candidate places
        candidates = []
        for grid in nearby_grids:
            if grid in self.places_by_grid:
                candidates.extend(self.places_by_grid[grid])
        
        # Also check activity-specific places
        if activity in self.places_by_activity:
            activity_candidates = self.places_by_activity[activity]
            # Filter by distance
            for place in activity_candidates:
                distance = self._calculate_distance(lat, lon, place.lat, place.lon)
                if distance <= 50.0:  # Within 50km
                    candidates.append(place)
        
        # Remove duplicates and calculate relevance
        unique_places = {}
        for place in candidates:
            coord_key = (round(place.lat, 4), round(place.lon, 4))
            if coord_key not in unique_places:
                place.relevance_score = self.calculate_relevance(place, activity, lat, lon)
                unique_places[coord_key] = place
        
        # Sort by relevance and distance
        results = sorted(unique_places.values(), 
                        key=lambda x: (-x.relevance_score, 
                                    self._calculate_distance(lat, lon, x.lat, x.lon)))
        
        # Log performance
        search_time = (asyncio.get_event_loop().time() - start_time) * 1000
        print(f"Local search completed in {search_time:.2f}ms, found {len(results)} places")
        
        return results[:limit]
# Define global locations at module level
GLOBAL_LOCATIONS = [
    # Kerala Locations
    {"name": "Kanjirapally", "lat": 9.7478, "lon": 76.6679, "country": "India", "emoji": "🌴", "region": "Kerala"},
    {"name": "Kochi", "lat": 9.9312, "lon": 76.2673, "country": "India", "emoji": "🛳️", "region": "Kerala"},
    {"name": "Thiruvananthapuram", "lat": 8.5241, "lon": 76.9366, "country": "India", "emoji": "🏛️", "region": "Kerala"},
    {"name": "Kozhikode", "lat": 11.2588, "lon": 75.7804, "country": "India", "emoji": "🌊", "region": "Kerala"},
    {"name": "Munnar", "lat": 10.0889, "lon": 77.0595, "country": "India", "emoji": "🏔️", "region": "Kerala"},
    {"name": "Alappuzha", "lat": 9.4981, "lon": 76.3388, "country": "India", "emoji": "🚤", "region": "Kerala"},
    {"name": "Thrissur", "lat": 10.5276, "lon": 76.2144, "country": "India", "emoji": "🐘", "region": "Kerala"},
    {"name": "Kollam", "lat": 8.8932, "lon": 76.6141, "country": "India", "emoji": "🏖️", "region": "Kerala"},
    {"name": "Palakkad", "lat": 10.7867, "lon": 76.6548, "country": "India", "emoji": "🌳", "region": "Kerala"},
    {"name": "Kannur", "lat": 11.8745, "lon": 75.3704, "country": "India", "emoji": "🎭", "region": "Kerala"},
    {"name": "Kottayam", "lat": 9.5916, "lon": 76.5222, "country": "India", "emoji": "📚", "region": "Kerala"},
    {"name": "Idukki", "lat": 9.9189, "lon": 77.1025, "country": "India", "emoji": "🌄", "region": "Kerala"},
    {"name": "Wayanad", "lat": 11.6854, "lon": 76.1320, "country": "India", "emoji": "🌿", "region": "Kerala"},
    {"name": "Pathanamthitta", "lat": 9.2648, "lon": 76.7870, "country": "India", "emoji": "🛕", "region": "Kerala"},
    {"name": "Malappuram", "lat": 11.0732, "lon": 76.0740, "country": "India", "emoji": "📖", "region": "Kerala"},
    {"name": "Kasargod", "lat": 12.4996, "lon": 74.9869, "country": "India", "emoji": "🏰", "region": "Kerala"},
    {"name": "Perumbavoor", "lat": 10.1151, "lon": 76.4770, "country": "India", "emoji": "🏭", "region": "Kerala"},
    {"name": "Thodupuzha", "lat": 9.8943, "lon": 76.7176, "country": "India", "emoji": "⛰️", "region": "Kerala"},
    {"name": "Changanassery", "lat": 9.4428, "lon": 76.5368, "country": "India", "emoji": "⛪", "region": "Kerala"},
    {"name": "Pala", "lat": 9.7128, "lon": 76.6825, "country": "India", "emoji": "🌅", "region": "Kerala"},

    # Other Indian Cities
    {"name": "Bangalore", "lat": 12.9716, "lon": 77.5946, "country": "India", "emoji": "💻", "region": "Karnataka"},
    {"name": "Mumbai", "lat": 19.0760, "lon": 72.8777, "country": "India", "emoji": "🎬", "region": "Maharashtra"},
    {"name": "Delhi", "lat": 28.6139, "lon": 77.2090, "country": "India", "emoji": "🏛️", "region": "Delhi"},
    {"name": "Chennai", "lat": 13.0827, "lon": 80.2707, "country": "India", "emoji": "🎭", "region": "Tamil Nadu"},
    {"name": "Kolkata", "lat": 22.5726, "lon": 88.3639, "country": "India", "emoji": "🚎", "region": "West Bengal"},
    {"name": "Hyderabad", "lat": 17.3850, "lon": 78.4867, "country": "India", "emoji": "💎", "region": "Telangana"},

    # North America
    {"name": "New York", "lat": 40.7128, "lon": -74.0060, "country": "USA", "emoji": "🗽", "region": "North America"},
    {"name": "Los Angeles", "lat": 34.0522, "lon": -118.2437, "country": "USA", "emoji": "🌴", "region": "North America"},
    {"name": "Toronto", "lat": 43.6532, "lon": -79.3832, "country": "Canada", "emoji": "🍁", "region": "North America"},

    # Europe
    {"name": "London", "lat": 51.5074, "lon": -0.1278, "country": "UK", "emoji": "🇬🇧", "region": "Europe"},
    {"name": "Paris", "lat": 48.8566, "lon": 2.3522, "country": "France", "emoji": "🗼", "region": "Europe"},

    # Asia
    {"name": "Tokyo", "lat": 35.6762, "lon": 139.6503, "country": "Japan", "emoji": "🇯🇵", "region": "Asia"},
    {"name": "Singapore", "lat": 1.3521, "lon": 103.8198, "country": "Singapore", "emoji": "🦁", "region": "Asia"},
    {"name": "Dubai", "lat": 25.2048, "lon": 55.2708, "country": "UAE", "emoji": "🏜️", "region": "Asia"},
]

# Global search engine instance
search_engine = ActivitySearchEngine()

# Pre-load with some common places (you can expand this)
def initialize_common_places():
    """Initialize with some common places for faster results"""
    common_places = [
        ActivityPlace("Marina Beach", 13.0500, 80.2820, "beach", "Chennai, Tamil Nadu", "beach"),
        ActivityPlace("Kovalam Beach", 8.4000, 76.9786, "beach", "Kovalam, Kerala", "beach"),
        ActivityPlace("Varkala Beach", 8.7376, 76.7066, "beach", "Varkala, Kerala", "beach"),
        ActivityPlace("Bekal Beach", 12.3949, 75.0313, "beach", "Bekal, Kerala", "beach"),
        ActivityPlace("Cherai Beach", 10.1418, 76.1792, "beach", "Cherai, Kerala", "beach"),
        
        ActivityPlace("Munnar Hiking Trail", 10.0889, 77.0595, "hiking", "Munnar, Kerala", "hiking"),
        ActivityPlace("Thekkady Nature Walk", 9.6000, 77.1667, "hiking", "Thekkady, Kerala", "hiking"),
        ActivityPlace("Wayanad Hiking Trail", 11.6854, 76.1320, "hiking", "Wayanad, Kerala", "hiking"),
        ActivityPlace("Athirapally Trail", 10.2856, 76.5701, "hiking", "Athirapally, Kerala", "hiking"),
        
        ActivityPlace("Wayanad Camping", 11.6854, 76.1320, "camping", "Wayanad, Kerala", "camping"),
        ActivityPlace("Munnar Camp Site", 10.0889, 77.0595, "camping", "Munnar, Kerala", "camping"),
        ActivityPlace("Thekkady Camping", 9.6000, 77.1667, "camping", "Thekkady, Kerala", "camping"),
        
        ActivityPlace("Kanakakkunnu Palace", 8.5241, 76.9366, "picnic", "Thiruvananthapuram, Kerala", "picnic"),
        ActivityPlace("Veli Tourist Village", 8.4589, 76.9756, "picnic", "Thiruvananthapuram, Kerala", "picnic"),
        ActivityPlace("Malampuzha Garden", 10.8322, 76.6916, "picnic", "Palakkad, Kerala", "picnic"),
        
        ActivityPlace("Jawaharlal Nehru Stadium", 8.5241, 76.9366, "sports", "Thiruvananthapuram, Kerala", "sports"),
        ActivityPlace("University Stadium", 8.5465, 76.8795, "sports", "Thiruvananthapuram, Kerala", "sports"),
        
        ActivityPlace("Ponmudi Viewpoint", 8.7590, 77.1129, "photo", "Ponmudi, Kerala", "photo"),
        ActivityPlace("Athirapally Waterfall", 10.2856, 76.5701, "photo", "Athirapally, Kerala", "photo"),
        ActivityPlace("Mattupetty Dam", 10.1000, 77.1167, "photo", "Munnar, Kerala", "photo"),
    ]
    
    for place in common_places:
        search_engine.add_place(place)

# Initialize on startup
initialize_common_places()

# Response cache for API calls
response_cache = {}
CACHE_DURATION = 300  # 5 minutes

def get_cache_key(*args):
    return hash(tuple(args))

def cached_api_call(func):
    async def wrapper(*args, **kwargs):
        cache_key = get_cache_key(func.__name__, args, tuple(kwargs.items()))
        current_time = time.time()
        
        if cache_key in response_cache:
            data, timestamp = response_cache[cache_key]
            if current_time - timestamp < CACHE_DURATION:
                print(f"Using cached response for {func.__name__}")
                return data
        
        # Call the actual function
        result = await func(*args, **kwargs)
        response_cache[cache_key] = (result, current_time)
        return result
    return wrapper

@app.post("/api/location/search")
async def search_location(request: LocationSearchRequest):
    """Search for locations using free geocoding APIs"""
    print(f"Searching locations for: {request.query}")
    
    try:
        # Convert to dict to handle any extra fields gracefully
        request_data = request.dict()
        query = request_data.get('query', '')
        
        if not query or len(query.strip()) < 2:
            return {"locations": []}
        
        # First try local search from predefined locations (FAST)
        local_results = await search_local_locations(query)
        if local_results:
            print(f"Found {len(local_results)} local results for '{query}'")
            return {"locations": local_results}
        
        # If no local results, try external APIs
        external_results = await search_external_apis(query)
        return {"locations": external_results}
        
    except Exception as e:
        print(f"Error in location search: {e}")
        # Return empty results instead of error
        return {"locations": []}

async def search_local_locations(query: str) -> List[dict]:
    """Fast local search from predefined locations"""
    if not query or len(query) < 2:
        return []
    
    query_lower = query.lower().strip()
    results = []
    
    # Search in predefined global locations
    for loc in GLOBAL_LOCATIONS:
        name_match = query_lower in loc["name"].lower()
        country_match = query_lower in loc["country"].lower() 
        region_match = query_lower in loc.get("region", "").lower()
        
        if name_match or country_match or region_match:
            results.append(loc)
    
    # Sort by relevance (exact matches first, then partial matches)
    results.sort(key=lambda x: (
        not x["name"].lower().startswith(query_lower),  # Exact matches first
        not x["name"].lower().replace(' ', '').startswith(query_lower.replace(' ', '')),  # Close matches
        len(x["name"])  # Shorter names first (usually more relevant)
    ))
    
    return results[:15]  # Limit results

async def search_external_apis(query: str) -> List[dict]:
    """Search external geocoding APIs"""
    locations = []
    
    try:
        # Try Open-Meteo Geocoding first
        async with httpx.AsyncClient() as client:
            response = await client.get(
                GEOCODING_API_URL,
                params={
                    "name": query,
                    "count": 10,
                    "language": "en",
                    "format": "json"
                },
                timeout=5.0  # Shorter timeout
            )
            
            if response.status_code == 200:
                data = response.json()
                if "results" in data:
                    for loc in data["results"]:
                        country_code = loc.get("country_code", "").upper()
                        emoji = get_country_emoji(country_code)
                        
                        locations.append({
                            "name": loc.get("name", "Unknown"),
                            "country": loc.get("country", "Unknown"),
                            "state": loc.get("admin1", ""),
                            "lat": loc.get("latitude", 0),
                            "lon": loc.get("longitude", 0),
                            "emoji": emoji
                        })
    except Exception as e:
        print(f"Open-Meteo API error: {e}")
    
    # If no results from Open-Meteo, try Nominatim
    if not locations:
        try:
            nominatim_results = await search_nominatim(query)
            locations.extend(nominatim_results)
        except Exception as e:
            print(f"Nominatim API error: {e}")
    
    return locations

async def search_local_locations(query: str) -> List[dict]:
    """Fast local search from predefined locations"""
    if not query or len(query) < 2:
        return []
    
    query_lower = query.lower().strip()
    results = []
    
    # Search in predefined global locations
    for loc in GLOBAL_LOCATIONS:
        name_match = query_lower in loc["name"].lower()
        country_match = query_lower in loc["country"].lower() 
        region_match = query_lower in loc.get("region", "").lower()
        
        if name_match or country_match or region_match:
            results.append(loc)
    
    # Sort by relevance (exact matches first, then partial matches)
    results.sort(key=lambda x: (
        not x["name"].lower().startswith(query_lower),  # Exact matches first
        not x["name"].lower().replace(' ', '').startswith(query_lower.replace(' ', '')),  # Close matches
        len(x["name"])  # Shorter names first (usually more relevant)
    ))
    
    return results[:15]  # Limit results

async def search_external_apis(query: str) -> List[dict]:
    """Search external geocoding APIs"""
    locations = []
    
    try:
        # Try Open-Meteo Geocoding first
        async with httpx.AsyncClient() as client:
            response = await client.get(
                GEOCODING_API_URL,
                params={
                    "name": query,
                    "count": 10,
                    "language": "en",
                    "format": "json"
                },
                timeout=5.0  # Shorter timeout
            )
            
            if response.status_code == 200:
                data = response.json()
                if "results" in data:
                    for loc in data["results"]:
                        country_code = loc.get("country_code", "").upper()
                        emoji = get_country_emoji(country_code)
                        
                        locations.append({
                            "name": loc.get("name", "Unknown"),
                            "country": loc.get("country", "Unknown"),
                            "state": loc.get("admin1", ""),
                            "lat": loc.get("latitude", 0),
                            "lon": loc.get("longitude", 0),
                            "emoji": emoji
                        })
    except Exception as e:
        print(f"Open-Meteo API error: {e}")
    
    # If no results from Open-Meteo, try Nominatim
    if not locations:
        try:
            nominatim_results = await search_nominatim(query)
            locations.extend(nominatim_results)
        except Exception as e:
            print(f"Nominatim API error: {e}")
    
    return locations

@app.post("/api/debug/request-format")
async def debug_request_format(request: dict):
    """Debug endpoint to see what data frontend is sending"""
    print("=== DEBUG REQUEST FORMAT ===")
    print(f"Request headers: {request}")
    print(f"Request type: {type(request)}")
    print(f"Request keys: {request.keys() if isinstance(request, dict) else 'Not a dict'}")
    print("=== END DEBUG ===")
    return {
        "received_data": request,
        "message": "Check server console for request details"
    }

async def search_nominatim(query: str):
    """Search using OpenStreetMap Nominatim API"""
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                "https://nominatim.openstreetmap.org/search",
                params={
                    "q": query,
                    "format": "json",
                    "limit": 10,
                    "addressdetails": 1
                },
                headers={"User-Agent": "WeatherWiseApp/1.0"},
                timeout=8.0
            )
            
            if response.status_code == 200:
                data = response.json()
                locations = []
                
                for loc in data:
                    address = loc.get("address", {})
                    country_code = address.get("country_code", "").upper()
                    emoji = get_country_emoji(country_code)
                    
                    # Create a more user-friendly display name
                    display_name = loc.get("display_name", "")
                    name_parts = display_name.split(",")
                    primary_name = name_parts[0] if name_parts else "Unknown"
                    
                    locations.append({
                        "name": primary_name,
                        "country": address.get("country", "Unknown"),
                        "state": address.get("state", ""),
                        "lat": float(loc.get("lat")),
                        "lon": float(loc.get("lon")),
                        "emoji": emoji
                    })
                
                return locations
    except Exception as e:
        print(f"Error with Nominatim: {e}")
    
    return []

def get_country_emoji(country_code: str) -> str:
    """Convert country code to flag emoji"""
    if not country_code or len(country_code) != 2:
        return "📍"
    
    try:
        # Convert to regional indicator symbols
        base = 127397
        emoji = ''.join(chr(base + ord(char)) for char in country_code.upper())
        return emoji
    except:
        return "📍"

@app.post("/api/activity/places")
async def get_activity_places(request: ActivityPlacesRequest):
    """Get places for specific activities in a location"""
    try:
        
        places = []
        queries = ACTIVITY_SEARCH_TERMS.get(request.activity, [request.activity])
        
        for query in queries:
            try:
                async with httpx.AsyncClient() as client:
                    # Search for places using OpenStreetMap Nominatim
                    search_query = f"{query} in {request.locationName}"
                    response = await client.get(
                        "https://nominatim.openstreetmap.org/search",
                        params={
                            "q": search_query,
                            "format": "json",
                            "limit": 10,
                            "addressdetails": 1,
                            "viewbox": f"{request.lon-0.5},{request.lat-0.5},{request.lon+0.5},{request.lat+0.5}",
                            "bounded": 1
                        },
                        headers={"User-Agent": "WeatherWiseApp/1.0"},
                        timeout=10.0
                    )
                    
                    if response.status_code == 200:
                        data = response.json()
                        for place in data:
                            places.append({
                                "name": place.get("display_name", "").split(",")[0],
                                "lat": float(place.get("lat")),
                                "lon": float(place.get("lon")),
                                "type": query,
                                "address": place.get("display_name", "")
                            })
            except Exception as e:
                print(f"Error searching for {query}: {e}")
                continue
        
        # Remove duplicates and limit results
        unique_places = []
        seen = set()
        for place in places:
            key = (place["lat"], place["lon"])
            if key not in seen:
                seen.add(key)
                unique_places.append(place)
        
        return {"places": unique_places[:15]}  # Limit to 15 places
        
    except Exception as e:
        print(f"Error getting activity places: {e}")
        return {"places": []}

async def fetch_weather_data(lat: float, lon: float):
    """Fetch weather data from Open-Meteo (free)"""
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                OPEN_METEO_URL,
                params={
                    "latitude": lat,
                    "longitude": lon,
                    "current": "temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,rain,showers,snowfall,weather_code,wind_speed_10m,wind_direction_10m,pressure_msl",
                    "hourly": "temperature_2m,relative_humidity_2m,precipitation,weather_code,wind_speed_10m,uv_index,visibility",
                    "daily": "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_hours,wind_speed_10m_max,uv_index_max",
                    "timezone": "auto",
                    "forecast_days": 7
                },
                timeout=10.0
            )
            
            if response.status_code != 200:
                raise HTTPException(status_code=response.status_code, detail="Weather API error")
            
            return response.json()
            
    except Exception as e:
        print(f"Error fetching weather data: {e}")
        raise HTTPException(status_code=500, detail=str(e))
@app.post("/api/places/search")
async def search_activity_places(request: PlaceSearchRequest):
    """Fast search for activity-specific places with caching and hybrid approach"""
    try:
        print(f"Fast hybrid search for {request.activity} places in {request.locationName} at {request.lat}, {request.lon}")
        
        # Validate required fields
        if not request.activity or not request.locationName:
            raise HTTPException(status_code=422, detail="Activity and locationName are required")
        
        # First, try fast local search
        local_results = await search_engine.search_nearby(
            request.lat, request.lon, request.activity, limit=15
        )
        
        places = []
        for place in local_results:
            places.append({
                "name": place.name,
                "lat": place.lat,
                "lon": place.lon,
                "type": place.type,
                "address": place.address,
                "icon": "red",
                "relevance_score": round(place.relevance_score, 2)
            })
        
        print(f"Local search found {len(places)} places for {request.activity}")
        
        # If we have good local results, return them immediately
        if len(places) >= 3:
            print(f"Returning {len(places)} fast local results")
            return {
                "places": places[:15], 
                "source": "local_cache",
                "local_results": len(places),
                "api_results": 0
            }
        
        # Otherwise, fall back to API search with better error handling
        print("Insufficient local results, falling back to API search")
        api_places = await search_external_places(
            request.lat, request.lon, request.activity, request.locationName
        )
        
        # Combine and deduplicate results
        all_places = places + api_places
        unique_places = []
        seen_coords = set()
        
        for place in all_places:
            coord_key = (round(place["lat"], 4), round(place["lon"], 4))
            if coord_key not in seen_coords:
                seen_coords.add(coord_key)
                unique_places.append(place)
        
        print(f"Total unique places found: {len(unique_places)}")
        return {
            "places": unique_places[:15],
            "source": "hybrid",
            "local_results": len(places),
            "api_results": len(api_places)
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error in search_activity_places: {e}")
        # Return empty results with error info
        return {
            "places": [], 
            "source": "error", 
            "local_results": 0, 
            "api_results": 0,
            "error": str(e)
        }

async def search_external_places(lat: float, lon: float, activity: str, location_name: str) -> List[dict]:
    """Search external APIs for activity places"""
    api_places = []
    search_terms = ACTIVITY_SEARCH_TERMS.get(activity, [activity])
    
    for term in search_terms:
        try:
            async with httpx.AsyncClient() as client:
                # Try different search patterns
                search_patterns = [
                    f"{term} in {location_name}",
                    f"{term} near {location_name}",
                    f"{term} {location_name}",
                    term  # Just the term itself
                ]
                
                for search_pattern in search_patterns:
                    response = await client.get(
                        "https://nominatim.openstreetmap.org/search",
                        params={
                            "q": search_pattern,
                            "format": "json",
                            "limit": 5,
                            "viewbox": f"{lon-0.5},{lat-0.5},{lon+0.5},{lat+0.5}",
                            "bounded": 1
                        },
                        headers={"User-Agent": "WeatherWiseApp/1.0"},
                        timeout=6.0
                    )
                    
                    if response.status_code == 200:
                        data = response.json()
                        print(f"Found {len(data)} results for '{search_pattern}'")
                        
                        for place in data:
                            api_place = ActivityPlace(
                                name=place.get("display_name", "").split(",")[0],
                                lat=float(place.get("lat")),
                                lon=float(place.get("lon")),
                                type=term,
                                address=place.get("display_name", ""),
                                activity_type=activity
                            )
                            
                            # Add to search engine for future queries
                            search_engine.add_place(api_place)
                            
                            api_places.append({
                                "name": api_place.name,
                                "lat": api_place.lat,
                                "lon": api_place.lon,
                                "type": api_place.type,
                                "address": api_place.address,
                                "icon": "red"
                            })
                        
                        # If we found results with this pattern, break
                        if data:
                            break
                
                # Small delay to be respectful to the API
                await asyncio.sleep(0.2)
                
        except Exception as e:
            print(f"Error searching for {term}: {e}")
            continue
    
    return api_places

# NEW ENDPOINTS FOR PERFORMANCE MONITORING AND DATA MANAGEMENT
@app.post("/api/places/bulk-load")
async def bulk_load_places(request: BulkLoadRequest):
    """Bulk load places into the search engine"""
    try:
        loaded_count = 0
        for place_data in request.places:
            place = ActivityPlace(
                name=place_data.get("name"),
                lat=place_data.get("lat"),
                lon=place_data.get("lon"),
                type=place_data.get("type", "unknown"),
                address=place_data.get("address", ""),
                activity_type=place_data.get("activity_type", "general")
            )
            search_engine.add_place(place)
            loaded_count += 1
        
        return {
            "message": f"Successfully loaded {loaded_count} places", 
            "status": "success",
            "total_places": len(search_engine.coordinate_index)
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error loading places: {str(e)}")

@app.get("/api/search/stats")
async def get_search_stats():
    """Get statistics about the search engine"""
    stats = {
        "total_places": len(search_engine.coordinate_index),
        "places_by_activity": {k: len(v) for k, v in search_engine.places_by_activity.items()},
        "grid_cells_used": len(search_engine.places_by_grid),
        "unique_names": len(search_engine.name_index),
        "cache_size": len(response_cache)
    }
    return stats

@app.get("/api/cache/clear")
async def clear_cache():
    """Clear response cache"""
    global response_cache
    cache_size = len(response_cache)
    response_cache = {}
    return {"message": f"Cache cleared, removed {cache_size} entries"}

# ALL ORIGINAL WEATHER FUNCTIONS REMAIN EXACTLY THE SAME

def parse_weather_code(code: int) -> str:
    """Convert WMO weather code to condition string"""
    weather_codes = {
        0: "clear", 1: "mainly clear", 2: "partly cloudy", 3: "overcast",
        45: "foggy", 48: "foggy", 51: "drizzly", 53: "drizzly", 55: "drizzly",
        56: "freezing drizzle", 57: "freezing drizzle", 61: "rainy", 63: "rainy",
        65: "rainy", 66: "freezing rain", 67: "freezing rain", 71: "snowy",
        73: "snowy", 75: "snowy", 77: "snowy", 80: "rainy", 81: "rainy",
        82: "rainy", 85: "snowy", 86: "snowy", 95: "stormy",
        96: "stormy", 99: "stormy"
    }
    return weather_codes.get(code, "clear")

def get_condition_emoji(condition: str) -> str:
    """Get emoji for weather condition"""
    emoji_map = {
        "clear": "☀️",
        "mainly clear": "🌤️",
        "partly cloudy": "⛅",
        "overcast": "☁️",
        "foggy": "🌫️",
        "drizzly": "🌧️",
        "rainy": "🌧️",
        "snowy": "❄️",
        "stormy": "⛈️"
    }
    return emoji_map.get(condition, "🌤️")

def estimate_cloud_cover(weather_code: int) -> int:
    """Estimate cloud cover percentage from weather code"""
    if weather_code == 0:
        return 0  # Clear
    elif weather_code == 1:
        return 25  # Mainly clear
    elif weather_code == 2:
        return 50  # Partly cloudy
    elif weather_code == 3:
        return 85  # Overcast
    else:
        return 70  # Default for precipitation/fog

def celsius_to_fahrenheit(celsius: float) -> float:
    """Convert Celsius to Fahrenheit"""
    return (celsius * 9/5) + 32

def kmh_to_mph(kmh: float) -> float:
    """Convert km/h to mph"""
    return kmh * 0.621371

def mm_to_inches(mm: float) -> float:
    """Convert mm to inches"""
    return mm * 0.0393701

@app.post("/api/weather/fetch")
async def fetch_real_weather(request: LocationWeatherRequest):
    """Fetch real-time weather data for a location using free APIs"""
    print(f"Fetching weather for: {request.locationName} ({request.lat}, {request.lon})")
    
    try:
        weather_data = await fetch_weather_data(request.lat, request.lon)
        
        # Parse current weather
        current = weather_data.get("current", {})
        hourly = weather_data.get("hourly", {})
        daily = weather_data.get("daily", {})
        
        # Get current UV index
        uv_index = current.get("uv_index", 5)
        if not uv_index and hourly.get("uv_index"):
            now = datetime.now()
            current_hour = now.replace(minute=0, second=0, microsecond=0)
            for i, time_str in enumerate(hourly["time"]):
                if datetime.fromisoformat(time_str.replace('Z', '+00:00')) >= current_hour:
                    uv_index = hourly["uv_index"][i]
                    break
        
        weather_code = current.get("weather_code", 0)
        condition = parse_weather_code(weather_code)
        
        # Convert units from metric to imperial
        temp_f = celsius_to_fahrenheit(current.get("temperature_2m", 21))
        wind_mph = kmh_to_mph(current.get("wind_speed_10m", 10))
        precip_inches = mm_to_inches(current.get("precipitation", 0))
        
        current_weather = {
            "temperature": round(temp_f, 1),
            "windSpeed": round(wind_mph, 1),
            "humidity": current.get("relative_humidity_2m", 50),
            "precipitation": round(precip_inches, 1),
            "uvIndex": round(uv_index, 1),
            "condition": condition,
            "conditionEmoji": get_condition_emoji(condition),
            "cloudCover": estimate_cloud_cover(weather_code),
            "visibility": round((hourly.get("visibility", [10000])[0] / 1000) * 0.621371, 1) if hourly.get("visibility") else 6.2,  # km to miles
            "dewPoint": round(celsius_to_fahrenheit(current.get("apparent_temperature", 18)), 1),
            "pressure": round(current.get("pressure_msl", 1013)),
            "description": condition.replace("_", " ").title()
        }
        
        # Parse forecast
        forecast = []
        if daily.get("time"):
            for i in range(min(7, len(daily["time"]))):
                date_str = daily["time"][i]
                condition_code = daily["weather_code"][i]
                condition_str = parse_weather_code(condition_code)
                
                # Convert temperatures to Fahrenheit
                high_f = celsius_to_fahrenheit(daily["temperature_2m_max"][i])
                low_f = celsius_to_fahrenheit(daily["temperature_2m_min"][i])
                avg_temp = (high_f + low_f) / 2
                
                # Convert precipitation to inches
                precip_inches = mm_to_inches(daily.get("precipitation_sum", [0]*7)[i])
                
                # Convert wind to mph
                wind_mph = kmh_to_mph(daily.get("wind_speed_10m_max", [10]*7)[i])
                
                forecast.append({
                    "date": datetime.fromisoformat(date_str).strftime("%a, %b %d"),
                    "temperature": round(avg_temp, 1),
                    "high": round(high_f, 1),
                    "low": round(low_f, 1),
                    "precipitation": round(precip_inches, 1),
                    "windSpeed": round(wind_mph, 1),
                    "wind": round(wind_mph, 1),
                    "humidity": 65,  # Approximate from historical averages
                    "condition": condition_str,
                    "conditionEmoji": get_condition_emoji(condition_str)
                })
        
        # Generate historical data based on location and season
        historical = generate_historical_data(request.lat, request.lon, current_weather["temperature"])
        
        return {
            "current": current_weather,
            "forecast": forecast,
            "historical": historical
        }
    
    except HTTPException as e:
        raise e
    except Exception as e:
        print(f"Error in fetch_real_weather: {e}")
        raise HTTPException(status_code=500, detail=str(e))

def generate_historical_data(lat: float, lon: float, current_temp: float) -> dict:
    """Generate realistic historical data based on location and current temperature"""
    # Simple logic based on latitude and current temperature
    if lat > 40:  # Northern regions
        avg_temp = current_temp - 5
    elif lat < -40:  # Southern regions
        avg_temp = current_temp - 3
    else:  # Tropical/temperate
        avg_temp = current_temp
    
    return {
        "avgTemp": round(avg_temp, 1),
        "avgPrecip": round(1.2 if lat > 40 else 0.8, 1),
        "avgWind": 8.5,
        "recordHigh": round(current_temp + 25, 1),
        "recordLow": round(current_temp - 30, 1)
    }

@app.post("/api/analyze")
async def analyze_weather(request: WeatherRequest):
    print(f"Received request: {request}")
    
    api_key = os.getenv('GROQ_API_KEY')
    if not api_key:
        print("ERROR: GROQ_API_KEY not found in environment variables")
        raise HTTPException(status_code=500, detail="API key not configured")
    
    try:
        prompt = f"""You are WeatherWise Pro AI, an elite outdoor activity planning assistant.

Weather Data for {request.locationName}, {request.locationCountry}:
- Temperature: {request.temperature}°F
- Wind Speed: {request.windSpeed} mph
- Precipitation: {request.precipitation} inches
- Humidity: {request.humidity}%
- UV Index: {request.uvIndex}

Planned Activity: {request.activityName}

Provide expert analysis with:
1. Activity rating (EXCELLENT/GREAT/GOOD/FAIR/POOR)
2. Key insights about conditions (2-3 sentences)
3. One pro tip specific to this activity
4. Risk mitigation advice
5. Best timing recommendation

Write 4-5 concise sentences total. Be confident and use meteorological terminology. Format like the example:
"**Beach rating: GREAT** Today's conditions are favorable for the beach. With a temperature around 73°F, it's comfortable..."

Keep response under 300 words."""

        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": "llama-3.3-70b-versatile",
                    "messages": [{"role": "user", "content": prompt}],
                    "max_tokens": 400,
                    "temperature": 0.7
                },
                timeout=30.0
            )
            
            if response.status_code != 200:
                raise HTTPException(status_code=response.status_code, detail="AI API Error")
            
            data = response.json()
            advice = data["choices"][0]["message"]["content"]
            return {"advice": advice}
        
    except Exception as e:
        print(f"Error in analyze_weather: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/forecast-insights")
async def generate_forecast_insights(request: ForecastInsightRequest):
    print(f"Received forecast insight request for: {request.locationName}")
    
    api_key = os.getenv('GROQ_API_KEY')
    if not api_key:
        raise HTTPException(status_code=500, detail="API key not configured")
    
    try:
        forecast_text = ""
        for day in request.forecast:
            forecast_text += f"\n- {day.date}: {day.condition}, {day.temperature}°F, Precipitation: {day.precipitation}%, Wind: {day.windSpeed} mph, Humidity: {day.humidity}%"
        
        prompt = f"""You are a weather forecasting assistant. Analyze this forecast for {request.locationName}, {request.locationCountry}:
{forecast_text}

Provide a friendly 2-3 sentence summary that:
1. Highlights key weather patterns or changes
2. Mentions precipitation or extreme conditions
3. Gives practical advice

Start naturally like "Expect..." or "This week brings...". Keep under 100 words."""

        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": "llama-3.3-70b-versatile",
                    "messages": [{"role": "user", "content": prompt}],
                    "max_tokens": 200,
                    "temperature": 0.7
                },
                timeout=30.0
            )
            
            if response.status_code != 200:
                raise HTTPException(status_code=response.status_code, detail="AI API Error")
            
            data = response.json()
            insights = data["choices"][0]["message"]["content"]
            return {"insights": insights}
        
    except Exception as e:
        print(f"Error generating insights: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/")
async def root():
    return {"status": "ok", "message": "WeatherWise API is running"}

@app.get("/health")
async def health_check():
    groq_key = os.getenv('GROQ_API_KEY')
    return {
        "status": "healthy",
        "groq_api_configured": bool(groq_key),
        "free_apis_used": "open-meteo, openstreetmap-nominatim",
        "search_engine_stats": {
            "total_places": len(search_engine.coordinate_index),
            "cache_size": len(response_cache)
        }
    }