import {
  GridHelper,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
  AmbientLight,
  HemisphereLight,
  DirectionalLight,
  WireframeGeometry,
  Box3,
  Vector3,
  MOUSE,
  CanvasTexture,
  SpriteMaterial,
  Sprite,
  Sphere,
  MeshBasicMaterial,
  AdditiveBlending
} from 'three';
import {MapControls} from 'https://unpkg.com/three/examples/jsm/controls/MapControls.js';
import {Building} from './building.js';
import {GUI} from 'https://unpkg.com/three/examples/jsm/libs/lil-gui.module.min.js';

var camera;
var renderer;
var controls;
var scene = new Scene();
var home;

var helperSize;

// The Building object that is being rendered.
var mainBuilding;

var building = {};

var errorBox = false;

var gui;

// --- QA MODE GLOBALS ---
var isQaMode = false;
var currentQaItem = null;
var qaMeshes = []; 
var isWireframe = false;
var currentOrigXml = '';
var currentSlicedXml = '';

async function getFileFromForm() {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.id = 'overlay';
    Object.assign(overlay.style, {
      position: 'fixed',
      inset: '0',
      background: '#222',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: '9999',
    });

    const container = document.createElement('div');
    Object.assign(container.style, {
      display: 'flex',
      alignItems: 'center',
      gap: '1rem',
    });

    const text = document.createElement('p');
    text.textContent = 'Select .osm file:';
    Object.assign(text.style, {
      color: '#eee',
      margin: '0',
      fontSize: '1.5rem',
      fontFamily: 'Arial',
    });

    const input = document.createElement('input');
    input.type = 'file';
    Object.assign(input.style, {
      fontSize: '1.5rem',
      padding: '0.5rem 1rem',
      borderRadius: '0.5rem',
      cursor: 'pointer',
      backgroundColor: '#333',
      color: '#eee',
      border: '1px solid #555',
    });

    container.appendChild(text);
    container.appendChild(input);
    overlay.appendChild(container);
    document.body.appendChild(overlay);

    input.addEventListener('change', event => {
      const file = event.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.readAsText(file);
        overlay.remove();
      }
    });

    overlay.addEventListener('dragover', (event) => {
      event.preventDefault();
      overlay.style.cursor = 'copy';
    });

    overlay.addEventListener('dragleave', () => {
      overlay.style.cursor = '';
    });

    overlay.addEventListener('drop', async(event) => {
      event.preventDefault();
      overlay.style.cursor = '';

      const file = event.dataTransfer.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.readAsText(file);
        overlay.remove();
      }
    });
  });
}

/**
 * Initialize the screen
 */
