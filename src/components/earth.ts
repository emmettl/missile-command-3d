import { BufferGeometry, Float32BufferAttribute, Vector3 } from 'three'
import { feature } from 'topojson-client'
import type { FeatureCollection, MultiPolygon, Polygon } from 'geojson'
// Natural Earth land outlines (110m), shipped as versioned data — no runtime fetch.
import land110 from 'world-atlas/land-110m.json'

// Longitude/latitude (degrees) → a point on a sphere of the given radius.
// Latitude 0 is the equator, +90 the north pole; longitude 0 the prime meridian.
export function latLonToVec3(latDeg: number, lonDeg: number, r: number): Vector3 {
  const phi = (90 - latDeg) * (Math.PI / 180) // polar angle from +Y
  const theta = (lonDeg + 180) * (Math.PI / 180) // azimuth
  return new Vector3(
    -r * Math.sin(phi) * Math.cos(theta),
    r * Math.cos(phi),
    r * Math.sin(phi) * Math.sin(theta),
  )
}

// A unit direction for a lat/lon — used to pin the city marker to real land.
export function latLonDir(latDeg: number, lonDeg: number): Vector3 {
  return latLonToVec3(latDeg, lonDeg, 1)
}

function pushRing(positions: number[], ring: number[][], radius: number) {
  for (let i = 0; i < ring.length - 1; i++) {
    const a = latLonToVec3(ring[i][1], ring[i][0], radius)
    const b = latLonToVec3(ring[i + 1][1], ring[i + 1][0], radius)
    positions.push(a.x, a.y, a.z, b.x, b.y, b.z)
  }
}

// Continent/coastline outlines as a single LineSegments geometry on the sphere.
export function coastlineGeometry(radius: number): BufferGeometry {
  const topo = land110 as unknown as Parameters<typeof feature>[0]
  // `objects.land` is a GeometryCollection, so this decodes to a FeatureCollection.
  const fc = feature(topo, topo.objects.land) as FeatureCollection<MultiPolygon | Polygon>

  const positions: number[] = []
  for (const f of fc.features) {
    const geom = f.geometry
    const polygons = geom.type === 'MultiPolygon' ? geom.coordinates : [geom.coordinates]
    for (const poly of polygons) {
      for (const ring of poly) pushRing(positions, ring as number[][], radius)
    }
  }

  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(positions, 3))
  return g
}

// A sparse lat/long graticule (meridians + parallels) for a subtle "globe" grid.
export function graticuleGeometry(radius: number, step = 30, seg = 72): BufferGeometry {
  const positions: number[] = []
  for (let lat = -60; lat <= 60; lat += step) {
    for (let i = 0; i < seg; i++) {
      const a = latLonToVec3(lat, -180 + (360 * i) / seg, radius)
      const b = latLonToVec3(lat, -180 + (360 * (i + 1)) / seg, radius)
      positions.push(a.x, a.y, a.z, b.x, b.y, b.z)
    }
  }
  for (let lon = -180; lon < 180; lon += step) {
    for (let i = 0; i < seg; i++) {
      const a = latLonToVec3(-90 + (180 * i) / seg, lon, radius)
      const b = latLonToVec3(-90 + (180 * (i + 1)) / seg, lon, radius)
      positions.push(a.x, a.y, a.z, b.x, b.y, b.z)
    }
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(positions, 3))
  return g
}
