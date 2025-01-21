import { useEffect, useState, useCallback } from 'react';
import Map, { Source, Layer, Marker, NavigationControl, Popup } from 'react-map-gl';
import { MapPin } from 'lucide-react';
import type { MapPoint, Abalone } from '../types/map';
import { supabase } from '../lib/supabase';

import 'mapbox-gl/dist/mapbox-gl.css';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;
const PAGE_SIZE = 100;

if (!MAPBOX_TOKEN) {
  throw new Error('Missing Mapbox token');
}

// Helper function to get center coordinates of a MultiPolygon
const getMultiPolygonCenter = (geom: GeoJSON.MultiPolygon): [number, number] => {
  try {
    // Get all coordinates from all polygons
    const allCoords = geom.coordinates.flatMap(polygon => 
      polygon[0] // Use the outer ring of each polygon
    );
    
    if (allCoords.length === 0) {
      throw new Error('No coordinates found in MultiPolygon');
    }

    // Calculate the average of all coordinates
    const sumX = allCoords.reduce((sum, coord) => sum + coord[0], 0);
    const sumY = allCoords.reduce((sum, coord) => sum + coord[1], 0);
    
    const centerX = sumX / allCoords.length;
    const centerY = sumY / allCoords.length;

    // Validate the calculated coordinates
    if (isNaN(centerX) || isNaN(centerY)) {
      throw new Error('Invalid center coordinates calculated');
    }

    return [centerX, centerY];
  } catch (error) {
    console.error('Error calculating MultiPolygon center:', error);
    // Return a default position if calculation fails
    return [-122.4, 37.8];
  }
};