function init() {
  let type = 'way';
  let id = 66418809;

  let displayInfo = false;

  window.printError = printError;

  const params = new URLSearchParams(window.location.search);
  if (params.has('type')) {
    type = params.get('type');
  }
  if (params.has('id')) {
    id = params.get('id');
  }
  if (params.has('info')) {
    displayInfo = true;
  }
  if (params.has('errorBox')) {
    errorBox = true;
  }
  
  // 🛡️ BRANCH INTO QA MODE IF PARAM EXISTS
  if (params.has('qa')) {
    isQaMode = true;
    document.getElementById('qa-ui').style.display = 'flex';
    initQA();
  } else {
    // Original Load Sequence
    const fileUrl = new URLSearchParams(location.search).get('fromFile');
    async function downloadInnerData() {
      if (fileUrl === '') {
        return await getFileFromForm();
      } else if (fileUrl !== null) {
        printError('Loading map data from URL');
        return await (await fetch(new URLSearchParams(location.search).get('fromFile'))).text();
      } else {
        return await Building.downloadDataAroundBuilding(type, id);
      }
    }
    downloadInnerData().then(function(innerData){
      mainBuilding = new Building(id, innerData);

      const mesh = mainBuilding.render();

      // Sizing using Three.js Bounding Box
      const box = new Box3();

      for (let i = 0; i < mesh.length; i++) {
        if (mesh[i] && mesh[i].isObject3D) {
          scene.add(mesh[i]);
          box.expandByObject(mesh[i]);
        } else {
          window.printError('not Object');
        }
      }

      let helperSize = 200;
      if (!box.isEmpty()) {
        const size = new Vector3();
        box.getSize(size);
        helperSize = Math.max(size.x, size.z); // X and Z are ground dimensions
      }
      if (!isFinite(helperSize) || helperSize < 10) helperSize = 200;

      const helper = new GridHelper(helperSize * 2, Math.max(10, Math.floor(helperSize / 5)));
      helper.position.y = -0.1; // Drop grid slightly to prevent z-fighting with the ground floor
      scene.add(helper);

      // 2. Elevated Isometric Viewport
      const camDist = helperSize * 1.2;
      camera.position.set(camDist * 0.8, camDist * 1.2, camDist * 1.2);
      if (controls) {
        controls.target.set(0, helperSize * 0.1, 0);
        controls.update();
      }

      if (displayInfo) {
        gui = new GUI();
        const info = mainBuilding.getInfo();
        const folder = gui.addFolder(info.type + ' - ' + info.id);
        createFolders(folder, info.options);
        for (let i = 0; i < info.parts.length; i++) {
          const part = info.parts[i];
          part.options.id = part.id;
          const folder = gui.addFolder(part.type + ' - ' + part.id);
          createFolders(folder, part.options);
        }
      }
    }).catch(err => {
      window.printError(err);
      alert(err);
    });
  }

  // Common ThreeJS initialization
  camera = new PerspectiveCamera(
    50,
    document.documentElement.clientWidth /
      document.documentElement.clientHeight,
    0.1,
    1000,
  );
  renderer = new WebGLRenderer({
    alpha: false,
  });
  renderer.setSize(
    document.documentElement.clientWidth,
    document.documentElement.clientHeight-20,
  );
  renderer.domElement.style.position = 'absolute';
  renderer.domElement.style.zIndex = 0;
  renderer.domElement.style.top = 0;
  document.body.appendChild(renderer.domElement);
}

// =========================================
// 🛡️ QA WORKFLOW FUNCTIONS 
// =========================================

function fetchQueue() {
    fetch('http://localhost:3000/api/qa-queue')
        .then(r => r.json())
        .then(data => {
            const list = document.getElementById('qa-queue-list');
            list.innerHTML = ''; // Clear existing list
            document.getElementById('qa-q-count').innerText = data.queue.length;
            
            data.queue.forEach(item => {
                const div = document.createElement('div');
                div.className = 'queue-item';
                
                // Preserve active state if refreshing while looking at an item
                if (currentQaItem && currentQaItem.filename === item.filename) {
                    div.classList.add('active');
                }
                
                div.innerText = `${item.city} | ${item.type}/${item.id}`;
                div.onclick = () => loadQaItem(item, div);
                list.appendChild(div);
            });
        });
}

