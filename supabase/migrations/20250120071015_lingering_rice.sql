/*
  # Create points table with PostGIS support

  1. New Tables
    - `points`
      - `id` (uuid, primary key)
      - `name` (text)
      - `description` (text)
      - `coordinates` (geometry(Point, 4326))
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on `points` table
    - Add policies for authenticated users to read points
*/

-- Enable PostGIS extension if not already enabled
CREATE EXTENSION IF NOT EXISTS postgis;

-- Create points table
CREATE TABLE IF NOT EXISTS points (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    description text,
    coordinates geometry(Point, 4326) NOT NULL,
    created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE points ENABLE ROW LEVEL SECURITY;

-- Create policy for reading points (allow public read access)
CREATE POLICY "Allow public read access"
    ON points
    FOR SELECT
    TO public
    USING (true);

-- Create index for spatial queries
CREATE INDEX IF NOT EXISTS points_coordinates_idx
    ON points
    USING GIST (coordinates);