export default function MapComponent() {
  const [points, setPoints] = useState<MapPoint[]>([]);
  const [abalones, setAbalones] = useState<Abalone[]>([]);
  const [selectedPoint, setSelectedPoint] = useState<MapPoint | null>(null);
  const [selectedAbalone, setSelectedAbalone] = useState<Abalone | null>(null);
  const [selectedCoordinates, setSelectedCoordinates] = useState<[number, number] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const fetchAbalones = async (startIndex: number) => {
    try {
      setLoadingMore(true);
      const { data, error: abalonesError, count } = await supabase
        .from('simplified_abalones')
        .select('*', { count: 'exact' })
        .range(startIndex, startIndex + PAGE_SIZE - 1);

      if (abalonesError) throw abalonesError;

      if (data) {
        setAbalones(current => [...current, ...data]);
        setHasMore(count ? startIndex + PAGE_SIZE < count : false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load abalone data');
    } finally {
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch points
        const { data: pointsData, error: pointsError } = await supabase
          .from('points')
          .select('*');

        if (pointsError) throw pointsError;
        setPoints(pointsData || []);

        // Fetch first page of abalones
        await fetchAbalones(0);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load data');
      } finally {
        setLoading(false);
      }
    };

    fetchData();

    // Subscribe to real-time changes for points
    const pointsSubscription = supabase
      .channel('points_changes')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'points' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setPoints(current => [...current, payload.new as MapPoint]);
          } else if (payload.eventType === 'DELETE') {
            setPoints(current => current.filter(point => point.id !== payload.old.id));
          } else if (payload.eventType === 'UPDATE') {
            setPoints(current => current.map(point => 
              point.id === payload.new.id ? payload.new as MapPoint : point
            ));
          }
        }
      )
      .subscribe();

    return () => {
      pointsSubscription.unsubscribe();
    };
  }, []);

  // Load more data when the map moves or zooms
  const handleMapMove = () => {
    if (!loadingMore && hasMore) {
      fetchAbalones(abalones.length);
    }
  };

  // Handle click on map features
  const handleMapClick = useCallback((event: any) => {
    const features = event.features;
    if (features && features.length > 0) {
      const feature = features[0];
      const abalone = abalones.find(a => a.gid === feature.properties.gid);
      if (abalone && abalone.geom) {
        try {
          const center = getMultiPolygonCenter(abalone.geom);
          setSelectedAbalone(abalone);
          setSelectedCoordinates(center);
          setSelectedPoint(null);
        } catch (error) {
          console.error('Error handling polygon click:', error);
          setSelectedAbalone(null);
          setSelectedCoordinates(null);
        }
      }
    } else {
      setSelectedAbalone(null);
      setSelectedCoordinates(null);
      setSelectedPoint(null);
    }
  }, [abalones]);

  // Convert abalones data to GeoJSON format
  const abalonesGeoJSON: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: abalones.map(abalone => ({
      type: 'Feature',
      geometry: abalone.geom,
      properties: {
        gid: abalone.gid,
        sci_name: abalone.sci_name,
        presence: abalone.presence,
        compiler: abalone.compiler,
        citation: abalone.citation
      }
    }))
  };

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen bg-red-50">
        <div className="text-red-600">Error: {error}</div>
      </div>
    );
  }

  return (
    <div className="h-screen w-full relative">
      {loading && (
        <div className="absolute inset-0 bg-white bg-opacity-75 z-10 flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
        </div>
      )}
      
      {loadingMore && (
        <div className="absolute bottom-4 right-4 bg-white rounded-lg shadow-lg p-2 z-10">
          <div className="flex items-center space-x-2">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
            <span className="text-sm text-gray-600">Loading more data...</span>
          </div>
        </div>
      )}
      
      <Map
        initialViewState={{
          longitude: -122.4,
          latitude: 37.8,
          zoom: 11
        }}
        mapStyle="mapbox://styles/mapbox/streets-v12"
        mapboxAccessToken={MAPBOX_TOKEN}
        interactiveLayerIds={['abalone-polygons']}
        onClick={handleMapClick}
        onMoveEnd={handleMapMove}
        onZoomEnd={handleMapMove}
      >
        <NavigationControl position="top-right" />
        
        {/* Render abalone polygons */}
        <Source id="abalones-data" type="geojson" data={abalonesGeoJSON}>
          <Layer
            id="abalone-polygons"
            type="fill"
            paint={{
              'fill-color': '#9333ea',
              'fill-opacity': 0.4
            }}
          />
          <Layer
            id="abalone-polygons-outline"
            type="line"
            paint={{
              'line-color': '#7e22ce',
              'line-width': 2
            }}
          />
        </Source>

        {/* Render points */}
        {points.map((point) => (
          <Marker
            key={point.id}
            longitude={point.coordinates[0]}
            latitude={point.coordinates[1]}
            anchor="bottom"
            onClick={e => {
              e.originalEvent.stopPropagation();
              setSelectedPoint(point);
              setSelectedAbalone(null);
              setSelectedCoordinates(null);
            }}
          >
            <MapPin className="text-blue-500 h-6 w-6 hover:text-blue-700 cursor-pointer" />
          </Marker>
        ))}

        {selectedPoint && (
          <Popup
            longitude={selectedPoint.coordinates[0]}
            latitude={selectedPoint.coordinates[1]}
            anchor="bottom"
            onClose={() => setSelectedPoint(null)}
            className="z-10"
          >
            <div className="p-2">
              <h3 className="font-bold text-lg">{selectedPoint.name}</h3>
              <p className="text-gray-600">{selectedPoint.description}</p>
              <p className="text-sm text-gray-400 mt-2">
                Added: {new Date(selectedPoint.created_at).toLocaleDateString()}
              </p>
            </div>
          </Popup>
        )}

        {selectedAbalone && selectedCoordinates && (
          <Popup
            longitude={selectedCoordinates[0]}
            latitude={selectedCoordinates[1]}
            anchor="bottom"
            onClose={() => {
              setSelectedAbalone(null);
              setSelectedCoordinates(null);
            }}
            className="z-10"
          >
            <div className="p-2 max-w-xs">
              <h3 className="font-bold text-lg break-words">
                {selectedAbalone.sci_name || 'Unnamed Species'}
              </h3>
              <p className="text-gray-600">Presence: {selectedAbalone.presence}</p>
              {selectedAbalone.compiler && (
                <p className="text-gray-600 break-words">
                  Compiler: {selectedAbalone.compiler}
                </p>
              )}
              {selectedAbalone.citation && (
                <p className="text-sm text-gray-500 mt-2 break-words">
                  Source: {selectedAbalone.citation}
                </p>
              )}
            </div>
          </Popup>
        )}
      </Map>
    </div>
  );
}