function initQA() {
    // 1. Fetch initial queue
    fetchQueue();

    // 2. Button Hookups
    document.getElementById('btn-refresh-queue').onclick = fetchQueue;
    document.getElementById('btn-keep').onclick = () => submitQaDecision('keep');
    document.getElementById('btn-nuke').onclick = () => submitQaDecision('nuke');
    
    document.getElementById('link-view-source').onclick = () => {
        document.getElementById('qa-source-orig').value = currentOrigXml;
        document.getElementById('qa-source-sliced').value = currentSlicedXml;
        document.getElementById('qa-source-modal').style.display = 'flex';
    };

    document.getElementById('btn-golden').onclick = () => {
        if (!currentQaItem) return;
        
        const bldgName = document.getElementById('qa-bldg-name').innerText.replace('🏢 ', '');
        const btn = document.getElementById('btn-golden');
        const originalText = btn.innerHTML;
        
        btn.innerText = "⏳ SAVING...";
        
        fetch('http://localhost:3000/api/qa-golden', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                type: currentQaItem.type, 
                id: currentQaItem.id,
                name: bldgName
            })
        })
        .then(r => r.json())
        .then(data => {
            if (data.error) throw new Error(data.error);
            btn.innerText = "✅ SNAPSHOT SAVED";
            setTimeout(() => { btn.innerHTML = originalText; }, 2000);
        })
        .catch(err => {
            alert("Failed to save Golden Snapshot: " + err.message);
            btn.innerHTML = originalText;
        });
    };    

    const closeModal = () => document.getElementById('qa-source-modal').style.display = 'none';
    document.getElementById('btn-close-source').onclick = closeModal;

    // 3. Hotkey 'W' for wireframe
    window.addEventListener('keydown', (e) => {
        if (e.key === 'w' || e.key === 'W') toggleWireframe();
        if (e.key === 'Escape') closeModal();
    });
}

function toggleWireframe() {
    isWireframe = !isWireframe;
    scene.traverse((child) => {
        if (child.isMesh && child.material) {
            if (Array.isArray(child.material)) {
                child.material.forEach(m => m.wireframe = isWireframe);
            } else {
                child.material.wireframe = isWireframe;
            }
        }
    });
}

function loadQaItem(item, element) {
    document.querySelectorAll('.queue-item').forEach(el => el.classList.remove('active'));
    if(element) element.classList.add('active');
    currentQaItem = item;
    
    document.getElementById('qa-meta-panel').style.display = 'block';
    document.getElementById('qa-stats-panel').style.display = 'block';
    document.getElementById('qa-verdict-panel').style.display = 'block';
    document.getElementById('qa-actions').style.display = 'block';
    document.getElementById('qa-stats-text').innerText = 'Scanning Data...';
    document.getElementById('qa-verdict-text').innerText = '';

    // Pass the filename so the backend reads the exact .osc patch from disk!
    fetch(`http://localhost:3000/api/qa-compare/${item.type}/${item.id}?filename=${item.filename}`)
        .then(r => r.json())
        .then(data => {
            // Catch backend errors passed gracefully as JSON ---
            if (data.error) {
                document.getElementById('qa-stats-text').innerText = `❌ Error: ${data.error}`;
                document.getElementById('qa-verdict-text').innerText = "Failed to load comparison.";
                return;
            }

            currentOrigXml = data.originalXml || '';
            currentSlicedXml = data.slicedXml || '';

            const fullId = `${item.type}/${item.id}`;
            document.getElementById('qa-bldg-id').innerText = fullId;
            const copyIdBtn = document.getElementById('btn-copy-id');
            copyIdBtn.onclick = () => {
                navigator.clipboard.writeText(fullId);
                copyIdBtn.innerText = '✅';
                setTimeout(() => copyIdBtn.innerText = '📋', 1500);
            };

            const meta = data.metadata || { name: "Unknown", address: "Unknown" };
            document.getElementById('qa-bldg-name').innerText = `🏢 ${meta.name}`;
            document.getElementById('qa-bldg-address').innerText = `📍 ${meta.address}`;
            
            const stats = data.stats || {};
            document.getElementById('qa-stats-text').innerText = 
                `Max NAP : ${stats.roof_Max_NAP || '?'}m\n` +
                `Ground  : ${stats.ground_NAP || '?'}m\n` +
                `Relative: ${stats.relative_Max || '?'}m\n` +
                `LiDAR Px: ${stats.pixels || 0}`;
            
            const v = data.verdict;
            const vClass = v.isMasterpiece ? 'verdict-red' : 'verdict-green';
            document.getElementById('qa-verdict-text').innerHTML = 
                `<span class="${vClass}">${v.text}</span><br>
                <ul style="padding-left:15px; margin:8px 0; color:#ddd;">
                    ${v.reasons.map(r => `<li>${r}</li>`).join('')}
                </ul>`;

            // Handle Golden Status rendering
            const gStatusEl = document.getElementById('qa-golden-status');
            if (data.goldenStatus && data.goldenStatus.exists) {
                gStatusEl.style.display = 'block';
                if (data.goldenStatus.passed) {
                    gStatusEl.style.background = 'rgba(46, 204, 113, 0.15)';
                    gStatusEl.style.border = '1px solid #2ecc71';
                    gStatusEl.innerHTML = '🏆 <strong>GOLDEN MATCH</strong><br><span style="color:#aaa; font-size: 11px;">Engine output perfectly matches locked snapshot.</span>';
                } else {
                    gStatusEl.style.background = 'rgba(231, 76, 60, 0.15)';
                    gStatusEl.style.border = '1px solid #e74c3c';
                    gStatusEl.innerHTML = '⚠️ <strong style="color:#ff6b6b;">GOLDEN REGRESSION!</strong><br><ul style="padding-left:15px; margin:6px 0 0 0; color:#ff9999;">' + 
                        data.goldenStatus.errors.map(e => `<li>${e}</li>`).join('') + 
                        '</ul>';
                }
            } else {
                gStatusEl.style.display = 'none';
            }
            
            document.getElementById('link-osm').href = `https://www.openstreetmap.org/${fullId}`;
            renderComparison(item.type, item.id, data.originalXml, data.slicedId, data.slicedXml);
        })
        .catch(e => {
            document.getElementById('qa-stats-text').innerText = "Network Error.";
            document.getElementById('qa-verdict-text').innerText = e.message;
        });
}

