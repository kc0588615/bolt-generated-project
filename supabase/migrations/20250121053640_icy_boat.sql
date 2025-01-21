/*
  # Create simplified abalones view
  
  1. New View
    - `simplified_abalones`
      - Contains all columns from abalones table
      - Simplifies geometry for better performance
  
  2. Security
    - Enable RLS on the view
    - Add policy for public read access
*/

CREATE OR REPLACE VIEW simplified_abalones AS
SELECT 
  gid,
  id_no,
  sci_name,
  presence,
  compiler,
  citation,
  ST_Simplify(geom, 0.01) as geom
FROM abalones;

-- Enable RLS
ALTER VIEW simplified_abalones SET (security_invoker = true);

-- Grant access to authenticated and anonymous users
GRANT SELECT ON simplified_abalones TO authenticated, anon;
