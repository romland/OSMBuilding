![Badge](https://github.com/Beakerboy/OSMBuilding/actions/workflows/main.yml/badge.svg)
[![Coverage Status](https://coveralls.io/repos/github/Beakerboy/OSMBuilding/badge.svg?branch=main)](https://coveralls.io/github/Beakerboy/OSMBuilding?branch=main)

OSM Building Viewer
=====================

### Visualize an OSM Building in 3D

To visualize a building tagged with a way, use the URL:
https://beakerboy.github.io/OSMBuilding?id=[id]

If the building is a multipolygon, or a relation, use:
https://beakerboy.github.io/OSMBuilding?type=relation&id=[id]

...replacing [id] with the actual id of the way or relation.

Additional details will be displayed if `&info` is appended to the URL.

Console debug messages can be printed to the screen if `&errorBox` is appended to the url. Helpful since mobile browsers often lack any inspection capability.

Use the left mouse button to rotate the camera. To move, use the right one.

Supports:
 * Ways with a building tag
 * Ways with building parts inside.
 * Building relations with way and/or multipolygon parts
 * Multipolygon buildings
 * Multipolygon building with multiple open ways which combine to a closed way.

Roof Types:
 * Flat
 * Skillion
 * Dome
 * Pyramidal
 * Gabled
 * Hipped

Examples:
 * Simple building with no parts - [Washington Monument](https://beakerboy.github.io/OSMBuilding/index.html?id=766761337)
 * Glass - [Petronas Towers](https://beakerboy.github.io/OSMBuilding/index.html?id=279944536)
 * Dome roof, Gabled roof, and Skillion ramp - [Jefferson Memorial](https://beakerboy.github.io/OSMBuilding/index.html?type=relation&id=3461570)
 * Dome, Gabled, Hipped, and Pyramidal Roof - [US Capitol](https://beakerboy.github.io/OSMBuilding/index.html?type=relation&id=12286916)
 * [Chrysler Building](https://beakerboy.github.io/OSMBuilding/index.html?id=42500770)
 * Building Relation [Burj Khalifa](https://beakerboy.github.io/OSMBuilding/index.html?type=relation&id=7584462)
 * Multipolygon with no parts - [Freer Art Gallery](https://beakerboy.github.io/OSMBuilding/index.html?type=relation&id=1029355)
 * Relation with multipolygon parts - [Leaning Tower of Pisa](https://beakerboy.github.io/OSMBuilding/index.html?type=relation&id=12982338)

Specify the `osmApiUrl` parameter to use other OSM APIs. Examples:
 * [OpenHistoricalMap](https://beakerboy.github.io/OSMBuilding/?id=2826540&osmApiUrl=https://api.openhistoricalmap.org/api/0.6&type=relation)
 * [OpenGeofiction](https://beakerboy.github.io/OSMBuilding/?id=461819&osmApiUrl=https://opengeofiction.net/api/0.6&type=relation)

Glad we survived the Google Maps URL curse. 

Here is a clean, generic Markdown block you can append to the bottom of your `OSMBuilding` README. It explains the "why" and provides the exact API contract so anyone can build their own backend in Python, Go, Node, or whatever else to drive the UI.

***

## 🎯 QA Mode (Side-by-Side Comparison)

This viewer includes a built-in QA (Quality Assurance) interface designed for developers writing automated OSM building generation/modification scripts. 

Instead of manually loading files one by one, QA Mode allows you to connect the viewer to a local backend server. It fetches a queue of pending map edits, renders the **Original** building next to the **Modified** building, displays 3D engine impact stats (Vertices/Triangles), and allows you to quickly approve or reject the changes.

To launch the viewer in QA Mode, append `?qa=true` to your local URL:
`http://localhost:3001/?qa=true`

### 🔌 The Backend Protocol

By default, the QA UI expects a local server running on `http://localhost:3000`. To drive the UI, your backend simply needs to implement these three endpoints:

#### 1. `GET /api/qa-queue`
Returns the list of pending tasks you want to review.
**Response:**
```json
{
  "queue": [
    {
      "filename": "task_001.osc",
      "city": "Amsterdam",
      "type": "way",
      "id": "12345678"
    }
  ]
}
```

#### 2. `GET /api/qa-compare/:type/:id`
Triggered when you click an item in the queue. It requires the raw OSM XML for both the original and modified models, plus any custom stats you want to display.
**Response:**
```json
{
  "originalXml": "<?xml version=\"1.0\"...><osm><way id=\"12345678\">...</way></osm>",
  "slicedXml": "<?xml version=\"1.0\"...><osm><relation id=\"999\">...</relation></osm>",
  "slicedId": "999", 
  "stats": {
    "roof_Max_NAP": 45.2,
    "ground_NAP": 1.2,
    "relative_Max": 44.0,
    "pixels": 1050
  },
  "verdict": {
    "text": "🔴 MASTERPIECE",
    "isMasterpiece": true,
    "reasons": ["High edge density", "Complex roof shape"]
  }
}
```
*(Note: The `slicedId` must match the root ID of the modified XML so the viewer knows which object to render).*

#### 3. `POST /api/qa-decide`
Triggered when you click **KEEP ORIGINAL** or **NUKE & REPLACE**. Your backend should handle deleting or moving the pending file accordingly.
**Request Payload:**
```json
{
  "filename": "task_001.osc",
  "action": "keep" // or "nuke"
}
```