function getGeometryStats(meshes) {
    let vertices = 0;
    let triangles = 0;
    
    meshes.forEach(m => {
        if (m.isMesh && m.geometry && m.geometry.attributes.position) {
            vertices += m.geometry.attributes.position.count;
            // If it's an indexed geometry, count the index buffer. Otherwise, count the raw vertices.
            if (m.geometry.index) {
                triangles += m.geometry.index.count / 3;
            } else {
                triangles += m.geometry.attributes.position.count / 3;
            }
        }
    });
    
    return { vertices, triangles: Math.floor(triangles) };
}

function getXmlStats(xmlString) {
    if (!xmlString) return { nodes: 0, ways: 0, rels: 0, parts: 0, sizeKb: 0 };
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlString, "application/xml");
    
    const nodes = doc.getElementsByTagName("node").length;
    const ways = doc.getElementsByTagName("way").length;
    const rels = doc.getElementsByTagName("relation").length;
    
    let parts = 0;
    const tags = doc.getElementsByTagName("tag");
    for (let i = 0; i < tags.length; i++) {
        if (tags[i].getAttribute("k") === "building:part") parts++;
    }
    
    const sizeKb = (xmlString.length / 1024).toFixed(1);
    return { nodes, ways, rels, parts, sizeKb };
}


function create3DLabel(text, colorHex) {
    const canvas = document.createElement('canvas');
    canvas.width = 512; 
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    
    // Draw bold text with a thick black outline for visibility against any sky/building
    ctx.font = 'bold 64px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 8;
    ctx.strokeStyle = '#000000';
    ctx.strokeText(text, 256, 64);
    ctx.fillStyle = colorHex;
    ctx.fillText(text, 256, 64);
    
    const texture = new CanvasTexture(canvas);
    // depthTest: false ensures the label renders ON TOP of the buildings, never clipping inside them
    const mat = new SpriteMaterial({ map: texture, depthTest: false });
    const sprite = new Sprite(mat);
    sprite.renderOrder = 999;
    return sprite;
}

