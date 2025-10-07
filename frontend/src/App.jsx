import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Cloud, Sun, Map, Wind, Droplets, Thermometer, TrendingUp, MapPin, Calendar, Sparkles, Download, AlertTriangle, Zap, Eye, CloudRain, Activity, Target, BarChart3, Globe, ArrowRight, X, Star, Compass, Mountain, Waves, Gauge, Shield, Brain, Search, Navigation, Database, Bell } from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const WeatherWise = () => {
  const [activeTab, setActiveTab] = useState('planner');
  const [location, setLocation] = useState(null);
  const [compareLocations, setCompareLocations] = useState([]);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [activity, setActivity] = useState('beach');
  const [weatherData, setWeatherData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [aiAdvice, setAiAdvice] = useState('');
  const [showLocationSearch, setShowLocationSearch] = useState(false);
  const [forecast, setForecast] = useState([]);
  const [historicalTrends, setHistoricalTrends] = useState([]);
  const [animateIn, setAnimateIn] = useState(false);
  const [compareData, setCompareData] = useState({});
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [useCurrentLocation, setUseCurrentLocation] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [activityPlaces, setActivityPlaces] = useState([]);
  const [mapLoading, setMapLoading] = useState(false);
  const [searchingPlaces, setSearchingPlaces] = useState(false);
  const [hasSearchedPlaces, setHasSearchedPlaces] = useState(false);

  // Alert states
  const [alerts, setAlerts] = useState([]);
  const [alertCount, setAlertCount] = useState(0);
  const [loadingAlerts, setLoadingAlerts] = useState(false);
  const [showAlerts, setShowAlerts] = useState(false);

  // NEW: Performance monitoring states
  const [searchStats, setSearchStats] = useState(null);
  const [searchEngineStats, setSearchEngineStats] = useState(null);

  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef([]);

  // Compare tab search states
  const [compareSearchQuery, setCompareSearchQuery] = useState('');
  const [compareSearchResults, setCompareSearchResults] = useState([]);
  const [showCompareSearch, setShowCompareSearch] = useState(false);
  const [isCompareSearching, setIsCompareSearching] = useState(false);

  // Advanced Export States
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportFormat, setExportFormat] = useState('CSV');
  const [exportIncludes, setExportIncludes] = useState(['raw_data', 'probabilities', 'trends', 'metadata']);
  const [customDateRange, setCustomDateRange] = useState(false);
  const [exportStartDate, setExportStartDate] = useState('');
  const [exportEndDate, setExportEndDate] = useState('');

  useEffect(() => {
    setTimeout(() => setAnimateIn(true), 100);
  }, []);

  useEffect(() => {
    if (location && mapRef.current) {
      setShowMap(true);
      initializeMap();
    }
  }, [location]);

  useEffect(() => {
    if (mapInstanceRef.current && activityPlaces.length > 0) {
      updateMapMarkers();
    }
  }, [activityPlaces]);

  // NEW: Fetch search engine stats on component mount
  useEffect(() => {
    fetchSearchEngineStats();
  }, []);

  // Alert-related functions
  const fetchGovernmentAlerts = async (locationName = '', lat = null, lon = null) => {
    setLoadingAlerts(true);
    try {
      let realAlerts = [];

      // Try OpenWeatherMap first (most reliable)
      if (lat && lon) {
        realAlerts = await fetchOpenWeatherAlerts(lat, lon);
      }

      // If no real alerts, fall back to mock data
      if (realAlerts.length === 0) {
        console.log('Using mock alerts data');
        realAlerts = generateMockAlerts(locationName);
      } else {
        console.log('Using real weather alerts:', realAlerts.length);
      }

      setAlerts(realAlerts);
      setAlertCount(realAlerts.filter(alert => !alert.read).length);
    } catch (error) {
      console.error('Error fetching alerts:', error);
      // Fallback to mock data
      const mockAlerts = generateMockAlerts(locationName);
      setAlerts(mockAlerts);
      setAlertCount(mockAlerts.filter(alert => !alert.read).length);
    } finally {
      setLoadingAlerts(false);
    }
  };

  // Real OpenWeatherMap API integration
  const fetchOpenWeatherAlerts = async (lat, lon) => {
    try {
      // Replace with your actual API key
      const API_KEY = 'your_openweather_api_key_here';
      const response = await fetch(
        `https://api.openweathermap.org/data/2.5/onecall?lat=${lat}&lon=${lon}&exclude=minutely,hourly&appid=${API_KEY}`
      );

      if (!response.ok) {
        throw new Error('OpenWeatherMap API failed');
      }

      const data = await response.json();

      if (data.alerts && data.alerts.length > 0) {
        return data.alerts.map(alert => ({
          id: `owm-${alert.start}-${alert.end}`,
          type: getAlertTypeFromEvent(alert.event),
          severity: getSeverityFromDescription(alert.description),
          title: alert.event,
          message: alert.description,
          location: alert.tags?.[0] || 'Current Location',
          source: 'OpenWeatherMap',
          timestamp: new Date(alert.start * 1000),
          read: false,
          official: true,
          dataSource: 'openweather'
        }));
      }

      return [];
    } catch (error) {
      console.error('OpenWeatherMap API error:', error);
      return [];
    }
  };

  // Helper functions to map API data to our format
  const getAlertTypeFromEvent = (event) => {
    const eventLower = event.toLowerCase();
    if (eventLower.includes('rain') || eventLower.includes('storm') || eventLower.includes('flood')) {
      return 'weather';
    } else if (eventLower.includes('wind') || eventLower.includes('cyclone') || eventLower.includes('hurricane')) {
      return 'cyclone';
    } else if (eventLower.includes('heat') || eventLower.includes('cold') || eventLower.includes('temperature')) {
      return 'weather';
    } else if (eventLower.includes('earthquake') || eventLower.includes('landslide') || eventLower.includes('tsunami')) {
      return 'disaster';
    }
    return 'info';
  };

  const getSeverityFromDescription = (description) => {
    const descLower = description.toLowerCase();
    if (descLower.includes('extreme') || descLower.includes('severe') || descLower.includes('emergency')) {
      return 'high';
    } else if (descLower.includes('moderate') || descLower.includes('advisory')) {
      return 'medium';
    }
    return 'low';
  };

  const generateMockAlerts = (locationName = '') => {
    const currentDate = new Date();
    const alerts = [];

    // Kerala specific alerts
    if (locationName && locationName.toLowerCase().includes('kerala')) {
      alerts.push({
        id: 1,
        type: 'weather',
        severity: 'high',
        title: 'Heavy Rainfall Warning',
        message: 'India Meteorological Department issues heavy rainfall alert for Kerala districts. Expected rainfall: 200-300mm in next 24 hours.',
        location: 'Kerala',
        source: 'IMD Kerala',
        timestamp: new Date(currentDate.getTime() - 30 * 60000), // 30 minutes ago
        read: false,
        official: true,
        dataSource: 'imd'
      });

      alerts.push({
        id: 2,
        type: 'disaster',
        severity: 'medium',
        title: 'Landslide Alert',
        message: 'KSNDMC alerts for possible landslides in hilly areas of Idukki and Wayanad districts.',
        location: 'Kerala - Idukki, Wayanad',
        source: 'KSNDMC',
        timestamp: new Date(currentDate.getTime() - 2 * 60 * 60000), // 2 hours ago
        read: false,
        official: true,
        dataSource: 'ksndmc'
      });
    }

    // General India alerts
    alerts.push({
      id: 3,
      type: 'cyclone',
      severity: 'high',
      title: 'Cyclone Watch',
      message: 'Cyclonic circulation observed over Bay of Bengal. Coastal areas advised to stay alert.',
      location: 'East Coast India',
      source: 'IMD',
      timestamp: new Date(currentDate.getTime() - 4 * 60 * 60000), // 4 hours ago
      read: false,
      official: true,
      dataSource: 'imd'
    });

    // Location-specific alerts
    if (locationName) {
      alerts.push({
        id: 4,
        type: 'weather',
        severity: 'medium',
        title: 'Temperature Alert',
        message: `High temperature expected in ${locationName}. Stay hydrated and avoid direct sunlight during peak hours.`,
        location: locationName,
        source: 'WeatherWise Pro',
        timestamp: new Date(currentDate.getTime() - 1 * 60 * 60000), // 1 hour ago
        read: false,
        official: false,
        dataSource: 'system'
      });
    }

    // Add some read alerts for demonstration
    alerts.push({
      id: 5,
      type: 'info',
      severity: 'low',
      title: 'Monsoon Update',
      message: 'Southwest monsoon advancing normally across Kerala coast.',
      location: 'Kerala Coast',
      source: 'IMD',
      timestamp: new Date(currentDate.getTime() - 24 * 60 * 60000), // 24 hours ago
      read: true,
      official: true,
      dataSource: 'imd'
    });

    return alerts;
  };

  const getRelativeTime = (timestamp) => {
    const now = new Date();
    const diffInSeconds = Math.floor((now - timestamp) / 1000);
    const diffInMinutes = Math.floor(diffInSeconds / 60);
    const diffInHours = Math.floor(diffInMinutes / 60);
    const diffInDays = Math.floor(diffInHours / 24);

    if (diffInSeconds < 60) {
      return 'Just now';
    } else if (diffInMinutes < 60) {
      return `${diffInMinutes} min ago`;
    } else if (diffInHours < 24) {
      return `${diffInHours} hr ago`;
    } else if (diffInDays === 1) {
      return 'Yesterday';
    } else if (diffInDays < 7) {
      return `${diffInDays} days ago`;
    } else if (diffInDays < 30) {
      const weeks = Math.floor(diffInDays / 7);
      return `${weeks} week${weeks > 1 ? 's' : ''} ago`;
    } else {
      return timestamp.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: diffInDays > 365 ? 'numeric' : undefined
      });
    }
  };

  const markAlertAsRead = (alertId) => {
    setAlerts(prevAlerts =>
      prevAlerts.map(alert =>
        alert.id === alertId ? { ...alert, read: true } : alert
      )
    );
    setAlertCount(prev => Math.max(0, prev - 1));
  };

  const markAllAlertsAsRead = () => {
    setAlerts(prevAlerts =>
      prevAlerts.map(alert => ({ ...alert, read: true }))
    );
    setAlertCount(0);
  };

  const getAlertIcon = (type) => {
    switch (type) {
      case 'weather': return <CloudRain className="w-4 h-4" />;
      case 'disaster': return <AlertTriangle className="w-4 h-4" />;
      case 'cyclone': return <Wind className="w-4 h-4" />;
      default: return <Bell className="w-4 h-4" />;
    }
  };

  const getSeverityColor = (severity) => {
    switch (severity) {
      case 'high': return 'bg-red-500';
      case 'medium': return 'bg-orange-500';
      case 'low': return 'bg-yellow-500';
      default: return 'bg-blue-500';
    }
  };

  const getSeverityText = (severity) => {
    switch (severity) {
      case 'high': return 'High Alert';
      case 'medium': return 'Medium Alert';
      case 'low': return 'Low Alert';
      default: return 'Information';
    }
  };

  const getDataSourceBadge = (dataSource) => {
    switch (dataSource) {
      case 'imd':
        return { text: 'IMD', color: 'bg-blue-500/20 text-blue-300' };
      case 'ksndmc':
        return { text: 'KSNDMC', color: 'bg-green-500/20 text-green-300' };
      case 'usgs':
        return { text: 'USGS', color: 'bg-orange-500/20 text-orange-300' };
      default:
        return { text: 'System', color: 'bg-purple-500/20 text-purple-300' };
    }
  };

  useEffect(() => {
    // Fetch alerts when location changes
    if (location) {
      fetchGovernmentAlerts(location.name);
    } else {
      fetchGovernmentAlerts();
    }
  }, [location]);

  const fetchSearchEngineStats = async () => {
    try {
      const response = await fetch('https://my-backend.onrender.com/api/search/stats');
      if (response.ok) {
        const data = await response.json();
        setSearchEngineStats(data);
      }
    } catch (error) {
      console.error('Error fetching search stats:', error);
    }
  };

  const initializeMap = () => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
    }

    markersRef.current.forEach(marker => marker.remove());
    markersRef.current = [];

    mapInstanceRef.current = L.map(mapRef.current).setView([location.lat, location.lon], 13);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 18,
    }).addTo(mapInstanceRef.current);

    const mainMarker = L.marker([location.lat, location.lon])
      .addTo(mapInstanceRef.current)
      .bindPopup(`
        <div class="text-center">
          <strong>${location.name}</strong><br/>
          <em>Selected Location</em>
        </div>
      `);

    markersRef.current.push(mainMarker);

    if (activityPlaces.length > 0) {
      updateMapMarkers();
    }
  };

  const updateMapMarkers = () => {
    const mainMarker = markersRef.current[0];
    markersRef.current.forEach((marker, index) => {
      if (index > 0) marker.remove();
    });
    markersRef.current = mainMarker ? [mainMarker] : [];

    const redIcon = new L.Icon({
      iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
      shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
      iconSize: [25, 41],
      iconAnchor: [12, 41],
      popupAnchor: [1, -34],
      shadowSize: [41, 41]
    });

    activityPlaces.forEach(place => {
      const marker = L.marker([place.lat, place.lon], { icon: redIcon })
        .addTo(mapInstanceRef.current)
        .bindPopup(`
          <div class="text-center">
            <strong>${place.name}</strong><br/>
            <em>${place.type}</em><br/>
            <small>${place.address.split(',').slice(0, 2).join(',')}</small>
          </div>
        `);

      markersRef.current.push(marker);
    });

    if (activityPlaces.length > 0) {
      const group = new L.featureGroup(markersRef.current);
      mapInstanceRef.current.fitBounds(group.getBounds().pad(0.1));
    }
  };

  // Update your searchLocations function in React
  const searchLocations = async (query) => {
    if (!query || query.trim().length < 2) {
      setSearchResults([]);
      return;
    }

    try {
      // Ensure we're sending the exact format the backend expects
      const requestBody = {
        query: query.trim()
      };

      console.log('Sending location search request:', requestBody);

      const response = await fetch('https://my-backend.onrender.com/api/location/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody)
      });

      if (response.ok) {
        const data = await response.json();
        setSearchResults(data.locations || []);
        console.log(`Found ${data.locations?.length || 0} locations`);
      } else {
        console.error('Location search failed with status:', response.status);
        const errorText = await response.text();
        console.error('Error response:', errorText);
        setSearchResults([]);
      }
    } catch (error) {
      console.error('Error searching locations:', error);
      setSearchResults([]);
    }
  };

  // Also update the places search function
  const fetchActivityPlaces = async () => {
    if (!location || !activity) return;

    try {
      setSearchingPlaces(true);
      setMapLoading(true);
      setHasSearchedPlaces(true);
      setSearchStats(null);

      // Ensure correct request format
      const requestData = {
        lat: parseFloat(location.lat),
        lon: parseFloat(location.lon),
        activity: activity,
        locationName: location.name
      };

      console.log('Sending places search request:', requestData);

      const response = await fetch('https://my-backend.onrender.com/api/places/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestData)
      });

      if (response.ok) {
        const data = await response.json();
        setActivityPlaces(data.places || []);
        setSearchStats(data);
      } else if (response.status === 422) {
        console.error('Validation error - checking request format');
        // Debug the error
        const errorData = await response.json();
        console.error('Validation error details:', errorData);

        // Try the debug endpoint
        await fetch('https://my-backend.onrender.com/api/debug/request-format', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestData)
        });
      }
    } catch (error) {
      console.error('Error fetching activity places:', error);
      setActivityPlaces([]);
    } finally {
      setSearchingPlaces(false);
      setMapLoading(false);
    }
  };

  const handleSearchPlaces = () => {
    if (!location) {
      alert("Please select a location first");
      return;
    }
    if (!activity) {
      alert("Please select an activity first");
      return;
    }
    fetchActivityPlaces();
  };

  const globalLocations = useMemo(() => [
    // Kerala Locations
    { name: 'Kanjirapally', lat: 9.7478, lon: 76.6679, country: 'India', emoji: '🌴', region: 'Kerala' },
    { name: 'Kochi', lat: 9.9312, lon: 76.2673, country: 'India', emoji: '🛳️', region: 'Kerala' },
    { name: 'Thiruvananthapuram', lat: 8.5241, lon: 76.9366, country: 'India', emoji: '🏛️', region: 'Kerala' },
    { name: 'Kozhikode', lat: 11.2588, lon: 75.7804, country: 'India', emoji: '🌊', region: 'Kerala' },
    { name: 'Munnar', lat: 10.0889, lon: 77.0595, country: 'India', emoji: '🏔️', region: 'Kerala' },
    { name: 'Alappuzha', lat: 9.4981, lon: 76.3388, country: 'India', emoji: '🚤', region: 'Kerala' },
    { name: 'Thrissur', lat: 10.5276, lon: 76.2144, country: 'India', emoji: '🐘', region: 'Kerala' },
    { name: 'Kollam', lat: 8.8932, lon: 76.6141, country: 'India', emoji: '🏖️', region: 'Kerala' },
    { name: 'Palakkad', lat: 10.7867, lon: 76.6548, country: 'India', emoji: '🌳', region: 'Kerala' },
    { name: 'Kannur', lat: 11.8745, lon: 75.3704, country: 'India', emoji: '🎭', region: 'Kerala' },
    { name: 'Kottayam', lat: 9.5916, lon: 76.5222, country: 'India', emoji: '📚', region: 'Kerala' },
    { name: 'Idukki', lat: 9.9189, lon: 77.1025, country: 'India', emoji: '🌄', region: 'Kerala' },
    { name: 'Wayanad', lat: 11.6854, lon: 76.1320, country: 'India', emoji: '🌿', region: 'Kerala' },
    { name: 'Pathanamthitta', lat: 9.2648, lon: 76.7870, country: 'India', emoji: '🛕', region: 'Kerala' },
    { name: 'Malappuram', lat: 11.0732, lon: 76.0740, country: 'India', emoji: '📖', region: 'Kerala' },
    { name: 'Kasargod', lat: 12.4996, lon: 74.9869, country: 'India', emoji: '🏰', region: 'Kerala' },
    { name: 'Perumbavoor', lat: 10.1151, lon: 76.4770, country: 'India', emoji: '🏭', region: 'Kerala' },
    { name: 'Thodupuzha', lat: 9.8943, lon: 76.7176, country: 'India', emoji: '⛰️', region: 'Kerala' },
    { name: 'Changanassery', lat: 9.4428, lon: 76.5368, country: 'India', emoji: '⛪', region: 'Kerala' },
    { name: 'Pala', lat: 9.7128, lon: 76.6825, country: 'India', emoji: '🌅', region: 'Kerala' },

    // Other Indian Cities
    { name: 'Bangalore', lat: 12.9716, lon: 77.5946, country: 'India', emoji: '💻', region: 'Karnataka' },
    { name: 'Mumbai', lat: 19.0760, lon: 72.8777, country: 'India', emoji: '🎬', region: 'Maharashtra' },
    { name: 'Delhi', lat: 28.6139, lon: 77.2090, country: 'India', emoji: '🏛️', region: 'Delhi' },
    { name: 'Chennai', lat: 13.0827, lon: 80.2707, country: 'India', emoji: '🎭', region: 'Tamil Nadu' },
    { name: 'Kolkata', lat: 22.5726, lon: 88.3639, country: 'India', emoji: '🚎', region: 'West Bengal' },
    { name: 'Hyderabad', lat: 17.3850, lon: 78.4867, country: 'India', emoji: '💎', region: 'Telangana' },

    // North America
    { name: 'New York', lat: 40.7128, lon: -74.0060, country: 'USA', emoji: '🗽', region: 'North America' },
    { name: 'Los Angeles', lat: 34.0522, lon: -118.2437, country: 'USA', emoji: '🌴', region: 'North America' },
    { name: 'Toronto', lat: 43.6532, lon: -79.3832, country: 'Canada', emoji: '🍁', region: 'North America' },

    // Europe
    { name: 'London', lat: 51.5074, lon: -0.1278, country: 'UK', emoji: '🇬🇧', region: 'Europe' },
    { name: 'Paris', lat: 48.8566, lon: 2.3522, country: 'France', emoji: '🗼', region: 'Europe' },

    // Asia
    { name: 'Tokyo', lat: 35.6762, lon: 139.6503, country: 'Japan', emoji: '🇯🇵', region: 'Asia' },
    { name: 'Singapore', lat: 1.3521, lon: 103.8198, country: 'Singapore', emoji: '🦁', region: 'Asia' },
    { name: 'Dubai', lat: 25.2048, lon: 55.2708, country: 'UAE', emoji: '🏜️', region: 'Asia' },
  ], []);

  const activities = [
    { id: 'beach', name: 'Beach', icon: Waves, gradient: 'from-cyan-400 to-blue-500' },
    { id: 'hiking', name: 'Hiking', icon: Mountain, gradient: 'from-green-400 to-emerald-600' },
    { id: 'camping', name: 'Camping', icon: Cloud, gradient: 'from-orange-400 to-red-500' },
    { id: 'picnic', name: 'Picnic', icon: Sun, gradient: 'from-yellow-400 to-orange-500' },
    { id: 'sports', name: 'Sports', icon: Activity, gradient: 'from-purple-400 to-pink-500' },
    { id: 'photo', name: 'Photo', icon: Eye, gradient: 'from-indigo-400 to-purple-500' }
  ];

  const generateExportData = () => {
    const activityInfo = activities.find(a => a.id === activity);
    const scores = calculateRiskScores(weatherData);

    const baseData = {
      metadata: {
        generated: new Date().toISOString(),
        version: '1.0',
        software: 'WeatherWise Pro',
        location: location.name,
        country: location.country,
        coordinates: { lat: location.lat, lon: location.lon },
        activity: activityInfo.name,
        date_range: customDateRange ?
          { start: exportStartDate, end: exportEndDate } :
          { start: startDate, end: endDate }
      },
      raw_data: weatherData,
      probabilities: {
        risk_scores: scores,
        activity_suitability: calculateActivitySuitability(scores, activity),
        weather_patterns: generateWeatherPatterns()
      },
      trends: {
        historical: historicalTrends,
        forecast: forecast,
        seasonal_analysis: generateSeasonalAnalysis()
      }
    };

    return baseData;
  };

  const calculateActivitySuitability = (scores, activityType) => {
    const baseScore = 100 - (scores.overall * 8);
    let activityModifier = 0;

    switch (activityType) {
      case 'beach':
        activityModifier = scores.rain > 5 ? -20 : 10;
        break;
      case 'hiking':
        activityModifier = scores.wind > 6 ? -15 : 5;
        break;
      case 'camping':
        activityModifier = scores.rain > 3 ? -25 : 0;
        break;
      default:
        activityModifier = 0;
    }

    return Math.max(0, Math.min(100, baseScore + activityModifier));
  };

  const generateWeatherPatterns = () => {
    return {
      pattern_type: weatherData.temperature > 80 ? 'warm' : 'moderate',
      stability_index: Math.round(85 - (weatherData.windSpeed * 2)),
      precipitation_probability: Math.round(weatherData.precipitation * 33),
      trend_direction: 'stable'
    };
  };

  const generateSeasonalAnalysis = () => {
    return {
      current_season: getCurrentSeason(),
      seasonal_normals: {
        temperature: weatherData.historical.avgTemp,
        precipitation: weatherData.historical.avgPrecip,
        wind: weatherData.historical.avgWind
      },
      anomalies: {
        temperature: weatherData.temperature - weatherData.historical.avgTemp,
        precipitation: weatherData.precipitation - weatherData.historical.avgPrecip
      }
    };
  };

  const getCurrentSeason = () => {
    const month = new Date().getMonth();
    if (month >= 2 && month <= 4) return 'Spring';
    if (month >= 5 && month <= 7) return 'Summer';
    if (month >= 8 && month <= 10) return 'Fall';
    return 'Winter';
  };

  const exportToCSV = (data) => {
    let csv = 'WeatherWise Pro Data Export\n\n';

    // Metadata
    csv += 'METADATA\n';
    csv += 'Generated,Version,Software,Location,Activity\n';
    csv += `${data.metadata.generated},${data.metadata.version},${data.metadata.software},${data.metadata.location},${data.metadata.activity}\n\n`;

    // Weather Data
    csv += 'WEATHER_DATA\n';
    csv += 'Temperature,Wind Speed,Precipitation,Humidity,UV Index\n';
    csv += `${data.raw_data.temperature},${data.raw_data.windSpeed},${data.raw_data.precipitation},${data.raw_data.humidity},${data.raw_data.uvIndex}\n\n`;

    // Risk Scores
    csv += 'RISK_SCORES\n';
    csv += 'Overall,Heat,Cold,Wind,Rain,UV\n';
    csv += `${data.probabilities.risk_scores.overall},${data.probabilities.risk_scores.heat},${data.probabilities.risk_scores.cold},${data.probabilities.risk_scores.wind},${data.probabilities.risk_scores.rain},${data.probabilities.risk_scores.uv}\n`;

    return csv;
  };


  const handleAdvancedExport = () => {
    const exportData = generateExportData();
    let content, mimeType, extension;

    switch (exportFormat) {
      case 'CSV':
        content = exportToCSV(exportData);
        mimeType = 'text/csv';
        extension = 'csv';
        break;
      case 'JSON':
        content = JSON.stringify(exportData, null, 2);
        mimeType = 'application/json';
        extension = 'json';
        break;
      default:
        content = JSON.stringify(exportData, null, 2);
        mimeType = 'application/json';
        extension = 'json';
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `weatherwise-${location.name}-${Date.now()}.${extension}`;
    a.click();
    URL.revokeObjectURL(url);

    setShowExportModal(false);
  };

  const toggleExportInclude = (item) => {
    if (exportIncludes.includes(item)) {
      setExportIncludes(exportIncludes.filter(i => i !== item));
    } else {
      setExportIncludes([...exportIncludes, item]);
    }
  };

  const handleSearch = async (query) => {
    setSearchQuery(query);

    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);

    const lowercaseQuery = query.toLowerCase().trim();

    const localResults = globalLocations.filter(loc =>
      loc.name.toLowerCase().includes(lowercaseQuery) ||
      loc.country.toLowerCase().includes(lowercaseQuery) ||
      loc.region.toLowerCase().includes(lowercaseQuery)
    ).sort((a, b) => {
      const aNameMatch = a.name.toLowerCase().startsWith(lowercaseQuery);
      const bNameMatch = b.name.toLowerCase().startsWith(lowercaseQuery);

      if (aNameMatch && !bNameMatch) return -1;
      if (!aNameMatch && bNameMatch) return 1;

      return a.name.localeCompare(b.name);
    });

    setSearchResults(localResults.slice(0, 15));
    setIsSearching(false);
  };

  const handleCompareSearch = async (query) => {
    setCompareSearchQuery(query);

    if (!query.trim()) {
      setCompareSearchResults([]);
      return;
    }

    setIsCompareSearching(true);

    const lowercaseQuery = query.toLowerCase().trim();

    const localResults = globalLocations.filter(loc =>
      (loc.name.toLowerCase().includes(lowercaseQuery) ||
        loc.country.toLowerCase().includes(lowercaseQuery) ||
        loc.region.toLowerCase().includes(lowercaseQuery)) &&
      !compareLocations.find(cl => cl.name === loc.name)
    ).sort((a, b) => {
      const aNameMatch = a.name.toLowerCase().startsWith(lowercaseQuery);
      const bNameMatch = b.name.toLowerCase().startsWith(lowercaseQuery);

      if (aNameMatch && !bNameMatch) return -1;
      if (!aNameMatch && bNameMatch) return 1;

      return a.name.localeCompare(b.name);
    });

    setCompareSearchResults(localResults.slice(0, 10));
    setIsCompareSearching(false);
  };

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (searchQuery) {
        handleSearch(searchQuery);
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [searchQuery]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (compareSearchQuery) {
        handleCompareSearch(compareSearchQuery);
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [compareSearchQuery]);

  const getCurrentLocation = () => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation is not supported'));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const { latitude, longitude } = position.coords;

          try {
            const response = await fetch(
              `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`
            );
            const data = await response.json();

            resolve({
              name: data.city || data.locality || 'Current Location',
              country: data.countryName,
              lat: latitude,
              lon: longitude,
              emoji: '📍',
              region: 'Current Location',
              isCurrentLocation: true
            });
          } catch (error) {
            resolve({
              name: 'Current Location',
              country: '',
              lat: latitude,
              lon: longitude,
              emoji: '📍',
              region: 'Current Location',
              isCurrentLocation: true
            });
          }
        },
        (error) => {
          reject(error);
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 60000
        }
      );
    });
  };

  const handleUseCurrentLocation = async () => {
    setUseCurrentLocation(true);
    setIsSearching(true);

    try {
      const currentLocation = await getCurrentLocation();
      selectLocation(currentLocation);
    } catch (error) {
      console.error('Error getting current location:', error);
      alert('Unable to get your current location. Please check location permissions.');
    } finally {
      setUseCurrentLocation(false);
      setIsSearching(false);
    }
  };

  const selectLocation = (loc) => {
    setLocation(loc);
    setSearchQuery('');
    setSearchResults([]);
    setShowLocationSearch(false);
    setActivityPlaces([]);
    setHasSearchedPlaces(false);
    setSearchStats(null);
  };

  const selectCompareLocation = (loc) => {
    addCompareLocation(loc);
    setCompareSearchQuery('');
    setCompareSearchResults([]);
    setShowCompareSearch(false);
  };

  const calculateRiskScores = (data) => {
    const scores = {
      heat: 0,
      cold: 0,
      wind: 0,
      rain: 0,
      uv: 0,
      overall: 0
    };

    const avgTemp = data.temperature || 70;
    if (avgTemp > 90) scores.heat = Math.min(10, (avgTemp - 90) / 2);
    else if (avgTemp < 50) scores.cold = Math.min(10, (50 - avgTemp) / 3);

    const avgWind = data.windSpeed || 10;
    if (avgWind > 15) scores.wind = Math.min(10, (avgWind - 15) / 3);

    const avgPrecip = data.precipitation || 0;
    scores.rain = Math.min(10, avgPrecip * 2);

    scores.uv = Math.min(10, data.uvIndex || 0);

    scores.overall = Math.round((scores.heat + scores.cold + scores.wind + scores.rain + scores.uv) / 5);

    return scores;
  };

  const generateAIAdvice = async (weatherData, activityType, locationData) => {
    setLoading(true);
    try {
      const activityInfo = activities.find(a => a.id === activityType);

      const mockResponse = `EXCELLENT conditions for ${activityInfo.name} in ${locationData.name}! 

With pleasant temperatures around ${weatherData.temperature}°F and manageable winds of ${weatherData.windSpeed} mph, conditions are ideal. The low precipitation (${weatherData.precipitation}") means you'll have dry conditions perfect for outdoor activities.

PRO TIP: Schedule your ${activityInfo.name} during mid-morning to avoid peak UV hours while enjoying the best light conditions.

RISK MITIGATION: Stay hydrated and use sunscreen with the UV index at ${weatherData.uvIndex}. Monitor wind conditions as they may pick up in the afternoon.

BEST TIMING: 9 AM - 3 PM for optimal weather conditions and comfort.`;

      setTimeout(() => {
        setAiAdvice(mockResponse);
        setLoading(false);
      }, 2000);

    } catch (error) {
      console.error("Error:", error);
      setAiAdvice("Unable to generate analysis. Please try again.");
      setLoading(false);
    }
  };

  const generateForecast = (baseData) => {
    const days = [];
    const start = new Date(startDate);
    const end = new Date(endDate);
    const daysDiff = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;

    for (let i = 0; i < Math.min(daysDiff, 7); i++) {
      const date = new Date(start);
      date.setDate(start.getDate() + i);

      const tempVariation = Math.sin(i * 0.5) * 10;
      const baseTemp = baseData.temperature;

      days.push({
        date: date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
        temp: Math.round(baseTemp + tempVariation),
        high: Math.round(baseTemp + tempVariation + 8),
        low: Math.round(baseTemp + tempVariation - 8),
        precipitation: Math.round(Math.random() * 30),
        wind: Math.round(8 + Math.random() * 12),
        condition: i % 3 === 0 ? 'sunny' : i % 3 === 1 ? 'cloudy' : 'rainy'
      });
    }
    setForecast(days);
  };

  const generateHistoricalTrends = (baseData) => {
    const years = ['2020', '2021', '2022', '2023', '2024'];
    const trends = years.map(year => ({
      year,
      avgTemp: Math.round(baseData.historical.avgTemp + (Math.random() - 0.5) * 10),
      avgPrecip: (baseData.historical.avgPrecip + (Math.random() - 0.5) * 0.5).toFixed(1),
      extremeEvents: Math.floor(Math.random() * 5)
    }));
    setHistoricalTrends(trends);
  };

  const fetchWeatherData = async () => {
    setLoading(true);
    setAiAdvice('');

    try {
      const baseTemp = location.lat > 35 ? 78 : 68;
      const tempVariation = Math.random() * 20 - 10;

      const mockData = {
        temperature: Math.round(baseTemp + tempVariation),
        windSpeed: Math.round(8 + Math.random() * 12),
        precipitation: Math.round(Math.random() * 3 * 10) / 10,
        humidity: Math.round(50 + Math.random() * 30),
        cloudCover: Math.round(30 + Math.random() * 40),
        uvIndex: Math.round(4 + Math.random() * 6),
        visibility: Math.round(8 + Math.random() * 4),
        dewPoint: Math.round(baseTemp - 15 + Math.random() * 10),
        pressure: Math.round(1010 + Math.random() * 20),
        historical: {
          avgTemp: baseTemp,
          avgPrecip: 0.5,
          avgWind: 10,
          recordHigh: baseTemp + 20,
          recordLow: baseTemp - 25
        }
      };

      setWeatherData(mockData);
      await generateAIAdvice(mockData, activity, location);
      generateForecast(mockData);
      generateHistoricalTrends(mockData);

    } catch (error) {
      console.error("Error:", error);
      alert("Failed to fetch weather data.");
    } finally {
      setLoading(false);
    }
  };

  const handleAnalyze = () => {
    if (!startDate || !endDate) {
      alert("Please select both dates");
      return;
    }
    fetchWeatherData();
  };

  const addCompareLocation = async (loc) => {
    if (compareLocations.length >= 3) {
      alert("Maximum 3 locations can be compared");
      return;
    }

    if (compareLocations.find(l => l.name === loc.name)) {
      alert("Location already added for comparison");
      return;
    }

    const baseTemp = loc.lat > 35 ? 78 : 68;
    const mockData = {
      temperature: Math.round(baseTemp + (Math.random() - 0.5) * 20),
      windSpeed: Math.round(8 + Math.random() * 12),
      precipitation: Math.round(Math.random() * 3 * 10) / 10,
      uvIndex: Math.round(4 + Math.random() * 6),
    };

    setCompareLocations([...compareLocations, loc]);
    setCompareData({ ...compareData, [loc.name]: mockData });
  };

  const removeCompareLocation = (locName) => {
    setCompareLocations(compareLocations.filter(l => l.name !== locName));
    const newData = { ...compareData };
    delete newData[locName];
    setCompareData(newData);
  };

  const downloadReport = () => {
    if (!weatherData) return;

    const activityInfo = activities.find(a => a.id === activity);
    const scores = calculateRiskScores(weatherData);

    const report = `WEATHERWISE PRO REPORT
Generated: ${new Date().toLocaleString()}

LOCATION: ${location.name}, ${location.country}
ACTIVITY: ${activityInfo.name}
DATES: ${startDate} to ${endDate}

WEATHER:
Temp: ${weatherData.temperature}°F
Wind: ${weatherData.windSpeed} mph
Precip: ${weatherData.precipitation}"
Humidity: ${weatherData.humidity}%
UV: ${weatherData.uvIndex}

RISK SCORES:
Overall: ${scores.overall}/10
Heat: ${scores.heat.toFixed(1)}/10
Cold: ${scores.cold.toFixed(1)}/10
Wind: ${scores.wind.toFixed(1)}/10
Rain: ${scores.rain.toFixed(1)}/10

AI ANALYSIS:
${aiAdvice}`;

    const blob = new Blob([report], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `weatherwise-${location.name}-${Date.now()}.txt`;
    a.click();
  };

  const riskScores = weatherData ? calculateRiskScores(weatherData) : null;

  const getRiskColor = (score) => {
    if (score < 3) return 'from-green-500 to-emerald-500';
    if (score < 6) return 'from-yellow-500 to-orange-500';
    return 'from-red-500 to-pink-500';
  };

  const getRiskBg = (score) => {
    if (score < 3) return 'bg-green-500/10 border-green-500/30';
    if (score < 6) return 'bg-yellow-500/10 border-yellow-500/30';
    return 'bg-red-500/10 border-red-500/30';
  };

  const getRiskLabel = (score) => {
    if (score < 3) return 'Low Risk';
    if (score < 6) return 'Moderate';
    return 'High Risk';
  };

  const getWeatherIcon = (condition) => {
    if (condition === 'sunny') return <Sun className="w-8 h-8 text-yellow-400" />;
    if (condition === 'cloudy') return <Cloud className="w-8 h-8 text-gray-400" />;
    return <CloudRain className="w-8 h-8 text-blue-400" />;
  };

  return (
    <div className="min-h-screen bg-black text-white relative overflow-hidden">
      {/* Enhanced Background */}
      <div className="fixed inset-0 z-0">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-950 via-purple-950 to-black"></div>
        <div className="absolute top-0 left-0 w-full h-full">
          <div className="absolute top-20 left-20 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute bottom-20 right-20 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-cyan-500/10 rounded-full blur-3xl animate-float"></div>
        </div>
        <div className="absolute inset-0 grid-pattern-dense"></div>
      </div>

      <div className={`relative z-10 transition-all duration-1000 ${animateIn ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}>

        {/* Enhanced Header */}
        <header className="relative border-b border-white/10 backdrop-blur-ultra z-50">
          <div className="absolute inset-0 bg-gradient-to-b from-black/90 to-transparent"></div>
          <div className="relative max-w-7xl mx-auto px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="relative">
                  <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-purple-500 rounded-2xl blur-xl opacity-50 animate-pulse-glow"></div>
                  <div className="relative bg-gradient-to-br from-blue-500 to-purple-600 p-3 rounded-2xl shadow-lg">
                    <Cloud className="w-8 h-8" />
                  </div>
                </div>
                <div>
                  <h1 className="text-3xl font-bold gradient-text-premium">
                    WeatherWise Pro
                  </h1>
                  <p className="text-sm text-gray-300 flex items-center gap-1">
                    <Shield className="w-3 h-3 text-green-400" />
                    AI-Powered Activity Intelligence
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-4">
                {/* Alert Button */}
                <div className="relative">
                  <button
                    onClick={() => setShowAlerts(!showAlerts)}
                    className="relative group btn-glow"
                  >
                    <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
                    <div className="absolute inset-0 bg-gradient-to-r from-orange-500 to-red-500 rounded-xl blur-lg opacity-50 group-hover:opacity-75 transition-opacity"></div>
                    <div className="relative bg-gradient-to-r from-orange-500 to-red-500 px-4 py-2 rounded-xl font-semibold flex items-center gap-2 shadow-lg">
                      <AlertTriangle className="w-4 h-4" />
                      <span>Alerts</span>
                      {alertCount > 0 && (
                        <span className="bg-white text-red-600 text-xs px-2 py-1 rounded-full font-bold min-w-5">
                          {alertCount}
                        </span>
                      )}
                    </div>
                  </button>

                  {/* Alert Dropdown - Enhanced with Real-time Data */}
                  {showAlerts && (
                    <div className="fixed top-20 right-6 w-96 bg-black/95 backdrop-blur-xl border border-white/20 rounded-2xl shadow-2xl z-[100] overflow-hidden">
                      <div className="p-4 border-b border-white/10">
                        <div className="flex items-center justify-between">
                          <h3 className="text-lg font-bold flex items-center gap-2">
                            <AlertTriangle className="w-5 h-5 text-orange-400" />
                            Real-Time Alerts
                            <span className="text-xs bg-green-500/20 text-green-300 px-2 py-1 rounded-full">
                              Live
                            </span>
                          </h3>
                          <div className="flex items-center gap-2">
                            {alertCount > 0 && (
                              <button
                                onClick={markAllAlertsAsRead}
                                className="text-xs text-gray-400 hover:text-white transition-colors"
                              >
                                Mark all read
                              </button>
                            )}
                            <button
                              onClick={() => setShowAlerts(false)}
                              className="text-gray-400 hover:text-white transition-colors"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                        <p className="text-sm text-gray-400 mt-1">
                          Real-time monitoring for {location ? location.name : 'your region'}
                        </p>
                      </div>

                      <div className="max-h-96 overflow-y-auto">
                        {loadingAlerts ? (
                          <div className="flex items-center justify-center py-8">
                            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-orange-500"></div>
                            <span className="ml-2 text-gray-400">Loading live alerts...</span>
                          </div>
                        ) : alerts.length === 0 ? (
                          <div className="text-center py-8 text-gray-400">
                            <Bell className="w-12 h-12 mx-auto mb-3 opacity-50" />
                            <p>No active alerts</p>
                            <p className="text-sm mt-1">All systems normal</p>
                          </div>
                        ) : (
                          <div className="divide-y divide-white/10">
                            {alerts.map((alert) => {
                              const dataSourceBadge = getDataSourceBadge(alert.dataSource);
                              return (
                                <div
                                  key={alert.id}
                                  className={`p-4 hover:bg-white/5 transition-colors cursor-pointer ${!alert.read ? 'bg-orange-500/10' : ''
                                    }`}
                                  onClick={() => markAlertAsRead(alert.id)}
                                >
                                  <div className="flex items-start gap-3">
                                    <div className={`w-2 h-2 mt-2 rounded-full ${getSeverityColor(alert.severity)}`}></div>
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                                        {getAlertIcon(alert.type)}
                                        <span className={`text-xs font-semibold px-2 py-1 rounded-full ${alert.severity === 'high' ? 'bg-red-500/20 text-red-300' :
                                          alert.severity === 'medium' ? 'bg-orange-500/20 text-orange-300' :
                                            'bg-yellow-500/20 text-yellow-300'
                                          }`}>
                                          {getSeverityText(alert.severity)}
                                        </span>
                                        <div className="w-px h-4 bg-white/20"></div>
                                        {alert.official && (
                                          <span className="text-xs bg-green-500/20 text-green-300 px-2 py-1 rounded-full">
                                            Official
                                          </span>
                                        )}
                                        <span className={`text-xs ${dataSourceBadge.color} px-2 py-1 rounded-full`}>
                                          {dataSourceBadge.text}
                                        </span>
                                      </div>
                                      <h4 className="font-semibold text-sm mb-1">{alert.title}</h4>
                                      <p className="text-sm text-gray-300 mb-2">{alert.message}</p>
                                      <div className="flex items-center justify-between text-xs text-gray-400">
                                        <div className="flex items-center gap-4">
                                          <span>{alert.location}</span>
                                          <span>Source: {alert.source}</span>
                                        </div>
                                        <span className="text-orange-300">
                                          Updated {getRelativeTime(alert.timestamp)}
                                        </span>
                                      </div>
                                    </div>
                                    {!alert.read && (
                                      <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse flex-shrink-0 mt-2"></div>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      <div className="p-3 border-t border-white/10 bg-black/50">
                        <div className="flex items-center justify-between text-xs text-gray-400">
                          <span>Data sources: IMD, USGS, OpenWeatherMap, KSNDMC</span>
                          <div className="flex items-center gap-2">
                            <span className="text-green-400">●</span>
                            <span>Auto-refresh: 5 min</span>
                            <button
                              onClick={() => fetchGovernmentAlerts(location?.name)}
                              className="text-orange-400 hover:text-orange-300 transition-colors ml-2"
                            >
                              Refresh Now
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="hidden md:flex items-center gap-2 px-4 py-2 glass rounded-xl border border-white/10">
                  <Database className="w-4 h-4 text-blue-400" />
                  <span className="text-sm text-gray-300">NASA Data</span>
                </div>
                <button className="relative group btn-glow">
                  <div className="absolute inset-0 bg-gradient-to-r from-yellow-500 to-orange-500 rounded-xl blur-lg opacity-50 group-hover:opacity-75 transition-opacity"></div>
                  <div className="relative bg-gradient-to-r from-yellow-500 to-orange-500 px-6 py-2 rounded-xl font-semibold flex items-center gap-2 shadow-lg">
                    <Star className="w-4 h-4" />
                    <span>Pro</span>
                  </div>
                </button>
              </div>
            </div>
          </div>
        </header>

        {/* Enhanced Navigation */}
        <nav className="max-w-7xl mx-auto px-6 mt-6">
          <div className="glass-strong rounded-2xl p-2">
            <div className="flex gap-1">
              {[
                { id: 'planner', name: 'Activity Planner', icon: Target },
                { id: 'compare', name: 'Compare', icon: Globe },
                { id: 'trends', name: 'Trends', icon: TrendingUp },
                { id: 'forecast', name: 'Forecast', icon: BarChart3 }
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex-1 flex items-center justify-center gap-3 px-4 py-3 rounded-xl font-semibold transition-all duration-300 ${activeTab === tab.id
                    ? 'tab-active shadow-lg'
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                    }`}
                >
                  <tab.icon className="w-5 h-5" />
                  <span className="hidden sm:inline">{tab.name}</span>
                </button>
              ))}
            </div>
          </div>
        </nav>

        <main className="max-w-7xl mx-auto px-6 py-8">
          {activeTab === 'planner' && (
            <div className="space-y-8">
              {/* Enhanced Location & Activity Section */}
              <div className="glass-premium rounded-3xl p-8">
                <div className="flex items-center justify-between mb-8">
                  <div>
                    <h2 className="text-3xl font-bold gradient-text mb-2 flex items-center gap-3">
                      <Compass className="w-8 h-8" />
                      Plan Your Adventure
                    </h2>
                    <p className="text-gray-300">AI-powered weather analysis for your perfect outdoor experience</p>
                  </div>
                  {location && (
                    <div className="flex items-center gap-3 px-4 py-2 glass rounded-xl">
                      <span className="text-2xl">{location.emoji}</span>
                      <div className="text-right">
                        <p className="font-semibold">{location.name}</p>
                        <p className="text-sm text-gray-400">{location.country}</p>
                      </div>
                    </div>
                  )}
                </div>

                <div className="grid lg:grid-cols-2 gap-8">
                  {/* Location Search */}
                  <div className="space-y-6">
                    <div>
                      <label className="block text-sm font-semibold mb-3 text-gray-300 flex items-center gap-2">
                        <Map className="w-4 h-4" />
                        Search Location
                      </label>
                      <div className="relative">
                        <input
                          type="text"
                          placeholder="Enter city, country, or place..."
                          value={searchQuery}
                          onChange={(e) => {
                            setSearchQuery(e.target.value);
                            searchLocations(e.target.value);
                          }}
                          className="input-modern w-full"
                        />
                        <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                      </div>

                      {/* Search Results */}
                      {searchResults.length > 0 && (
                        <div className="mt-2 glass rounded-xl p-3 max-h-60 overflow-y-auto">
                          {searchResults.map((result, index) => (
                            <button
                              key={index}
                              onClick={() => {
                                setLocation(result);
                                setSearchQuery('');
                                setSearchResults([]);
                              }}
                              className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-white/10 transition-all text-left group"
                            >
                              <span className="text-2xl group-hover:scale-110 transition-transform">{result.emoji}</span>
                              <div className="flex-1">
                                <p className="font-semibold group-hover:text-blue-300 transition-colors">{result.name}</p>
                                <p className="text-sm text-gray-400">
                                  {result.state && `${result.state}, `}{result.country}
                                </p>
                              </div>
                              <div className="text-xs text-gray-500 bg-white/5 px-2 py-1 rounded">
                                {result.lat.toFixed(2)}°, {result.lon.toFixed(2)}°
                              </div>
                            </button>
                          ))}
                        </div>
                      )}

                      <button
                        onClick={handleUseCurrentLocation}
                        disabled={useCurrentLocation}
                        className="mt-3 w-full btn-secondary flex items-center justify-center gap-2"
                      >
                        {useCurrentLocation ? (
                          <>
                            <div className="spinner"></div>
                            <span>Detecting Location...</span>
                          </>
                        ) : (
                          <>
                            <Navigation className="w-4 h-4" />
                            <span>Use Current Location</span>
                          </>
                        )}
                      </button>
                    </div>

                    {/* Activity Selection */}
                    <div>
                      <label className="block text-sm font-semibold mb-3 text-gray-300 flex items-center gap-2">
                        <Activity className="w-4 h-4" />
                        Choose Activity
                      </label>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        {activities.map(act => (
                          <button
                            key={act.id}
                            onClick={() => setActivity(act.id)}
                            className={`relative group overflow-hidden rounded-xl p-4 transition-all duration-300 interactive-card ${activity === act.id
                              ? 'ring-2 ring-white scale-105 shadow-lg'
                              : 'hover:scale-105'
                              }`}
                          >
                            <div className={`absolute inset-0 bg-gradient-to-br ${act.gradient} opacity-20 rounded-xl`}></div>
                            <div className="relative text-center">
                              <act.icon className="w-6 h-6 mb-2 mx-auto" />
                              <p className="font-bold text-sm">{act.name}</p>
                            </div>
                          </button>
                        ))}
                      </div>

                      {/* Search Places Button */}
                      <button
                        onClick={handleSearchPlaces}
                        disabled={!location || !activity || searchingPlaces}
                        className="w-full mt-4 btn-primary flex items-center justify-center gap-2"
                      >
                        {searchingPlaces ? (
                          <>
                            <div className="spinner"></div>
                            <span>Searching {activities.find(a => a.id === activity)?.name} Places...</span>
                          </>
                        ) : (
                          <>
                            <Search className="w-5 h-5" />
                            <span>Search {activities.find(a => a.id === activity)?.name} Places</span>
                          </>
                        )}
                      </button>

                      {/* NEW: Search Performance Stats */}
                      {searchStats && (
                        <div className="mt-3 p-3 bg-white/5 rounded-xl border border-white/10">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-gray-400">Search Source:</span>
                            <span className="text-blue-400 font-semibold capitalize">{searchStats.source}</span>
                          </div>
                          {searchStats.local_results !== undefined && (
                            <div className="flex items-center justify-between text-xs mt-1">
                              <span className="text-gray-400">Local Results:</span>
                              <span className="text-green-400">{searchStats.local_results}</span>
                            </div>
                          )}
                          {searchStats.api_results !== undefined && (
                            <div className="flex items-center justify-between text-xs mt-1">
                              <span className="text-gray-400">API Results:</span>
                              <span className="text-yellow-400">{searchStats.api_results}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Date Selection */}
                    <div className="grid md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-semibold mb-2 text-gray-300">Start Date</label>
                        <input
                          type="date"
                          value={startDate}
                          onChange={(e) => setStartDate(e.target.value)}
                          className="input-modern w-full"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold mb-2 text-gray-300">End Date</label>
                        <input
                          type="date"
                          value={endDate}
                          onChange={(e) => setEndDate(e.target.value)}
                          className="input-modern w-full"
                        />
                      </div>
                    </div>

                    <button
                      onClick={handleAnalyze}
                      disabled={loading || !location || !startDate || !endDate}
                      className="w-full btn-primary flex items-center justify-center gap-2"
                    >
                      {loading ? (
                        <>
                          <div className="spinner"></div>
                          <span>Analyzing Weather...</span>
                        </>
                      ) : (
                        <>
                          <Zap className="w-5 h-5" />
                          <span>Analyze Weather Conditions</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Map Section */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <label className="block text-sm font-semibold text-gray-300 flex items-center gap-2">
                        <Map className="w-4 h-4" />
                        Activity Map
                      </label>
                      <button
                        onClick={() => setShowMap(!showMap)}
                        className="btn-secondary flex items-center gap-2 px-3 py-2 text-sm"
                      >
                        <Map className="w-4 h-4" />
                        {showMap ? 'Hide Map' : 'Show Map'}
                      </button>
                    </div>

                    {showMap && location && (
                      <div className="space-y-4">
                        <div
                          ref={mapRef}
                          className="h-80 rounded-2xl overflow-hidden border-2 border-white/20 bg-gray-800 shadow-xl"
                        >
                          {mapLoading && (
                            <div className="w-full h-full flex items-center justify-center">
                              <div className="flex items-center gap-2 text-white">
                                <div className="spinner"></div>
                                <span>Loading map...</span>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Map Legend */}
                        <div className="flex items-center justify-center gap-6 text-sm">
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 bg-blue-500 rounded-full shadow-lg"></div>
                            <span>Selected Location</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 bg-red-500 rounded-full shadow-lg"></div>
                            <span>{activities.find(a => a.id === activity)?.name} Places</span>
                          </div>
                        </div>

                        {/* Activity Places */}
                        {location && (
                          <div className="glass rounded-xl p-4">
                            <p className="text-sm font-semibold mb-3 text-blue-300 flex items-center gap-2">
                              <Sparkles className="w-4 h-4" />
                              {searchingPlaces ? (
                                <span>Searching for {activities.find(a => a.id === activity)?.name} places...</span>
                              ) : hasSearchedPlaces ? (
                                activityPlaces.length > 0 ? (
                                  <span>Nearby {activities.find(a => a.id === activity)?.name} Places ({activityPlaces.length})</span>
                                ) : (
                                  <span>{activities.find(a => a.id === activity)?.name} Places</span>
                                )
                              ) : (
                                <span>{activities.find(a => a.id === activity)?.name} Places</span>
                              )}
                            </p>

                            {searchingPlaces ? (
                              <div className="flex items-center justify-center py-4">
                                <div className="flex items-center gap-2 text-gray-400">
                                  <div className="spinner"></div>
                                  <span>Searching places...</span>
                                </div>
                              </div>
                            ) : hasSearchedPlaces ? (
                              activityPlaces.length > 0 ? (
                                <div className="grid grid-cols-1 gap-2 max-h-32 overflow-y-auto">
                                  {activityPlaces.slice(0, 4).map((place, index) => (
                                    <div key={index} className="flex items-center gap-3 p-2 bg-white/5 rounded-lg hover:bg-white/10 transition-colors">
                                      <div className="w-2 h-2 bg-red-500 rounded-full flex-shrink-0 shadow-lg"></div>
                                      <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium truncate">{place.name}</p>
                                        <p className="text-xs text-gray-400 truncate">{place.type}</p>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div className="text-center py-4 text-gray-400">
                                  <MapPin className="w-8 h-8 mx-auto mb-2 opacity-50" />
                                  <p className="text-sm">No {activities.find(a => a.id === activity)?.name} places found in this area</p>
                                  <p className="text-xs mt-1">Try a different location or activity type</p>
                                </div>
                              )
                            ) : (
                              <div className="text-center py-4 text-gray-400">
                                <Search className="w-8 h-8 mx-auto mb-2 opacity-50" />
                                <p className="text-sm">Click "Search Places" to find locations</p>
                                <p className="text-xs mt-1">Discover nearby spots for your activity</p>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {!location && (
                      <div className="text-center py-12 text-gray-400">
                        <Map className="w-16 h-16 mx-auto mb-4 opacity-50" />
                        <p className="text-lg mb-2">Select a location to view the map</p>
                        <p className="text-sm">Choose a city or use your current location</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Weather Results */}
              {weatherData && (
                <div className="space-y-8">
                  {/* AI Analysis */}
                  <div className="relative">
                    <div className="absolute inset-0 bg-gradient-to-r from-purple-500/20 to-pink-500/20 rounded-3xl blur-xl"></div>
                    <div className="relative glass-premium rounded-3xl p-8">
                      <div className="flex items-start justify-between mb-6">
                        <div className="flex items-start gap-4">
                          <div className="bg-gradient-to-br from-purple-500 to-pink-500 p-3 rounded-xl shadow-lg">
                            <Brain className="w-7 h-7" />
                          </div>
                          <div>
                            <h2 className="text-2xl font-bold mb-1 gradient-text">AI Expert Analysis</h2>
                            <p className="text-sm text-gray-300 flex items-center gap-2">
                              <Shield className="w-3 h-3 text-green-400" />
                              Powered by NASA POWER API & NOAA Climate Data
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setShowExportModal(true)}
                            className="btn-secondary flex items-center gap-2"
                          >
                            <Database className="w-4 h-4" />
                            <span className="hidden sm:inline">Export Data</span>
                          </button>
                        </div>
                      </div>
                      {loading && !aiAdvice ? (
                        <div className="flex items-center gap-3 text-purple-200 py-8 justify-center">
                          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-purple-400"></div>
                          <span>Generating AI analysis...</span>
                        </div>
                      ) : (
                        <div className="prose prose-invert max-w-none">
                          <p className="text-lg leading-relaxed text-gray-100 whitespace-pre-line bg-white/5 rounded-2xl p-6 border border-white/10">
                            {aiAdvice}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Risk Dashboard */}
                  <div className="glass-premium rounded-3xl p-8">
                    <div className="flex items-center gap-3 mb-8">
                      <Gauge className="w-8 h-8 text-blue-400" />
                      <h2 className="text-2xl font-bold gradient-text">Risk Assessment Dashboard</h2>
                    </div>

                    {/* Overall Risk */}
                    <div className={`mb-8 p-8 rounded-2xl border-2 ${getRiskBg(riskScores.overall)}`}>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-gray-300 mb-2">Overall Activity Risk</p>
                          <p className="text-6xl font-bold mb-4">{riskScores.overall}/10</p>
                          <div className={`inline-block px-6 py-3 rounded-full font-semibold bg-gradient-to-r ${getRiskColor(riskScores.overall)} text-white shadow-lg`}>
                            {getRiskLabel(riskScores.overall)} RISK
                          </div>
                        </div>
                        <AlertTriangle className="w-20 h-20 text-yellow-300 opacity-50 animate-pulse-subtle" />
                      </div>
                    </div>

                    {/* Risk Breakdown */}
                    <div className="grid md:grid-cols-2 lg:grid-cols-5 gap-6">
                      {[
                        { key: 'heat', icon: Thermometer, label: 'Heat Risk', color: 'orange' },
                        { key: 'cold', icon: Cloud, label: 'Cold Risk', color: 'blue' },
                        { key: 'wind', icon: Wind, label: 'Wind Risk', color: 'cyan' },
                        { key: 'rain', icon: Droplets, label: 'Rain Risk', color: 'blue' },
                        { key: 'uv', icon: Sun, label: 'UV Risk', color: 'yellow' }
                      ].map(risk => (
                        <div key={risk.key} className="glass rounded-2xl p-6 text-center interactive-card">
                          <div className="flex items-center justify-center gap-2 mb-4">
                            <risk.icon className={`w-6 h-6 text-${risk.color}-400`} />
                            <span className="font-semibold text-sm">{risk.label}</span>
                          </div>
                          <div className="text-3xl font-bold mb-3">{riskScores[risk.key].toFixed(1)}</div>
                          <div className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${getRiskBg(riskScores[risk.key])} border`}>
                            {getRiskLabel(riskScores[risk.key])}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Weather Details */}
                  <div className="glass-premium rounded-3xl p-8">
                    <h2 className="text-2xl font-bold mb-8 gradient-text">Detailed Weather Analysis</h2>

                    {/* Primary Metrics */}
                    <div className="grid md:grid-cols-3 gap-6 mb-8">
                      <div className="bg-gradient-to-br from-orange-500/20 to-red-500/20 rounded-2xl p-6 border border-orange-300/30 interactive-card">
                        <Thermometer className="w-8 h-8 text-orange-300 mb-4" />
                        <p className="text-sm text-orange-200 mb-2">Temperature</p>
                        <p className="text-4xl font-bold mb-2">{weatherData.temperature}°F</p>
                        <div className="risk-gauge mt-4">
                          <div
                            className="risk-gauge-fill"
                            style={{ width: `${riskScores.heat * 10}%` }}
                          ></div>
                        </div>
                      </div>

                      <div className="bg-gradient-to-br from-cyan-500/20 to-blue-500/20 rounded-2xl p-6 border border-cyan-300/30 interactive-card">
                        <Wind className="w-8 h-8 text-cyan-300 mb-4" />
                        <p className="text-sm text-cyan-200 mb-2">Wind Speed</p>
                        <p className="text-4xl font-bold mb-2">{weatherData.windSpeed} mph</p>
                        <div className="risk-gauge mt-4">
                          <div
                            className="risk-gauge-fill"
                            style={{ width: `${riskScores.wind * 10}%` }}
                          ></div>
                        </div>
                      </div>

                      <div className="bg-gradient-to-br from-blue-500/20 to-purple-500/20 rounded-2xl p-6 border border-blue-300/30 interactive-card">
                        <Droplets className="w-8 h-8 text-blue-300 mb-4" />
                        <p className="text-sm text-blue-200 mb-2">Precipitation</p>
                        <p className="text-4xl font-bold mb-2">{weatherData.precipitation}"</p>
                        <div className="risk-gauge mt-4">
                          <div
                            className="risk-gauge-fill"
                            style={{ width: `${riskScores.rain * 10}%` }}
                          ></div>
                        </div>
                      </div>
                    </div>

                    {/* Secondary Metrics */}
                    <div className="grid md:grid-cols-3 gap-6">
                      <div className="glass rounded-2xl p-6 interactive-card">
                        <p className="text-sm text-gray-300 mb-2">Humidity</p>
                        <p className="text-3xl font-bold">{weatherData.humidity}%</p>
                      </div>
                      <div className="glass rounded-2xl p-6 interactive-card">
                        <p className="text-sm text-gray-300 mb-2">Cloud Cover</p>
                        <p className="text-3xl font-bold">{weatherData.cloudCover}%</p>
                      </div>
                      <div className="glass rounded-2xl p-6 interactive-card">
                        <p className="text-sm text-gray-300 mb-2">UV Index</p>
                        <p className="text-3xl font-bold">{weatherData.uvIndex}</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Compare Tab */}
          {activeTab === 'compare' && (
            <div className="space-y-6">
              <div className="glass-premium rounded-3xl p-8">
                <h2 className="text-3xl font-bold mb-6 gradient-text flex items-center gap-3">
                  <Globe className="w-8 h-8" />
                  Compare Locations
                </h2>
                <p className="text-gray-300 mb-6">Add up to 3 locations to compare weather conditions side by side</p>

                {/* Compare Search Bar */}
                <div className="relative mb-6">
                  <label className="block text-sm font-semibold mb-3 text-gray-300 flex items-center gap-2">
                    <Search className="w-4 h-4" />
                    Add Location to Compare
                  </label>
                  <button
                    onClick={() => setShowCompareSearch(!showCompareSearch)}
                    className="w-full bg-white/10 backdrop-blur border border-white/20 rounded-xl p-3 text-left hover:bg-white/15 transition-all flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xl">🔍</span>
                      <div>
                        <p className="font-semibold text-sm">
                          {compareSearchQuery || "Search locations to compare..."}
                        </p>
                        <p className="text-xs text-gray-400">Click to search and add locations</p>
                      </div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-gray-400" />
                  </button>

                  {showCompareSearch && (
                    <div className="absolute top-full left-0 right-0 mt-2 bg-black/95 backdrop-blur-xl border border-white/20 rounded-2xl p-4 z-50 shadow-2xl">
                      <div className="flex items-center justify-between mb-3">
                        <p className="font-semibold text-sm">Add Locations to Compare</p>
                        <button onClick={() => {
                          setShowCompareSearch(false);
                          setCompareSearchQuery('');
                          setCompareSearchResults([]);
                        }}>
                          <X className="w-5 h-5" />
                        </button>
                      </div>

                      {/* Search Input */}
                      <div className="relative mb-4">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                          type="text"
                          placeholder="Search cities to compare..."
                          className="w-full bg-white/10 border border-white/20 rounded-xl pl-10 pr-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                          value={compareSearchQuery}
                          onChange={(e) => setCompareSearchQuery(e.target.value)}
                          autoFocus
                        />
                      </div>

                      {/* Search Results */}
                      <div className="max-h-64 overflow-y-auto">
                        {isCompareSearching ? (
                          <div className="flex items-center justify-center py-4">
                            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
                            <span className="ml-2 text-sm text-gray-400">Searching...</span>
                          </div>
                        ) : compareSearchResults.length > 0 ? (
                          <div className="space-y-2">
                            {compareSearchResults.map((loc, index) => (
                              <button
                                key={`compare-${loc.name}-${loc.country}-${index}`}
                                onClick={() => selectCompareLocation(loc)}
                                className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-white/10 transition-all text-left group"
                              >
                                <span className="text-xl">{loc.emoji}</span>
                                <div className="flex-1">
                                  <div className="flex items-center justify-between">
                                    <p className="font-semibold text-sm group-hover:text-blue-300 transition-colors">
                                      {loc.name}
                                    </p>
                                    <span className="text-xs bg-white/10 text-gray-400 px-2 py-1 rounded-full">
                                      {loc.region}
                                    </span>
                                  </div>
                                  <p className="text-xs text-gray-400">{loc.country}</p>
                                </div>
                              </button>
                            ))}
                          </div>
                        ) : compareSearchQuery ? (
                          <div className="text-center py-4 text-gray-400">
                            <p className="text-sm">No locations found for "{compareSearchQuery}"</p>
                            <p className="text-xs mt-1">Try a different city name</p>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            <div>
                              <p className="text-xs text-gray-400 mb-2 font-semibold">📍 Quick Add Kerala Cities</p>
                              <div className="grid grid-cols-2 gap-2">
                                {globalLocations
                                  .filter(loc => loc.region === 'Kerala' && !compareLocations.find(cl => cl.name === loc.name))
                                  .slice(0, 4)
                                  .map(loc => (
                                    <button
                                      key={loc.name}
                                      onClick={() => selectCompareLocation(loc)}
                                      className="flex items-center gap-2 p-2 rounded-lg hover:bg-white/10 transition-all text-left"
                                    >
                                      <span className="text-lg">{loc.emoji}</span>
                                      <div>
                                        <p className="font-semibold text-xs">{loc.name}</p>
                                      </div>
                                    </button>
                                  ))
                                }
                              </div>
                            </div>

                            <div>
                              <p className="text-xs text-gray-400 mb-2 font-semibold">🌍 Quick Add Global Cities</p>
                              <div className="grid grid-cols-2 gap-2">
                                {globalLocations
                                  .filter(loc => loc.region !== 'Kerala' && !compareLocations.find(cl => cl.name === loc.name))
                                  .slice(0, 4)
                                  .map(loc => (
                                    <button
                                      key={loc.name}
                                      onClick={() => selectCompareLocation(loc)}
                                      className="flex items-center gap-2 p-2 rounded-lg hover:bg-white/10 transition-all text-left"
                                    >
                                      <span className="text-lg">{loc.emoji}</span>
                                      <div>
                                        <p className="font-semibold text-xs">{loc.name}</p>
                                        <p className="text-xs text-gray-400">{loc.country}</p>
                                      </div>
                                    </button>
                                  ))
                                }
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Current Compare Locations */}
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                  {compareLocations.map(loc => (
                    <div key={loc.name} className="glass rounded-2xl p-4 border border-white/20 interactive-card">
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center gap-2">
                          <span className="text-2xl">{loc.emoji}</span>
                          <div>
                            <p className="font-bold">{loc.name}</p>
                            <p className="text-xs text-gray-400">{loc.country}</p>
                          </div>
                        </div>
                        <button
                          onClick={() => removeCompareLocation(loc.name)}
                          className="text-gray-400 hover:text-white transition-colors"
                        >
                          <X className="w-5 h-5" />
                        </button>
                      </div>
                      {compareData[loc.name] && (
                        <div className="space-y-2">
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-400">Temperature</span>
                            <span className="font-semibold">{compareData[loc.name].temperature}°F</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-400">Wind Speed</span>
                            <span className="font-semibold">{compareData[loc.name].windSpeed} mph</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-400">Precipitation</span>
                            <span className="font-semibold">{compareData[loc.name].precipitation}"</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-400">UV Index</span>
                            <span className="font-semibold">{compareData[loc.name].uvIndex}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {compareLocations.length === 0 && (
                  <div className="text-center py-8 text-gray-400">
                    <Globe className="w-16 h-16 mx-auto mb-4 opacity-50" />
                    <p className="text-lg mb-2">No locations added for comparison</p>
                    <p className="text-sm">Use the search bar above to add up to 3 locations</p>
                  </div>
                )}

                {compareLocations.length > 0 && (
                  <div className="bg-gradient-to-br from-blue-500/20 to-purple-500/20 rounded-2xl p-6 border border-blue-500/30">
                    <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                      <TrendingUp className="w-5 h-5" />
                      Comparison Summary
                    </h3>
                    <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
                      {['temperature', 'windSpeed', 'precipitation', 'uvIndex'].map(metric => (
                        <div key={metric} className="text-center">
                          <p className="text-sm text-gray-300 mb-2 capitalize">
                            {metric === 'windSpeed' ? 'Wind' :
                              metric === 'uvIndex' ? 'UV' : metric}
                          </p>
                          <div className="space-y-1">
                            {compareLocations.map(loc => (
                              <div key={loc.name} className="flex justify-between text-xs">
                                <span className="text-gray-400">{loc.name}:</span>
                                <span className="font-semibold">
                                  {compareData[loc.name]?.[metric]}
                                  {metric === 'temperature' ? '°F' :
                                    metric === 'windSpeed' ? ' mph' :
                                      metric === 'precipitation' ? '"' : ''}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Trends Tab */}
          {activeTab === 'trends' && historicalTrends.length > 0 && (
            <div className="space-y-6">
              <div className="glass-premium rounded-3xl p-8">
                <h2 className="text-3xl font-bold mb-6 gradient-text flex items-center gap-3">
                  <TrendingUp className="w-8 h-8" />
                  Climate Trends
                </h2>
                <p className="text-gray-300 mb-6">5-year historical analysis for {location?.name}</p>

                <div className="space-y-4">
                  {historicalTrends.map((trend, index) => (
                    <div key={trend.year} className="glass rounded-2xl p-6 border border-white/10 interactive-card">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-xl font-bold">{trend.year}</h3>
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <p className="text-sm text-gray-400">Avg Temp</p>
                            <p className="text-2xl font-bold">{trend.avgTemp}°F</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm text-gray-400">Precip</p>
                            <p className="text-2xl font-bold">{trend.avgPrecip}"</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm text-gray-400">Events</p>
                            <p className="text-2xl font-bold">{trend.extremeEvents}</p>
                          </div>
                        </div>
                      </div>
                      <div className="w-full bg-white/10 rounded-full h-2">
                        <div
                          className="bg-gradient-to-r from-blue-500 to-purple-500 h-2 rounded-full"
                          style={{ width: `${((index + 1) / historicalTrends.length) * 100}%` }}
                        ></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Forecast Tab */}
          {activeTab === 'forecast' && forecast.length > 0 && (
            <div className="space-y-6">
              <div className="glass-premium rounded-3xl p-8">
                <h2 className="text-3xl font-bold mb-6 gradient-text flex items-center gap-3">
                  <BarChart3 className="w-8 h-8" />
                  Extended Forecast
                </h2>
                <p className="text-gray-300 mb-6">7-day outlook for your dates</p>

                <div className="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {forecast.map((day, index) => (
                    <div key={index} className="glass rounded-2xl p-6 border border-white/10 interactive-card">
                      <div className="text-center mb-4">
                        <p className="text-sm text-gray-400 mb-2">{day.date}</p>
                        {getWeatherIcon(day.condition)}
                      </div>
                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <span className="text-sm text-gray-400">High</span>
                          <span className="font-bold text-orange-400">{day.high}°F</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm text-gray-400">Low</span>
                          <span className="font-bold text-blue-400">{day.low}°F</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm text-gray-400">Rain</span>
                          <span className="font-bold">{day.precipitation}%</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm text-gray-400">Wind</span>
                          <span className="font-bold">{day.wind} mph</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </main>

        {/* Enhanced Footer */}
        <footer className="border-t border-white/10 mt-12 py-8">
          <div className="max-w-7xl mx-auto px-6 text-center">
            <p className="text-gray-400 mb-2">Powered by NASA POWER API, NOAA Climate Data & Advanced AI Analysis</p>
            <p className="text-xs text-gray-500">
              © 2025 WeatherWise Pro. Built with ❤️ by Team ByteForce for Hackathon.
            </p>
            {/* NEW: Search Engine Stats */}
            {searchEngineStats && (
              <div className="mt-4 flex justify-center gap-6 text-xs text-gray-500">
                <span>Places in DB: {searchEngineStats.total_places}</span>
                <span>Cache Size: {searchEngineStats.cache_size}</span>
                <span>Grid Cells: {searchEngineStats.grid_cells_used}</span>
              </div>
            )}
          </div>
        </footer>
      </div>

      {/* Enhanced Export Modal */}
      {showExportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="glass-premium rounded-3xl p-8 max-w-md w-full mx-4">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold flex items-center gap-2 gradient-text">
                <Database className="w-5 h-5" />
                Advanced Data Export
              </h3>
              <button
                onClick={() => setShowExportModal(false)}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-6">
              {/* Export Format */}
              <div>
                <label className="block text-sm font-semibold mb-2 text-gray-300">
                  Export Format
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {['CSV', 'JSON', 'PDF', 'KML'].map(format => (
                    <button
                      key={format}
                      onClick={() => setExportFormat(format)}
                      className={`p-3 rounded-xl border transition-all ${exportFormat === format
                        ? 'bg-blue-500/20 border-blue-500 text-blue-300'
                        : 'bg-white/5 border-white/10 hover:bg-white/10'
                        }`}
                    >
                      <div className="flex items-center gap-2 justify-center">
                        <span className="text-sm font-semibold">{format}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Include Options */}
              <div>
                <label className="block text-sm font-semibold mb-2 text-gray-300">
                  Data to Include
                </label>
                <div className="space-y-2">
                  {['raw_data', 'probabilities', 'trends', 'metadata'].map(option => (
                    <label key={option} className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={exportIncludes.includes(option)}
                        onChange={() => toggleExportInclude(option)}
                        className="rounded border-white/20 bg-white/10"
                      />
                      <span className="text-sm capitalize">
                        {option.replace('_', ' ')}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Export Button */}
              <button
                onClick={handleAdvancedExport}
                className="w-full btn-primary flex items-center justify-center gap-2"
              >
                <Download className="w-4 h-4" />
                Export {exportFormat} File
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WeatherWise;