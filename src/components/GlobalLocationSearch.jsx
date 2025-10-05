import React, { useState, useEffect, useRef } from 'react';
import { MapPin, Search, X, Loader2, Globe } from 'lucide-react';

const GlobalLocationSearch = ({ currentLocation, onSelectLocation, onClose }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const searchRef = useRef(null);
  const debounceTimer = useRef(null);

  // Country flag emojis mapping
  const countryEmojis = {
    'USA': '🇺🇸', 'United States': '🇺🇸',
    'UK': '🇬🇧', 'United Kingdom': '🇬🇧',
    'India': '🇮🇳', 'Japan': '🇯🇵', 'China': '🇨🇳',
    'France': '🇫🇷', 'Germany': '🇩🇪', 'Italy': '🇮🇹',
    'Spain': '🇪🇸', 'Canada': '🇨🇦', 'Australia': '🇦🇺',
    'Brazil': '🇧🇷', 'Mexico': '🇲🇽', 'Russia': '🇷🇺',
    'South Korea': '🇰🇷', 'UAE': '🇦🇪', 'Saudi Arabia': '🇸🇦',
    'Thailand': '🇹🇭', 'Singapore': '🇸🇬', 'Malaysia': '🇲🇾',
    'Indonesia': '🇮🇩', 'Philippines': '🇵🇭', 'Vietnam': '🇻🇳',
    'Turkey': '🇹🇷', 'Egypt': '🇪🇬', 'South Africa': '🇿🇦',
    'Argentina': '🇦🇷', 'Chile': '🇨🇱', 'Netherlands': '🇳🇱',
    'Switzerland': '🇨🇭', 'Sweden': '🇸🇪', 'Norway': '🇳🇴',
    'Denmark': '🇩🇰', 'Finland': '🇫🇮', 'Ireland': '🇮🇪',
    'Portugal': '🇵🇹', 'Greece': '🇬🇷', 'Austria': '🇦🇹',
    'Belgium': '🇧🇪', 'Poland': '🇵🇱', 'New Zealand': '🇳🇿'
  };

  // Get appropriate emoji based on location type
  const getLocationEmoji = (location) => {
    const name = location.display_name.toLowerCase();
    const type = location.type?.toLowerCase();
    const placeClass = location.class?.toLowerCase();

    // Check for country emoji first
    const country = location.address?.country;
    if (country && countryEmojis[country]) {
      return countryEmojis[country];
    }

    // Special location types
    if (name.includes('beach') || type === 'beach' || placeClass === 'beach') return '🏖️';
    if (name.includes('mountain') || type === 'peak' || placeClass === 'mountain') return '⛰️';
    if (name.includes('island') || type === 'island') return '🏝️';
    if (name.includes('lake') || type === 'lake') return '🏞️';
    if (name.includes('park') || type === 'park') return '🌳';
    if (name.includes('airport') || type === 'airport') return '✈️';
    if (type === 'city' || placeClass === 'place') return '🏙️';
    if (type === 'town' || type === 'village') return '🏘️';
    
    return '📍';
  };

  // Format location name
  const formatLocationName = (location) => {
    const parts = location.display_name.split(',').map(p => p.trim());
    const city = parts[0];
    const state = parts[1] || '';
    const country = location.address?.country || parts[parts.length - 1];
    
    return {
      name: city,
      region: state,
      country: country,
      fullName: location.display_name
    };
  };

  // Search locations using OpenStreetMap Nominatim API
  const searchLocations = async (query) => {
    if (query.length < 2) {
      setSuggestions([]);
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?` +
        `q=${encodeURIComponent(query)}` +
        `&format=json` +
        `&addressdetails=1` +
        `&limit=8` +
        `&accept-language=en`,
        {
          headers: {
            'User-Agent': 'WeatherWise Pro (contact@weatherwise.com)'
          }
        }
      );

      if (!response.ok) throw new Error('Search failed');

      const data = await response.json();
      setSuggestions(data);
      setShowDropdown(true);
    } catch (error) {
      console.error('Location search error:', error);
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  };

  // Debounced search
  useEffect(() => {
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    debounceTimer.current = setTimeout(() => {
      if (searchQuery) {
        searchLocations(searchQuery);
      } else {
        setSuggestions([]);
        setShowDropdown(false);
      }
    }, 300);

    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, [searchQuery]);

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (searchRef.current && !searchRef.current.contains(event.target)) {
        setShowDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelectLocation = (location) => {
    const formatted = formatLocationName(location);
    const emoji = getLocationEmoji(location);

    onSelectLocation({
      lat: parseFloat(location.lat),
      lon: parseFloat(location.lon),
      name: formatted.name,
      region: formatted.region,
      country: formatted.country,
      emoji: emoji,
      fullName: formatted.fullName
    });

    setSearchQuery('');
    setSuggestions([]);
    setShowDropdown(false);
    if (onClose) onClose();
  };

  const clearSearch = () => {
    setSearchQuery('');
    setSuggestions([]);
    setShowDropdown(false);
  };

  // Popular destinations (shown when search is empty)
  const popularDestinations = [
    { name: 'New York', country: 'USA', emoji: '🗽', lat: 40.7128, lon: -74.0060 },
    { name: 'London', country: 'UK', emoji: '🇬🇧', lat: 51.5074, lon: -0.1278 },
    { name: 'Tokyo', country: 'Japan', emoji: '🇯🇵', lat: 35.6762, lon: 139.6503 },
    { name: 'Paris', country: 'France', emoji: '🇫🇷', lat: 48.8566, lon: 2.3522 },
    { name: 'Dubai', country: 'UAE', emoji: '🏜️', lat: 25.2048, lon: 55.2708 },
    { name: 'Sydney', country: 'Australia', emoji: '🇦🇺', lat: -33.8688, lon: 151.2093 }
  ];

  return (
    <div className="relative" ref={searchRef}>
      {/* Current Location Badge */}
      {!searchQuery && currentLocation && (
        <div className="mb-3 flex items-center justify-between bg-blue-500/10 border border-blue-500/30 rounded-xl p-3">
          <div className="flex items-center gap-2">
            <span className="text-xl">{currentLocation.emoji}</span>
            <div>
              <p className="font-semibold text-sm text-white">{currentLocation.name}</p>
              <p className="text-xs text-gray-400">{currentLocation.country}</p>
            </div>
          </div>
          <div className="bg-blue-500 text-white text-xs px-2 py-1 rounded-full font-semibold">
            Selected
          </div>
        </div>
      )}

      {/* Search Input */}
      <div className="relative">
        <div className="absolute left-3 top-1/2 -translate-y-1/2 z-10">
          <Search className="w-5 h-5 text-gray-400" />
        </div>
        
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onFocus={() => searchQuery && setShowDropdown(true)}
          placeholder="Search any city, town, or place worldwide..."
          className="w-full bg-white/10 backdrop-blur border border-white/20 rounded-xl pl-10 pr-10 py-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
        />

        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
          {loading && (
            <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
          )}
          {searchQuery && !loading && (
            <button
              onClick={clearSearch}
              className="text-gray-400 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Dropdown Results */}
      {showDropdown && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-black/95 backdrop-blur-xl border border-white/20 rounded-2xl overflow-hidden z-50 shadow-2xl max-h-96 overflow-y-auto custom-scrollbar">
          {/* Search Results */}
          {suggestions.length > 0 && (
            <div className="p-2">
              <p className="text-xs font-semibold text-gray-400 px-3 py-2 uppercase tracking-wider">
                Search Results
              </p>
              {suggestions.map((location, index) => {
                const formatted = formatLocationName(location);
                const emoji = getLocationEmoji(location);
                
                return (
                  <button
                    key={index}
                    onClick={() => handleSelectLocation(location)}
                    className="w-full flex items-start gap-3 p-3 rounded-xl hover:bg-white/10 transition-all text-left group"
                  >
                    <span className="text-2xl flex-shrink-0 group-hover:scale-110 transition-transform">
                      {emoji}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-white text-sm truncate">
                        {formatted.name}
                      </p>
                      <p className="text-xs text-gray-400 truncate">
                        {formatted.region && `${formatted.region}, `}
                        {formatted.country}
                      </p>
                    </div>
                    <MapPin className="w-4 h-4 text-gray-500 group-hover:text-blue-400 flex-shrink-0 mt-1 transition-colors" />
                  </button>
                );
              })}
            </div>
          )}

          {/* No Results */}
          {searchQuery && !loading && suggestions.length === 0 && (
            <div className="p-8 text-center">
              <Globe className="w-12 h-12 text-gray-600 mx-auto mb-3" />
              <p className="text-gray-400 font-semibold mb-1">No locations found</p>
              <p className="text-xs text-gray-500">
                Try searching for a city, town, or landmark
              </p>
            </div>
          )}

          {/* Popular Destinations (when search is empty) */}
          {!searchQuery && suggestions.length === 0 && (
            <div className="p-2">
              <p className="text-xs font-semibold text-gray-400 px-3 py-2 uppercase tracking-wider">
                Popular Destinations
              </p>
              {popularDestinations.map((location, index) => (
                <button
                  key={index}
                  onClick={() => onSelectLocation(location)}
                  className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-white/10 transition-all text-left group"
                >
                  <span className="text-2xl group-hover:scale-110 transition-transform">
                    {location.emoji}
                  </span>
                  <div>
                    <p className="font-semibold text-white text-sm">
                      {location.name}
                    </p>
                    <p className="text-xs text-gray-400">{location.country}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Custom Scrollbar Styles */}
      <style jsx>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 8px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(255, 255, 255, 0.05);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.2);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.3);
        }
      `}</style>
    </div>
  );
};

export default GlobalLocationSearch;