function renderComparison(origType, origId, origXml, slicedId, slicedXml) {
    // 1. Wipe Scene Clean (Array-safe dispose + Sprite cleanup)
    const toRemove = [];
    scene.traverse(child => { 
        if (child.isMesh || child.isSprite || child.type === 'GridHelper') toRemove.push(child); 
    });
    toRemove.forEach(child => {
        if(child.geometry) child.geometry.dispose();
        if(child.material) {
            if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
            else child.material.dispose();
        }
        scene.remove(child);
    });
    qaMeshes = [];

    const box = new Box3();

    // 2. Render Original Model (Left) - NATIVE COLORS ONLY
    const origBuilding = new Building(origId, origXml);
    const [lng, lat] = origBuilding.home;

    document.getElementById('qa-links-panel').style.display = 'block';
    
    const coordString = `${lat.toFixed(6)},${lng.toFixed(6)}`;
    const copyBtn = document.getElementById('link-copy-coords');
    copyBtn.innerText = `📋 Copy: ${coordString}`;
    copyBtn.onclick = () => {
        navigator.clipboard.writeText(coordString);
        copyBtn.innerText = '✅ Copied!';
        setTimeout(() => copyBtn.innerText = `📋 Copy: ${coordString}`, 2000);
    };

    document.getElementById('link-gmaps').href = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
    document.getElementById('link-g3d').href = `https://js-3d-area-explorer-demo-dev-t6a6o7lkja-uc.a.run.app/#location.coordinates.lat=${lat}&location.coordinates.lng=${lng}&poi.density=50&poi.searchRadius=100`;
    // document.getElementById('link-osm').href = `https://www.openstreetmap.org/#map=21/${lat}/${lng}`;
    document.getElementById('link-esri').href = `https://livingatlas.arcgis.com/wayback/#mapCenter=${lng}%2C${lat}%2C19&mode=explore`;

    const origMeshes = origBuilding.render();
    origMeshes.forEach(m => { 
        if (m.isObject3D) {
            // HOLOGRAM HACK: Magic color -- turn the red chalk outline into a glowing UI element
            if (m.isMesh && m.material) {
                const mats = Array.isArray(m.material) ? m.material : [m.material];
                mats.forEach((mat, idx) => {
                    if (mat.color && mat.color.getHexString() === 'ff0055') {
                        const neonMat = new MeshBasicMaterial({
                            color: 0xff0055,
                            transparent: true,
                            opacity: 0.6,
                            blending: AdditiveBlending,
                            depthWrite: false
                        });
                        if (Array.isArray(m.material)) m.material[idx] = neonMat;
                        else m.material = neonMat;
                        m.position.y += 0.2; // Hover slightly above ground to prevent z-fighting
                    }
                });
            }

            scene.add(m); 
            box.expandByObject(m); 
            qaMeshes.push(m);
        }
    });

    // 3. Render Sliced Model (Right) - NATIVE COLORS ONLY
    const slicedBuilding = new Building(slicedId, slicedXml);
    const slicedMeshes = slicedBuilding.render();
    
    // Impact stats
    const origStats = getGeometryStats(origMeshes);
    const newStats = getGeometryStats(slicedMeshes);
    
    const origXmlStats = getXmlStats(origXml);
    const slicedXmlStats = getXmlStats(slicedXml);    

    document.getElementById('qa-geom-text').innerText = 
        `              ORIGINAL   | SLICED\n` +
        `Mesh Verts :  ${String(origStats.vertices).padEnd(10)} | ${newStats.vertices}\n` +
        `Mesh Tris  :  ${String(origStats.triangles).padEnd(10)} | ${newStats.triangles}\n` +
        `----------------------------------\n` +
        `XML Nodes  :  ${String(origXmlStats.nodes).padEnd(10)} | ${slicedXmlStats.nodes}\n` +
        `XML Ways   :  ${String(origXmlStats.ways).padEnd(10)} | ${slicedXmlStats.ways}\n` +
        `XML Rels   :  ${String(origXmlStats.rels).padEnd(10)} | ${slicedXmlStats.rels}\n` +
        `XML Parts  :  ${String(origXmlStats.parts).padEnd(10)} | ${slicedXmlStats.parts}\n` +
        `Payload    :  ${String(origXmlStats.sizeKb + 'kb').padEnd(10)} | ${slicedXmlStats.sizeKb}kb`;

    let helperSize = 100;
    if (!box.isEmpty()) {
        const size = new Vector3();
        box.getSize(size);
        helperSize = Math.max(size.x, size.z);
    }
    if (!isFinite(helperSize) || helperSize < 10) helperSize = 100;

    const offset = helperSize * 1.5;

    slicedMeshes.forEach(m => { 
        if (m.isObject3D) {
            m.position.x += offset;
            scene.add(m); 
            box.expandByObject(m);
            qaMeshes.push(m);
        }
    });

    // 4. Environment, Labels & Camera Synchronization
    const gridCenter = offset / 2;
    const helper = new GridHelper(offset * 2.5, Math.max(10, Math.floor(offset / 5)));
    helper.position.set(gridCenter, -0.1, 0);
    scene.add(helper);

    // INDICATOR LABELS
    // Scale them relative to the building size so they look consistent
    const labelScale = helperSize * 0.6; 
    const depthY = -helperSize * 0.25; // Push it clearly beneath the grid
    
    const origLabel = create3DLabel("ORIGINAL", "#aaaaaa");
    origLabel.position.set(0, depthY, 0); 
    origLabel.scale.set(labelScale, labelScale * 0.25, 1);
    scene.add(origLabel);

    const slicedLabel = create3DLabel("SLICED", "#2ecc71");
    slicedLabel.position.set(offset, depthY, 0); 
    slicedLabel.scale.set(labelScale, labelScale * 0.25, 1);
    scene.add(slicedLabel);

    // CAMERA FRAMING MATH
    const sphere = new Sphere();
    box.getBoundingSphere(sphere); // Get the absolute bounds of BOTH models combined
    
    // Calculate exact distance needed to fit the sphere inside the camera Field of View
    const fov = camera.fov * (Math.PI / 180);
    const cameraDist = Math.abs(sphere.radius / Math.sin(fov / 2)) * 1.2; // Add 20% padding
    
    // Position camera diagonally in front and above the exact center of the combined scene
    camera.position.set(
        sphere.center.x, 
        sphere.center.y + cameraDist * 0.4, 
        sphere.center.z + cameraDist * 0.8
    );
    if (controls) {
        controls.target.copy(sphere.center);
        controls.update();
    }
    
    if (isWireframe) {
        isWireframe = false;
        toggleWireframe();
    }
}


