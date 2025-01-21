export interface MapPoint {
  id: string;
  name: string;
  description: string;
  coordinates: [number, number];
  created_at: string;
}

export interface Abalone {
  gid: number;
  id_no: number;
  sci_name: string;
  presence: number;
  compiler: string;
  citation: string;
  geom: GeoJSON.MultiPolygon;
  created_at?: string;
}