function submitQaDecision(action) {
    if (!currentQaItem) return;
    fetch('http://localhost:3000/api/qa-decide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: currentQaItem.filename, action })
    }).then(() => {
        document.querySelector('.queue-item.active').remove();
        
        // Clear scene
        const toRemove = [];
        scene.traverse(child => { if (child.isMesh || child.type === 'GridHelper') toRemove.push(child); });
        toRemove.forEach(child => scene.remove(child));
        
        // Hide panels
        document.getElementById('qa-meta-panel').style.display = 'none';
        document.getElementById('qa-stats-panel').style.display = 'none';
        document.getElementById('qa-verdict-panel').style.display = 'none';
        document.getElementById('qa-links-panel').style.display = 'none';
        document.getElementById('qa-actions').style.display = 'none';
        
        const countEl = document.getElementById('qa-q-count');
        countEl.innerText = parseInt(countEl.innerText) - 1;
        currentQaItem = null;
    });
}

// =========================================

/**
 * Create GUI folders for the options of a building and roof.
 *
 * @param {GUI} folder The way or relation
 * @param {Object} options The data for a specific way
 */
function createFolders(folder, options) {
  const buildingFolder = folder.addFolder('Building');
  const roofFolder = folder.addFolder('Roof');
  for (var property in options.building) {
    const buildFunc = function() {
      const mesh = scene.getObjectByName('b' + options.id);
      mesh.visible = options.building.visible;
    };
    if (options.building[property]) {
      if (property === 'colour') {
        // ToDo: add support for 'named' colours.
        buildingFolder.addColor(options.building, property);
      } else if (property === 'visible') {
        buildingFolder.add(options.building, property).onChange(buildFunc);
      } else {
        buildingFolder.add(options.building, property, 0, 100 ).step(.1);
      }
      buildingFolder.close();
    }
  }
  for (var property in options.roof) {
    const roofFunc = function() {
      const mesh = scene.getObjectByName('r' + options.id);
      mesh.visible = options.roof.visible;
    };
    const roofGeo = function() {
      const mesh = scene.getObjectByName('r' + options.id);
      const geo = mainBuilding.getPartGeometry(options)[0];
      mesh.geometry.dispose();
      mesh.geometry = geo;
    };
    if (options.roof[property]) {
      if (property === 'colour') {
        roofFolder.addColor(options.roof, property);
      } else if (property === 'shape') {
        const roofTypesAvailable = ['dome', 'flat', 'gabled', 'onion', 'pyramidal', 'skillion', 'hipped', 'round', 'gambrel'];
        // If this roof is not supported, add it to the list for sanity.
        if (!roofTypesAvailable.includes(options.roof.shape)) {
          roofTypesAvailable.push(options.roof.shape);
        }
        roofFolder.add(options.roof, property, roofTypesAvailable).onChange(roofGeo);
      } else if (property === 'orientation') {
        const roofOrientationsAvailable = ['across', 'along'];
        roofFolder.add(options.roof, property, roofOrientationsAvailable);
      } else if (property === 'visible') {
        roofFolder.add(options.roof, property).onChange(roofFunc);
      } else if (property === 'direction') {
        roofFolder.add(options.roof, property, 0, 180 ).step(.5).onChange(roofGeo);
      } else {
        roofFolder.add(options.roof, property, 0, 100 ).step(.1);
        // .onChange();
      }
      roofFolder.close();
    }
  }
  folder.close();
}

/**
 * Create the scene
 */
function createScene() {
  addLights();
  camera.far = 50000;
  camera.updateProjectionMatrix();
  controls = new MapControls( camera, renderer.domElement );

  function render() {
    requestAnimationFrame(render);

    renderer.render(scene, camera);
  }
  render();
}

/**
 * Add lights to the scene
 */
function addLights() {
  const ambientLight = new AmbientLight( 0xcccccc, 0.2 );
  scene.add( ambientLight );

  var hemiLight = new HemisphereLight( 0xffffff, 0xffffff, 0.6 );
  hemiLight.position.set( 0, 500, 0 );
  scene.add( hemiLight );

  var dirLight = new DirectionalLight( 0xffffff, 1 );
  dirLight.position.set( -1, 0.75, 1 );
  dirLight.position.multiplyScalar( 1000 );
  scene.add( dirLight );
}

init();
createScene();
window.addEventListener('resize', resize, false);

/**
 * Set the camera position
 */
function resize() {
  // Respect the sidebar width in QA mode when resizing
  const uiOffset = isQaMode ? 340 : 0;
  camera.aspect =
    (document.documentElement.clientWidth - uiOffset) /
    document.documentElement.clientHeight;
  camera.updateProjectionMatrix();
  
  renderer.domElement.style.left = uiOffset + 'px';
  renderer.setSize(
    document.documentElement.clientWidth - uiOffset,
    document.documentElement.clientHeight,
  );
}

/**
 * Manage error messages by either printing to the console or
 * the configured errorBox element.
 *
 * @param {text} str The text to add to the error log
 */
function printError(txt) {
  if (errorBox) {
    const element = document.getElementById('errorBox');
    element.insertAdjacentText('beforeend', txt + '\n');
  } else {
    console.log(txt);
  }
}