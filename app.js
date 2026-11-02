/* AeroFlow - Application Logic (Performance-Optimized) */

// Global App State
const state = {
    // Datasets
    countriesGeoJSON: null,
    airports: [],
    airlines: {},
    routesCount: 0,

    // Projections & Rendering
    projectionType: 'flat', // 'globe' or 'flat'
    projection: null,
    path: null,
    canvas: null,
    ctx: null,
    width: window.innerWidth,
    height: window.innerHeight,
    devicePixelRatio: window.devicePixelRatio || 1,

    // Interaction & View
    scale: {
        globe: 300,
        flat: 240
    },
    zoom: 1,
    rotation: [0, -20, 0], // [lambda, phi, gamma]
    translation: [0, 0],
    isDragging: false,
    dragStart: [0, 0],
    dragRotationStart: [0, 0],
    dragTranslationStart: [0, 0],

    // Animation control
    autoRotate: false,
    rotationSpeed: 0.1, // degrees per frame
    lastFrameTime: 0,
    animFrameId: null,

    // Sidebar transition state
    sidebarCollapsed: window.innerWidth <= 768,
    sidebarOffsetTransition: window.innerWidth <= 768 ? 0.0 : 1.0, // 0.0 = collapsed, 1.0 = open

    // PERF: dirty-flag — only repaint when something changed
    needsRender: true,

    // Filtering State
    activeTab: 'airline', // 'airline' or 'location'
    connectionType: 'direct', // 'direct' or 'connecting'
    activeFilter: {
        type: null, // 'airline' or 'location'
        value: null // airline IATA code or airport index
    },
    locationToIndex: null,  // optional second airport for point-to-point mode

    // Render cache / animated items
    activeRoutes: [],
    // PERF: pre-built GeoJSON features for active routes (rebuilt only on filter change)
    activeRouteFeatures: [],
    activeAirportsSet: null,
    particles: [], // animating planes
    selectedAirportIndex: null,
    hoveredItem: null, // airport or route under cursor
    hoveredHubIndex: null, // hub airport index for path highlighting on sidebar hover
    hoveredPath: null, // exact path object for 2-stop highlighting on sidebar hover

    // PERF: cached static geometry
    graticuleGeometry: null,

    // PERF: hover rAF throttle
    hoverPending: false,
    lastMouseEvent: null,

    // PERF: resize debounce timer
    resizeTimer: null,

    // PERF: animateRotation in flight flag
    rotationAnimating: false,
    cameraAnimFrameId: null,

    // Leaflet Integration State
    leafletMap: null,
    leafletRoutesLayer: null,
    leafletAirportsLayer: null,
    leafletParticlesLayer: null,
    leafletSatelliteLayer: null,
    leafletVectorLayer: null,
    satelliteActive: false,
};

// Canvas colour palettes — swapped on theme toggle
function getThemeColors() {
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    if (isLight) {
        return {
            bgBase: '#dde4f0',
            ocean: '#c8d5eb',
            landFill: '#e8eef8',
            landStroke: '#b0bcd8',
            graticule: '#c5cfe6',
            unBorder: '#99aace',
            routeInactive: 'rgba(96, 64, 224, 0.07)',
            routeActive: '#0088bb',
            routeActiveGlow: 'rgba(0, 136, 187, 0.4)',
            routeLocation: '#d6004a',
            routeLocationGlow: 'rgba(214, 0, 74, 0.4)',
            routeAirline: '#c47a00',
            routeAirlineGlow: 'rgba(196, 122, 0, 0.4)',
            routeDirect: '#1aaa50',
            routeDirectGlow: 'rgba(26, 170, 80, 0.45)',
            routeConnecting: '#b89000',
            routeConnectingGlow: 'rgba(184, 144, 0, 0.4)',
            routeConnectingStroke: 'rgba(184, 144, 0, 0.6)',
            routeConnecting2: '#d62424',
            routeConnecting2Glow: 'rgba(214, 36, 36, 0.4)',
            routeConnecting2Stroke: 'rgba(214, 36, 36, 0.65)',
            airportBase: '#6040e0',
            airportGlow: 'rgba(96, 64, 224, 0.45)',
            airportActive: '#0088bb',
            particleCyan: '#0088bb',
            particlePink: '#d6004a',
            particleAirline: '#c47a00',
            particleDirect: '#1aaa50',
            particleConnecting: '#b89000',
            particleConnecting2: '#d62424'
        };
    }
    return {
        bgBase: '#06040a',
        ocean: '#090615',
        landFill: '#141022',
        landStroke: '#251e3c',
        graticule: '#1b162f',
        unBorder: '#382b68',
        routeInactive: 'rgba(121, 82, 245, 0.08)',
        routeActive: '#00f2fe',
        routeActiveGlow: 'rgba(0, 242, 254, 0.4)',
        routeLocation: '#ff3377',
        routeLocationGlow: 'rgba(255, 51, 119, 0.4)',
        routeAirline: '#f5a623',
        routeAirlineGlow: 'rgba(245, 166, 35, 0.4)',
        routeDirect: '#39e07a',
        routeDirectGlow: 'rgba(57, 224, 122, 0.45)',
        routeConnecting: '#f5e642',
        routeConnectingGlow: 'rgba(245, 230, 66, 0.4)',
        routeConnectingStroke: 'rgba(245, 230, 66, 0.6)',
        routeConnecting2: '#ff4d4d',
        routeConnecting2Glow: 'rgba(255, 77, 77, 0.45)',
        routeConnecting2Stroke: 'rgba(255, 77, 77, 0.65)',
        airportBase: '#7952f5',
        airportGlow: 'rgba(121, 82, 245, 0.5)',
        airportActive: '#00f2fe',
        particleCyan: '#00f2fe',
        particlePink: '#ff3377',
        particleAirline: '#f5a623',
        particleDirect: '#39e07a',
        particleConnecting: '#f5e642',
        particleConnecting2: '#ff4d4d'
    };
}

// Initialize Application on Window Load
window.addEventListener('DOMContentLoaded', () => {
    try {
        initTheme();
        initCanvas();
        initUI();
        loadData();
    } catch (err) {
        console.error("Critical initialization failure:", err);
        const loader = document.getElementById('loader-text');
        if (loader) {
            loader.innerText = "Startup Error: " + err.message;
            loader.style.color = "#ff3377";
        }
    }

    // PERF: debounced resize handler
    window.addEventListener('resize', handleResize);
});

// Theme initialisation — reads localStorage, applies to html element, wires toggle button
function initTheme() {
    const saved = localStorage.getItem('aeroflow-theme') || 'dark';
    applyTheme(saved, false);

    const btn = document.getElementById('theme-toggle');
    btn.addEventListener('click', () => {
        const current = document.documentElement.getAttribute('data-theme') || 'dark';
        const next = current === 'dark' ? 'light' : 'dark';

        // Brief spin animation on the icon
        btn.classList.add('switching');
        setTimeout(() => btn.classList.remove('switching'), 400);

        applyTheme(next, true);
    });
}

function applyTheme(theme, save) {
    document.documentElement.setAttribute('data-theme', theme);
    if (save) localStorage.setItem('aeroflow-theme', theme);

    const icon = document.getElementById('theme-icon');
    const label = document.getElementById('theme-label');

    if (theme === 'light') {
        icon.setAttribute('data-lucide', 'sun');
        label.textContent = 'Light';
    } else {
        icon.setAttribute('data-lucide', 'moon');
        label.textContent = 'Dark';
    }

    // Re-render icon (lucide may already be loaded)
    if (window.lucide) lucide.createIcons({ nodes: [icon] });

    // Repaint canvas with new colour palette
    markDirty();
    // Also re-spawn particles so they pick up new colours
    if (state.activeRoutes.length) initParticles();
    // Update Leaflet vector basemap styles (land, oceans, borders) with new theme colors
    if (state.leafletMap) {
        updateLeafletLayers();
    }
}

// Canvas Setup
function initCanvas() {
    state.canvas = document.getElementById('mapCanvas');
    state.ctx = state.canvas.getContext('2d');

    resizeCanvas();
    setupProjections();
    setupInteractions();
    initLeafletMap();

    // PERF: cache graticule geometry once — it never changes
    state.graticuleGeometry = d3.geoGraticule()();
}

function updateBaseScales() {
    const isMobile = state.width <= 768;
    const sidebarWidth = isMobile ? 0 : 380;
    const currentSidebarWidth = sidebarWidth * state.sidebarOffsetTransition;
    const availableWidth = state.width - currentSidebarWidth;
    const refDimension = Math.min(availableWidth, state.height);
    
    // Calculate responsive base scales with sensible bounds to prevent overflow/too tiny views
    state.scale.globe = Math.max(120, refDimension * 0.38);
    state.scale.flat = Math.max(100, refDimension * 0.30);
}

function resizeCanvas() {
    state.width = window.innerWidth;
    state.height = window.innerHeight;

    const dpr = state.devicePixelRatio;
    state.canvas.width = state.width * dpr;
    state.canvas.height = state.height * dpr;

    state.canvas.style.width = `${state.width}px`;
    state.canvas.style.height = `${state.height}px`;

    // Calculate responsive base scales
    updateBaseScales();

    // PERF: use setTransform instead of accumulating ctx.scale() on every resize
    state.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function handleResize() {
    // PERF: debounce — only recompute after 150ms of no more resize events
    clearTimeout(state.resizeTimer);
    state.resizeTimer = setTimeout(() => {
        resizeCanvas();
        setupProjections();
        markDirty();
    }, 150);
}

// Setup Projections (D3 Integration)
function setupProjections() {
    const isMobile = state.width <= 768;
    const shift = isMobile ? 0 : 100 * state.sidebarOffsetTransition;
    const center = [state.width / 2 + shift, state.height / 2];

    if (state.projectionType === 'globe') {
        state.projection = d3.geoOrthographic()
            .scale(state.scale.globe * state.zoom)
            .translate(center)
            .rotate(state.rotation)
            .clipAngle(90);
    } else {
        state.projection = d3.geoEqualEarth()
            .scale(state.scale.flat * state.zoom)
            .translate([center[0] + state.translation[0], center[1] + state.translation[1]])
            .rotate([state.rotation[0], 0, 0]);
    }

    state.path = d3.geoPath()
        .projection(state.projection)
        .context(state.ctx);
}

// Setup Drag & Zoom interactions on the canvas
function setupInteractions() {
    const canvas = state.canvas;

    // Drag control
    canvas.addEventListener('mousedown', (e) => {
        clearActiveRegionButtons();
        state.isDragging = true;
        state.dragStart = [e.clientX, e.clientY];
        state.dragRotationStart = [...state.rotation];
        state.dragTranslationStart = [...state.translation];

        if (state.autoRotate) {
            toggleAutoRotate(false);
        }
    });

    window.addEventListener('mousemove', (e) => {
        // PERF: store latest event for rAF-throttled hover, dispatch at most once per frame
        state.lastMouseEvent = e;
        if (!state.hoverPending) {
            state.hoverPending = true;
            requestAnimationFrame(() => {
                if (state.lastMouseEvent) {
                    handleHoverProximity(state.lastMouseEvent);
                }
                state.hoverPending = false;
            });
        }

        if (!state.isDragging) return;

        const dx = e.clientX - state.dragStart[0];
        const dy = e.clientY - state.dragStart[1];

        if (state.projectionType === 'globe') {
            const sensitivity = 0.25 / state.zoom;
            state.rotation[0] = state.dragRotationStart[0] + dx * sensitivity;
            state.rotation[1] = state.dragRotationStart[1] - dy * sensitivity;
            state.rotation[1] = Math.max(-85, Math.min(85, state.rotation[1]));
        } else {
            const sensitivity = 0.25 / state.zoom;
            state.rotation[0] = state.dragRotationStart[0] + dx * sensitivity;
            state.translation[1] = state.dragTranslationStart[1] + dy;
            state.translation[0] = state.dragTranslationStart[0] + dx * 0.5;
        }

        // PERF: update projection once per drag event (not via setupProjections which is heavier call)
        setupProjections();
        markDirty();
    });

    window.addEventListener('mouseup', () => {
        state.isDragging = false;
    });

    // Touch dragging & pinch-to-zoom
    canvas.addEventListener('touchstart', (e) => {
        clearActiveRegionButtons();
        
        if (e.touches.length === 1) {
            // Single-finger dragging
            state.isDragging = true;
            const touch = e.touches[0];
            state.dragStart = [touch.clientX, touch.clientY];
            state.dragRotationStart = [...state.rotation];
            state.dragTranslationStart = [...state.translation];
            state.isPinching = false;
            
            if (state.autoRotate) {
                toggleAutoRotate(false);
            }
        } else if (e.touches.length === 2) {
            // Pinch-to-zoom setup
            state.isDragging = false;
            state.isPinching = true;
            const t1 = e.touches[0];
            const t2 = e.touches[1];
            const dx = t1.clientX - t2.clientX;
            const dy = t1.clientY - t2.clientY;
            state.pinchStartDist = Math.sqrt(dx * dx + dy * dy);
            state.pinchStartZoom = state.zoom;
        }
    }, { passive: true });

    canvas.addEventListener('touchmove', (e) => {
        if (state.isDragging && e.touches.length === 1) {
            const touch = e.touches[0];
            const dx = touch.clientX - state.dragStart[0];
            const dy = touch.clientY - state.dragStart[1];

            if (state.projectionType === 'globe') {
                const sensitivity = 0.25 / state.zoom;
                state.rotation[0] = state.dragRotationStart[0] + dx * sensitivity;
                state.rotation[1] = state.dragRotationStart[1] - dy * sensitivity;
                state.rotation[1] = Math.max(-85, Math.min(85, state.rotation[1]));
            } else {
                const sensitivity = 0.25 / state.zoom;
                state.rotation[0] = state.dragRotationStart[0] + dx * sensitivity;
                state.translation[1] = state.dragTranslationStart[1] + dy;
                state.translation[0] = state.dragTranslationStart[0] + dx * 0.5;
            }

            setupProjections();
            markDirty();
        } else if (state.isPinching && e.touches.length === 2) {
            const t1 = e.touches[0];
            const t2 = e.touches[1];
            const dx = t1.clientX - t2.clientX;
            const dy = t1.clientY - t2.clientY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            
            if (state.pinchStartDist > 0) {
                const ratio = dist / state.pinchStartDist;
                state.zoom = Math.max(0.6, Math.min(250, state.pinchStartZoom * ratio));
                setupProjections();
                markDirty();
            }
        }
    }, { passive: true });

    canvas.addEventListener('touchend', (e) => {
        if (e.touches.length === 0) {
            state.isDragging = false;
            state.isPinching = false;
        } else if (e.touches.length === 1) {
            // Fall back to single-finger dragging with the remaining finger
            state.isPinching = false;
            state.isDragging = true;
            const touch = e.touches[0];
            state.dragStart = [touch.clientX, touch.clientY];
            state.dragRotationStart = [...state.rotation];
            state.dragTranslationStart = [...state.translation];
        }
    }, { passive: true });

    // Zoom control
    canvas.addEventListener('wheel', (e) => {
        clearActiveRegionButtons();
        e.preventDefault();
        const zoomSensitivity = 0.08;

        if (e.deltaY < 0) {
            state.zoom = Math.min(250, state.zoom + zoomSensitivity * state.zoom);
        } else {
            state.zoom = Math.max(0.6, state.zoom - zoomSensitivity * state.zoom);
        }

        setupProjections();
        markDirty();
    }, { passive: false });

    // Click control to select airports on D3 canvas
    canvas.addEventListener('click', (e) => {
        if (!state.dragStart) return;
        const dx = e.clientX - state.dragStart[0];
        const dy = e.clientY - state.dragStart[1];
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        // If the mouse barely moved, register it as a click rather than a drag
        if (dist < 5) {
            // Light-dismiss sidebar on mobile if expanded
            if (window.innerWidth <= 768 && !state.sidebarCollapsed) {
                toggleSidebar(true);
                return;
            }

            if (state.hoveredItem) {
                const apIdx = state.airports.indexOf(state.hoveredItem);
                if (apIdx !== -1) {
                    handleAirportClick(apIdx);
                }
            }
        }
    });
}

// PERF: dirty-flag helper — marks the scene as needing a repaint
function markDirty() {
    state.needsRender = true;
}

// Fetch files and load data
async function loadData() {
    const loadingScreen = document.getElementById('loading-screen');
    const progressFill = document.getElementById('progress-fill');
    const loaderText = document.getElementById('loader-text');

    try {
        loaderText.innerText = "Downloading global flight assets...";
        progressFill.style.width = "30%";

        // Parallel Fetch both data files
        const [geojsonRes, dataRes] = await Promise.all([
            fetch('data/countries.geojson?v=1'),
            fetch('data/data.json?v=7')
        ]);

        progressFill.style.width = "65%";
        loaderText.innerText = "Parsing and indexing databases...";

        // Parallel Parse JSON payloads
        const [countriesGeoJSON, aerodata] = await Promise.all([
            geojsonRes.json(),
            dataRes.json()
        ]);

        state.countriesGeoJSON = countriesGeoJSON;
        state.airports = aerodata.airports;
        state.airlines = aerodata.airlines;

        // Count total routes
        state.routesCount = 0;
        Object.values(state.airlines).forEach(al => {
            state.routesCount += al.routesCount;
        });

        // Lucide Icons activation
        lucide.createIcons();

        // 1. Activate the Location Tab in the sidebar UI
        activateLocationTab();

        // 2. Pre-select Melbourne (Australia, IATA: MEL) as the absolute default
        const melIdx = state.airports.findIndex(ap => ap.iata === 'MEL');
        const defaultIdx = melIdx !== -1 ? melIdx : 2554;
        setLocationFilter(defaultIdx);

        // 3. Request user's physical location in the background with IP fallback
        const tryIPGeolocation = async () => {
            try {
                const response = await fetch('https://freeipapi.com/api/json');
                if (!response.ok) throw new Error('IP geolocation API error');
                const data = await response.json();
                if (data && typeof data.latitude === 'number' && typeof data.longitude === 'number') {
                    const closestApIdx = getClosestAirport(data.latitude, data.longitude);
                    setLocationFilter(closestApIdx);
                    console.log("Successfully determined closest international airport via IP:", state.airports[closestApIdx].iata);
                }
            } catch (err) {
                console.warn("IP geolocation fallback also failed. Staying with Melbourne.", err);
            }
        };

        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    const lat = position.coords.latitude;
                    const lon = position.coords.longitude;
                    const closestApIdx = getClosestAirport(lat, lon);
                    setLocationFilter(closestApIdx);
                    console.log("Successfully determined closest international airport via Geolocation:", state.airports[closestApIdx].iata);
                },
                (error) => {
                    console.warn("Geolocation access denied or failed. Trying IP-based fallback...", error);
                    tryIPGeolocation();
                },
                { timeout: 8000, enableHighAccuracy: false }
            );
        } else {
            console.log("Geolocation API not supported. Trying IP-based fallback...");
            tryIPGeolocation();
        }

        // Complete loader
        progressFill.style.width = "100%";
        loaderText.innerText = "Ready!";

        setTimeout(() => {
            loadingScreen.style.opacity = 0;
            setTimeout(() => {
                loadingScreen.style.display = 'none';
                markDirty();
                // Trigger animation loop
                startAnimationLoop();
            }, 500);
        }, 500);

    } catch (err) {
        console.error("Failed to load aerodata:", err);
        loaderText.innerText = "Error loading data. Retrying...";
        loaderText.style.color = "#ff3377";
    }
}

// Initialize UI Panel controls and listeners
function initUI() {
    // 1. Sidebar tab switching
    const tabAirline = document.getElementById('tab-airline');
    const tabLocation = document.getElementById('tab-location');
    const searchAirlineCont = document.getElementById('search-airline-container');
    const searchLocationCont = document.getElementById('search-location-container');

    tabAirline.addEventListener('click', () => {
        state.activeTab = 'airline';
        tabAirline.classList.add('active');
        tabAirline.setAttribute('aria-selected', 'true');
        tabLocation.classList.remove('active');
        tabLocation.setAttribute('aria-selected', 'false');

        searchAirlineCont.classList.add('active');
        searchLocationCont.classList.remove('active');

        hideSuggestions();
    });

    tabLocation.addEventListener('click', () => {
        state.activeTab = 'location';
        tabLocation.classList.add('active');
        tabLocation.setAttribute('aria-selected', 'true');
        tabAirline.classList.remove('active');
        tabAirline.setAttribute('aria-selected', 'false');

        searchLocationCont.classList.add('active');
        searchAirlineCont.classList.remove('active');

        hideSuggestions();
    });

    // 2. Search Autocomplete
    const airInput = document.getElementById('airline-search');
    const locInput = document.getElementById('location-search');
    const locToInput = document.getElementById('location-to-search');

    airInput.addEventListener('input', (e) => handleSearchInput('airline', e.target.value));
    locInput.addEventListener('input', (e) => handleSearchInput('location', e.target.value));
    locToInput.addEventListener('input', (e) => handleSearchInput('location-to', e.target.value));

    // Clear input buttons
    const clearAir = document.getElementById('clear-airline');
    const clearLoc = document.getElementById('clear-location');
    const clearLocTo = document.getElementById('clear-location-to');

    clearAir.addEventListener('click', () => {
        airInput.value = '';
        clearAir.style.display = 'none';
        hideSuggestions();
    });

    clearLoc.addEventListener('click', () => {
        locInput.value = '';
        clearLoc.style.display = 'none';
        hideSuggestions();
    });

    clearLocTo.addEventListener('click', () => {
        locToInput.value = '';
        clearLocTo.style.display = 'none';
        hideSuggestions();
    });

    // Chip clear buttons
    document.getElementById('loc-from-clear').addEventListener('click', () => {
        clearLocationFrom();
    });

    document.getElementById('loc-to-clear').addEventListener('click', () => {
        clearLocationTo();
    });

    // 3. Projections switching
    const btnGlobe = document.getElementById('btn-globe');
    const btnFlat = document.getElementById('btn-flat');
    const projInfo = document.getElementById('projection-info-text');

    btnGlobe.addEventListener('click', () => {
        if (state.projectionType === 'globe') return;
        state.projectionType = 'globe';
        btnGlobe.classList.add('active');
        btnFlat.classList.remove('active');
        if (projInfo) {
            projInfo.innerText = "Orthographic projection: Drag to rotate the planet. Scroll to zoom. Great-circle curves represent real flight paths.";
        }
        
        // Always display Canvas
        document.getElementById('mapCanvas').style.display = 'block';
        const leafletMapEl = document.getElementById('leafletMap');
        if (leafletMapEl) leafletMapEl.style.display = 'none';

        // Keep satellite checkbox panel visible in 3D mode (if present)
        const satToggleBox = document.getElementById('sat-toggle-box');
        if (satToggleBox) satToggleBox.style.display = 'flex';

        setupProjections();
        markDirty();
    });

    btnFlat.addEventListener('click', () => {
        if (state.projectionType === 'flat') return;
        state.projectionType = 'flat';
        btnFlat.classList.add('active');
        btnGlobe.classList.remove('active');
        if (projInfo) {
            projInfo.innerText = "2D Flat Map: A clean vector projection showing global sovereign borders. Toggle 'Satellite Imagery' for high-resolution tiled satellite views.";
        }
        
        // Always display Canvas
        document.getElementById('mapCanvas').style.display = 'block';
        const leafletMapEl = document.getElementById('leafletMap');
        if (leafletMapEl) leafletMapEl.style.display = 'none';

        // Show satellite checkbox panel in 2D mode (if present)
        const satToggleBox = document.getElementById('sat-toggle-box');
        if (satToggleBox) satToggleBox.style.display = 'flex';

        setupProjections();
        markDirty();
    });

    // Wire up Satellite Imagery button click listener
    const ctrlSatellite = document.getElementById('ctrl-satellite');
    if (ctrlSatellite) {
        // Initialize state on startup
        if (state.satelliteActive) {
            ctrlSatellite.classList.add('active');
        } else {
            ctrlSatellite.classList.remove('active');
        }

        ctrlSatellite.addEventListener('click', () => {
            state.satelliteActive = !state.satelliteActive;
            if (state.satelliteActive) {
                ctrlSatellite.classList.add('active');
            } else {
                ctrlSatellite.classList.remove('active');
            }
            updateLeafletLayers();
        });
    }

    // 4. Floating HUD Control buttons
    document.getElementById('ctrl-zoom-in').addEventListener('click', () => {
        clearActiveRegionButtons();
        if (state.projectionType === 'flat' && state.leafletMap) {
            state.leafletMap.zoomIn();
        } else {
            state.zoom = Math.min(250, state.zoom + 0.15 * state.zoom);
            setupProjections();
            markDirty();
        }
    });

    document.getElementById('ctrl-zoom-out').addEventListener('click', () => {
        clearActiveRegionButtons();
        if (state.projectionType === 'flat' && state.leafletMap) {
            state.leafletMap.zoomOut();
        } else {
            state.zoom = Math.max(0.6, state.zoom - 0.15 * state.zoom);
            setupProjections();
            markDirty();
        }
    });

    document.getElementById('ctrl-reset').addEventListener('click', () => {
        if (state.projectionType === 'flat' && state.leafletMap) {
            state.leafletMap.setView([20, 0], 2);
            updateActiveRegionButton('atlantic');
            updateLeafletLayers();
        } else {
            animateCameraTo([0, -20, 0], 1.0, [0, 0]);
            updateActiveRegionButton('atlantic');
        }
    });

    const btnAutoRotate = document.getElementById('ctrl-auto-rotate');
    btnAutoRotate.addEventListener('click', () => {
        toggleAutoRotate(!state.autoRotate);
    });

    // 4b. Focus region dock buttons
    const regionButtons = document.querySelectorAll('.focus-region-btn');
    regionButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const regionId = btn.getAttribute('data-region');
            const target = REGION_COORDINATES[regionId];
            if (target) {
                animateCameraTo(target.rotation, target.zoom, target.translation);
                updateActiveRegionButton(regionId);
            }
        });
    });

    // 5. Close Pill button
    document.getElementById('filter-pill-close').addEventListener('click', () => {
        resetFilter();
    });

    // 6. Connection Type toggle buttons
    const btnDirect = document.getElementById('btn-direct');
    const btnConnecting = document.getElementById('btn-connecting');
    const btnConnecting2 = document.getElementById('btn-connecting-2');

    btnDirect.addEventListener('click', () => {
        if (state.connectionType === 'direct') return;
        state.connectionType = 'direct';
        btnDirect.classList.add('active');
        btnConnecting.classList.remove('active');
        btnConnecting2.classList.remove('active');
        reapplyActiveFilter();
    });

    btnConnecting.addEventListener('click', () => {
        if (state.connectionType === 'connecting') return;
        state.connectionType = 'connecting';
        btnConnecting.classList.add('active');
        btnDirect.classList.remove('active');
        btnConnecting2.classList.remove('active');
        reapplyActiveFilter();
    });

    btnConnecting2.addEventListener('click', () => {
        if (state.connectionType === 'connecting-2') return;
        state.connectionType = 'connecting-2';
        btnConnecting2.classList.add('active');
        btnDirect.classList.remove('active');
        btnConnecting.classList.remove('active');
        reapplyActiveFilter();
    });

    // 7. Sidebar toggle click listener
    document.getElementById('sidebar-toggle-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        toggleSidebar();
    });

    // 7b. Mobile floating filters trigger
    const mobileFilterBtn = document.getElementById('mobile-filter-btn');
    if (mobileFilterBtn) {
        mobileFilterBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleSidebar();
        });
    }

    // Set responsive startup state for sidebar visual classes
    if (state.sidebarCollapsed) {
        const sidebar = document.getElementById('sidebar-panel');
        if (sidebar) sidebar.classList.add('collapsed');
        const icon = document.getElementById('sidebar-toggle-icon');
        if (icon) {
            icon.setAttribute('data-lucide', 'chevron-right');
            if (window.lucide) lucide.createIcons({ nodes: [icon] });
        }
        if (mobileFilterBtn) {
            mobileFilterBtn.style.display = 'flex';
        }
    }

    // 8. Keyboard hotkey listener ('\' or 's' key to toggle sidebar)
    window.addEventListener('keydown', (e) => {
        const activeEl = document.activeElement;
        const isInput = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable);
        if (isInput) return;

        if (e.key === '\\' || e.key === 's' || e.key === 'S') {
            e.preventDefault();
            toggleSidebar();
        }
    });

    // 9. Initialize bottom status bar metadata and reload hooks
    initStatusBar();
}

// Initialize Bottom Status Bar (Live Release & Last Update time)
function initStatusBar() {
    // 1. Live Release Metadata
    const releaseVersion = "v1.5.2"; // Corresponds to script v=17 — absolute HTTPS PWA start_url for iOS
    const lastUpdateIso = "2026-11-02T06:35:00Z"; // ISO 8601 UTC timestamp of last update
    
    // Set Version Text
    const versionVal = document.getElementById('status-version-val');
    if (versionVal) {
        versionVal.textContent = releaseVersion;
    }
    
    // Format and Set Last Updated Date
    const timeVal = document.getElementById('status-time-val');
    if (timeVal) {
        try {
            const date = new Date(lastUpdateIso);
            // Format using local browser settings config to handle timezone automatically
            const formatter = new Intl.DateTimeFormat(navigator.language, {
                dateStyle: 'medium',
                timeStyle: 'short'
            });
            timeVal.textContent = formatter.format(date);
        } catch (e) {
            console.error("Failed to parse or format update time:", e);
            timeVal.textContent = lastUpdateIso; // Fallback to raw string
        }
    }
    
    // Setup Force Reload Button
    const refreshBtn = document.getElementById('status-refresh-btn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', async () => {
            // Visual feedback on click: spin the icon
            const icon = refreshBtn.querySelector('i');
            if (icon) {
                icon.style.animation = 'none';
                // Trigger reflow to restart animation
                void icon.offsetHeight; 
                icon.style.animation = 'spinRefresh 0.8s ease-in-out';
            }
            
            // Hard refresh bypasses browser cache for the main resource and loads latest changes
            try {
                await fetch(window.location.href, {
                    headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' },
                    cache: 'reload'
                });
            } catch (e) {
                console.warn("Bypass cache pre-fetch failed, executing standard reload:", e);
            }
            window.location.reload();
        });
    }

    // Activate Lucide icons for the status bar
    if (window.lucide) {
        const statusBarEl = document.getElementById('live-status-bar');
        if (statusBarEl) {
            lucide.createIcons({ nodes: [statusBarEl] });
        }
    }
}

// Re-apply active filters when toggling modes
function reapplyActiveFilter() {
    if (state.activeFilter.type === 'airline') {
        setAirlineFilter(state.activeFilter.value);
    } else if (state.activeFilter.type === 'location') {
        if (state.locationToIndex !== null) {
            // Re-run point-to-point with current locationToIndex
            applyPointToPointFilter(state.activeFilter.value, state.locationToIndex);
        } else {
            setLocationFilter(state.activeFilter.value);
        }
    } else {
        resetFilter();
    }
}

// Enable/Disable auto rotation
function toggleAutoRotate(enabled) {
    state.autoRotate = enabled;
    const btn = document.getElementById('ctrl-auto-rotate');
    const icon = btn.querySelector('i');

    if (enabled) {
        btn.classList.add('active');
        // PERF: update just the icon attribute and re-create only that single icon
        icon.setAttribute('data-lucide', 'play');
    } else {
        btn.classList.remove('active');
        icon.setAttribute('data-lucide', 'pause');
    }
    // PERF: replace only the single icon element instead of scanning the full DOM
    lucide.createIcons({ nodes: [icon] });
}

// Toggle Sidebar panel collapse/expand
function toggleSidebar(collapsed) {
    if (collapsed === undefined) {
        collapsed = !state.sidebarCollapsed;
    }
    state.sidebarCollapsed = collapsed;

    const sidebar = document.getElementById('sidebar-panel');
    const toggleBtn = document.getElementById('sidebar-toggle-btn');
    const icon = document.getElementById('sidebar-toggle-icon');

    if (state.sidebarCollapsed) {
        sidebar.classList.add('collapsed');
        icon.setAttribute('data-lucide', 'chevron-right');
        toggleBtn.title = "Expand Sidebar (Press '\')";
    } else {
        sidebar.classList.remove('collapsed');
        icon.setAttribute('data-lucide', 'chevron-left');
        toggleBtn.title = "Collapse Sidebar (Press '\')";
    }

    // Re-initialize only this specific icon
    if (window.lucide) {
        lucide.createIcons({ nodes: [icon] });
    }

    // Update mobile filters trigger visibility
    const mobileFilterBtn = document.getElementById('mobile-filter-btn');
    if (mobileFilterBtn) {
        mobileFilterBtn.style.display = (state.sidebarCollapsed && window.innerWidth <= 768) ? 'flex' : 'none';
    }

    markDirty();
}

// Autocomplete logic
function handleSearchInput(type, query) {
    let clearBtnId, suggestListId;
    if (type === 'airline') {
        clearBtnId = 'clear-airline'; suggestListId = 'airline-suggestions';
    } else if (type === 'location-to') {
        clearBtnId = 'clear-location-to'; suggestListId = 'location-to-suggestions';
    } else {
        clearBtnId = 'clear-location'; suggestListId = 'location-suggestions';
    }

    const clearBtn = document.getElementById(clearBtnId);
    const suggestList = document.getElementById(suggestListId);

    if (!query || query.trim().length < 2) {
        clearBtn.style.display = 'none';
        suggestList.style.display = 'none';
        return;
    }

    clearBtn.style.display = 'block';

    const cleanQuery = query.toLowerCase().trim();
    let matches = [];

    if (type === 'airline') {
        Object.values(state.airlines).forEach(al => {
            if (al.name.toLowerCase().includes(cleanQuery) || al.iata.toLowerCase().includes(cleanQuery)) {
                matches.push(al);
            }
        });
        matches.sort((a, b) => b.routesCount - a.routesCount);
        renderAirlineSuggestions(matches.slice(0, 6));
    } else {
        state.airports.forEach((ap, index) => {
            if (
                ap.flightsCount > 0 && (
                    ap.iata.toLowerCase().includes(cleanQuery) ||
                    ap.city.toLowerCase().includes(cleanQuery) ||
                    ap.name.toLowerCase().includes(cleanQuery) ||
                    ap.country.toLowerCase().includes(cleanQuery)
                )
            ) {
                matches.push({ ...ap, originalIndex: index });
            }
        });
        matches.sort((a, b) => b.flightsCount - a.flightsCount);
        if (type === 'location-to') {
            renderLocationToSuggestions(matches.slice(0, 6));
        } else {
            renderLocationSuggestions(matches.slice(0, 6));
        }
    }
}

function renderAirlineSuggestions(matches) {
    const list = document.getElementById('airline-suggestions');
    list.innerHTML = '';

    if (matches.length === 0) {
        list.innerHTML = `<div class="autocomplete-item"><span class="title">No airlines found</span></div>`;
        list.style.display = 'block';
        return;
    }

    matches.forEach(al => {
        const item = document.createElement('div');
        item.className = 'autocomplete-item';
        item.innerHTML = `
            <span class="title">${al.name}</span>
            <div class="subtitle">
                <span>Code: ${al.iata}</span>
                <span class="sub-badge">${al.routesCount} routes</span>
            </div>
        `;

        item.addEventListener('click', () => {
            setAirlineFilter(al.iata);
            hideSuggestions();
            document.getElementById('airline-search').value = '';
            document.getElementById('clear-airline').style.display = 'none';
        });

        list.appendChild(item);
    });

    list.style.display = 'block';
}

function renderLocationSuggestions(matches) {
    const list = document.getElementById('location-suggestions');
    list.innerHTML = '';

    if (matches.length === 0) {
        list.innerHTML = `<div class="autocomplete-item"><span class="title">No airports found</span></div>`;
        list.style.display = 'block';
        return;
    }

    matches.forEach(ap => {
        const item = document.createElement('div');
        item.className = 'autocomplete-item';
        item.innerHTML = `
            <span class="title">${ap.city} (${ap.iata})</span>
            <div class="subtitle">
                <span>${ap.name}</span>
                <span class="sub-badge">${ap.flightsCount} flights</span>
            </div>
        `;

        item.addEventListener('click', () => {
            setLocationFilter(ap.originalIndex);
            hideSuggestions();
            document.getElementById('location-search').value = '';
            document.getElementById('clear-location').style.display = 'none';
        });

        list.appendChild(item);
    });

    list.style.display = 'block';
}

function renderLocationToSuggestions(matches) {
    const list = document.getElementById('location-to-suggestions');
    list.innerHTML = '';

    if (matches.length === 0) {
        list.innerHTML = `<div class="autocomplete-item"><span class="title">No airports found</span></div>`;
        list.style.display = 'block';
        return;
    }

    matches.forEach(ap => {
        const item = document.createElement('div');
        item.className = 'autocomplete-item';
        item.innerHTML = `
            <span class="title">${ap.city} (${ap.iata})</span>
            <div class="subtitle">
                <span>${ap.name}</span>
                <span class="sub-badge">${ap.flightsCount} flights</span>
            </div>
        `;

        item.addEventListener('click', () => {
            setLocationToFilter(ap.originalIndex);
            hideSuggestions();
            document.getElementById('location-to-search').value = '';
            document.getElementById('clear-location-to').style.display = 'none';
        });

        list.appendChild(item);
    });

    list.style.display = 'block';
}

function hideSuggestions() {
    document.getElementById('airline-suggestions').style.display = 'none';
    document.getElementById('location-suggestions').style.display = 'none';
    document.getElementById('location-to-suggestions').style.display = 'none';
}

// PERF: Pre-build GeoJSON features for active routes once on filter change,
// instead of creating a new object per route per frame in the render loop.
function buildRouteFeatures() {
    state.activeRouteFeatures = state.activeRoutes.map(r => {
        // Pre-interpolate geodesic path along great-circle coordinates
        // This ensures routes appear as beautiful curved paths in both D3 and Leaflet
        const interpolator = d3.geoInterpolate([r.src.lon, r.src.lat], [r.dst.lon, r.dst.lat]);
        const coords = [];
        const segments = 15;
        for (let i = 0; i <= segments; i++) {
            coords.push(interpolator(i / segments));
        }
        return {
            type: "Feature",
            geometry: {
                type: "LineString",
                coordinates: coords
            },
            properties: { 
                routeType: r.type || 'direct', 
                filterType: state.activeFilter.type,
                srcIata: r.src.iata,
                dstIata: r.dst.iata,
                airline: r.airline
            }
        };
    });

    // Group features into MultiLineStrings by type for 100x faster batch drawing
    const coordsByStyle = {
        direct: [],
        connecting: [],
        connecting2: []
    };

    state.activeRouteFeatures.forEach(feat => {
        const type = feat.properties.routeType;
        if (type === 'connecting') {
            coordsByStyle.connecting.push(feat.geometry.coordinates);
        } else if (type === 'connecting-2') {
            coordsByStyle.connecting2.push(feat.geometry.coordinates);
        } else {
            coordsByStyle.direct.push(feat.geometry.coordinates);
        }
    });

    state.activeRouteMultiLines = {
        direct: coordsByStyle.direct.length ? {
            type: "Feature",
            geometry: {
                type: "MultiLineString",
                coordinates: coordsByStyle.direct
            }
        } : null,
        connecting: coordsByStyle.connecting.length ? {
            type: "Feature",
            geometry: {
                type: "MultiLineString",
                coordinates: coordsByStyle.connecting
            }
        } : null,
        connecting2: coordsByStyle.connecting2.length ? {
            type: "Feature",
            geometry: {
                type: "MultiLineString",
                coordinates: coordsByStyle.connecting2
            }
        } : null
    };

    // Cache the set of active airports (connected to flight paths)
    state.activeAirportsSet = new Set();
    state.activeRoutes.forEach(r => {
        if (r.src) state.activeAirportsSet.add(r.src);
        if (r.dst) state.activeAirportsSet.add(r.dst);
    });

    // Sync Leaflet map layers automatically when route features are rebuilt
    updateLeafletLayers();
}

// Filters implementation
function setAirlineFilter(iata) {
    const al = state.airlines[iata];
    if (!al) return;

    state.activeFilter = { type: 'airline', value: iata };
    state.selectedAirportIndex = null;

    // Build direct routes for this airline
    const directRoutes = al.routes.map(r => ({
        src: state.airports[r[0]],
        dst: state.airports[r[1]],
        airline: iata,
        type: 'direct'
    }));

    // Collect all airport indices directly served by this airline
    const directServedSet = new Set();
    al.routes.forEach(r => {
        directServedSet.add(r[0]);
        directServedSet.add(r[1]);
    });

    state.activeRoutes = [...directRoutes];

    // If 1-stop mode: find outbound legs from every airline hub to airports not directly served
    if (state.connectionType === 'connecting') {
        const connectingRoutes = [];
        const seenConnectingKey = new Set();

        directServedSet.forEach(hubIdx => {
            Object.entries(state.airlines).forEach(([alIata, otherAl]) => {
                otherAl.routes.forEach(r => {
                    let destIdx = null;
                    if (r[0] === hubIdx) destIdx = r[1];
                    else if (r[1] === hubIdx) destIdx = r[0];

                    if (destIdx !== null && !directServedSet.has(destIdx)) {
                        const key = `${hubIdx}-${destIdx}`;
                        if (!seenConnectingKey.has(key)) {
                            seenConnectingKey.add(key);
                            connectingRoutes.push({
                                src: state.airports[hubIdx],
                                dst: state.airports[destIdx],
                                airline: alIata,
                                type: 'connecting'
                            });
                        }
                    }
                });
            });
        });

        // Sort by destination traffic
        connectingRoutes.sort((a, b) => b.dst.flightsCount - a.dst.flightsCount);
        state.activeRoutes.push(...connectingRoutes);
    } else if (state.connectionType === 'connecting-2') {
        const level2Routes = [];
        const seenLevel2 = new Set();

        // Direct hubs - no arbitrary slice cap!
        const sortedDirectHubs = [...directServedSet]
            .sort((a, b) => (state.airports[b].flightsCount || 0) - (state.airports[a].flightsCount || 0));

        sortedDirectHubs.forEach(hubIdx => {
            Object.entries(state.airlines).forEach(([alIata, otherAl]) => {
                otherAl.routes.forEach(r => {
                    let destIdx = null;
                    if (r[0] === hubIdx) destIdx = r[1];
                    else if (r[1] === hubIdx) destIdx = r[0];

                    if (destIdx !== null && !directServedSet.has(destIdx)) {
                        const key = `${hubIdx}-${destIdx}`;
                        if (!seenLevel2.has(key)) {
                            seenLevel2.add(key);
                            level2Routes.push({
                                src: state.airports[hubIdx],
                                dst: state.airports[destIdx],
                                airline: alIata,
                                type: 'connecting'
                            });
                        }
                    }
                });
            });
        });

        level2Routes.sort((a, b) => b.dst.flightsCount - a.dst.flightsCount);
        state.activeRoutes.push(...level2Routes);

        const activeLevel2Set = new Set(level2Routes.map(r => state.airports.indexOf(r.dst)));

        // Level 3 routes
        const level3Routes = [];
        const seenLevel3 = new Set();

        activeLevel2Set.forEach(hub2Idx => {
            Object.entries(state.airlines).forEach(([alIata, otherAl]) => {
                otherAl.routes.forEach(r => {
                    let destIdx = null;
                    if (r[0] === hub2Idx) destIdx = r[1];
                    else if (r[1] === hub2Idx) destIdx = r[0];

                    if (destIdx !== null && !directServedSet.has(destIdx) && !activeLevel2Set.has(destIdx)) {
                        const key = `${hub2Idx}-${destIdx}`;
                        if (!seenLevel3.has(key)) {
                            seenLevel3.add(key);
                            level3Routes.push({
                                src: state.airports[hub2Idx],
                                dst: state.airports[destIdx],
                                airline: alIata,
                                type: 'connecting-2'
                            });
                        }
                    }
                });
            });
        });

        level3Routes.sort((a, b) => b.dst.flightsCount - a.dst.flightsCount);
        state.activeRoutes.push(...level3Routes);
    }

    // PERF: pre-build route geometry
    buildRouteFeatures();

    focusCameraOnRoutes(state.activeRoutes);
    initParticles();

    // UI Updates
    document.getElementById('active-filter-pill').style.display = 'flex';
    document.getElementById('filter-pill-label').innerText = `Selected Airline: ${al.name}`;

    document.getElementById('stat-airports').innerText = getUniqueAirportsCount(state.activeRoutes);
    document.getElementById('stat-routes').innerText = (state.connectionType === 'connecting' || state.connectionType === 'connecting-2')
        ? state.activeRoutes.length
        : al.routesCount;

    document.getElementById('stat-extra-card').style.display = 'flex';
    document.getElementById('stat-extra-label').innerText = "HQ Country";
    document.getElementById('stat-extra-value').innerText = al.name.split(' ').pop();
    state.airports.forEach(ap => {
        if (ap.iata === iata) document.getElementById('stat-extra-value').innerText = ap.country;
    });

    displayAirlineHubs(al);
    markDirty();
}

function setLocationFilter(apIdx) {
    apIdx = parseInt(apIdx);
    const ap = state.airports[apIdx];
    if (!ap) return;

    state.activeFilter = { type: 'location', value: apIdx };
    state.selectedAirportIndex = apIdx;

    // Update From chip UI
    const fromChip = document.getElementById('loc-from-chip');
    document.getElementById('loc-from-chip-label').innerText = `${ap.city} (${ap.iata})`;
    fromChip.style.display = 'flex';
    lucide.createIcons({ nodes: [fromChip.querySelector('i')] });

    // If a "To" airport is already selected, run point-to-point immediately
    if (state.locationToIndex !== null) {
        applyPointToPointFilter(apIdx, state.locationToIndex);
        return;
    }

    state.activeRoutes = [];

    // 1. Gather all direct routes first
    const directConnectedSet = new Set();
    const directRoutes = [];

    Object.entries(state.airlines).forEach(([alIata, al]) => {
        al.routes.forEach(r => {
            if (r[0] === apIdx || r[1] === apIdx) {
                const src = state.airports[r[0]];
                const dst = state.airports[r[1]];
                const otherIdx = r[0] === apIdx ? r[1] : r[0];
                directConnectedSet.add(otherIdx);
                directRoutes.push({ src, dst, airline: alIata, type: 'direct' });
            }
        });
    });

    state.activeRoutes.push(...directRoutes);

    // 2. If 'connecting' or 'connecting-2' type selected, compute 2-hop layovers
    if (state.connectionType === 'connecting' || state.connectionType === 'connecting-2') {
        const connectingRoutes = [];
        const seenConnectingDest = new Set();

        directConnectedSet.forEach(hubIdx => {
            Object.entries(state.airlines).forEach(([alIata, al]) => {
                al.routes.forEach(r => {
                    let destIdx = null;
                    if (r[0] === hubIdx) destIdx = r[1];
                    else if (r[1] === hubIdx) destIdx = r[0];

                    if (destIdx !== null && destIdx !== apIdx && !directConnectedSet.has(destIdx)) {
                        const key = `${hubIdx}-${destIdx}`;
                        if (!seenConnectingDest.has(key)) {
                            seenConnectingDest.add(key);
                            connectingRoutes.push({
                                src: state.airports[hubIdx],
                                dst: state.airports[destIdx],
                                airline: alIata,
                                type: 'connecting'
                            });
                        }
                    }
                });
            });
        });

        // Group routes by destination to eliminate massive multi-hub redundancies
        const routesByDest = {};
        connectingRoutes.forEach(r => {
            const destIata = r.dst.iata;
            if (!routesByDest[destIata]) {
                routesByDest[destIata] = [];
            }
            routesByDest[destIata].push(r);
        });

        // Sort each destination's paths by hub flightsCount descending
        Object.values(routesByDest).forEach(routes => {
            routes.sort((a, b) => b.src.flightsCount - a.src.flightsCount);
        });

        // Build a fast lookup map for flightsCount by IATA code
        const flightsCountMap = {};
        state.airports.forEach(ap => {
            flightsCountMap[ap.iata] = ap.flightsCount || 0;
        });

        // Sort unique destinations by traffic count descending
        const sortedDests = Object.keys(routesByDest).sort((a, b) => {
            return (flightsCountMap[b] || 0) - (flightsCountMap[a] || 0);
        });

        const roundRobinRoutes = [];

        // Pass 1-8: Multi-pass round-robin selection.
        // This guarantees that 100% of unique destinations get their 1st best path (Pass 0),
        // and only then we fill the remaining slots with secondary/tertiary redundant paths.
        // We completely remove any arbitrary slice cap (previously capped at 1000).
        for (let pass = 0; pass < 8; pass++) {
            sortedDests.forEach(dest => {
                const route = routesByDest[dest][pass];
                if (route) roundRobinRoutes.push(route);
            });
        }

        state.activeRoutes.push(...roundRobinRoutes);

        // 3. If 'connecting-2' type selected, compute 3-hop layovers (2-stop connections)
        if (state.connectionType === 'connecting-2') {
            const level3Routes = [];
            const seenLevel3 = new Set();
            const activeLevel2Set = new Set(connectingRoutes.map(r => state.airports.indexOf(r.dst)));

            activeLevel2Set.forEach(hub2Idx => {
                Object.entries(state.airlines).forEach(([alIata, al]) => {
                    al.routes.forEach(r => {
                        let destIdx = null;
                        if (r[0] === hub2Idx) destIdx = r[1];
                        else if (r[1] === hub2Idx) destIdx = r[0];

                        if (destIdx !== null && destIdx !== apIdx && !directConnectedSet.has(destIdx)) {
                            const key = `${hub2Idx}-${destIdx}`;
                            if (!seenLevel3.has(key)) {
                                seenLevel3.add(key);
                                level3Routes.push({
                                    src: state.airports[hub2Idx],
                                    dst: state.airports[destIdx],
                                    airline: alIata,
                                    type: 'connecting-2'
                                });
                            }
                        }
                    });
                });
            });

            // No cap on level3Routes (previously capped at 200)
            state.activeRoutes.push(...level3Routes);
        }
    }

    // PERF: pre-build route geometry
    buildRouteFeatures();

    focusCameraOnPoints([[ap.lon, ap.lat]]);
    initParticles();

    // UI Updates
    document.getElementById('active-filter-pill').style.display = 'flex';
    document.getElementById('filter-pill-label').innerText = `Location: ${ap.city} (${ap.iata})`;

    document.getElementById('stat-airports').innerText = getUniqueAirportsCount(state.activeRoutes) - 1;
    document.getElementById('stat-routes').innerText = state.activeRoutes.length;

    document.getElementById('stat-extra-card').style.display = 'flex';
    document.getElementById('stat-extra-label').innerText = "Airport Code";
    document.getElementById('stat-extra-value').innerText = `${ap.iata} / ${ap.country.substring(0, 8)}`;

    displayLocationAirlines(apIdx);
    markDirty();
}

// Called when user picks a "To" destination airport
function setLocationToFilter(apIdx) {
    apIdx = parseInt(apIdx);
    const ap = state.airports[apIdx];
    if (!ap) return;

    state.locationToIndex = apIdx;

    // Update To chip UI
    const toChip = document.getElementById('loc-to-chip');
    document.getElementById('loc-to-chip-label').innerText = `${ap.city} (${ap.iata})`;
    toChip.style.display = 'flex';
    lucide.createIcons({ nodes: [toChip.querySelector('i')] });

    // If a "From" airport is already selected, apply point-to-point filter
    if (state.activeFilter.type === 'location' && state.activeFilter.value !== null) {
        applyPointToPointFilter(state.activeFilter.value, apIdx);
    }
    // else: wait for user to pick a From airport
}

// Compute and display routes between two specific airports (direct + 1-stop)
function applyPointToPointFilter(fromIdx, toIdx) {
    fromIdx = parseInt(fromIdx);
    toIdx = parseInt(toIdx);
    const fromAp = state.airports[fromIdx];
    const toAp = state.airports[toIdx];
    if (!fromAp || !toAp) return;

    state.activeRoutes = [];

    // --- Direct routes between fromIdx <-> toIdx ---
    const directRoutes = [];
    Object.entries(state.airlines).forEach(([alIata, al]) => {
        al.routes.forEach(r => {
            const isFromTo = (r[0] === fromIdx && r[1] === toIdx) || (r[0] === toIdx && r[1] === fromIdx);
            if (isFromTo) {
                directRoutes.push({
                    src: state.airports[r[0]],
                    dst: state.airports[r[1]],
                    airline: alIata,
                    type: 'direct'
                });
            }
        });
    });
    state.activeRoutes.push(...directRoutes);

    // --- 1-stop connection routes ---
    // Build set of hubs reachable from fromIdx
    const fromHubs = new Map(); // hubIdx -> [airlines]
    Object.entries(state.airlines).forEach(([alIata, al]) => {
        al.routes.forEach(r => {
            if (r[0] === fromIdx && r[1] !== toIdx) {
                if (!fromHubs.has(r[1])) fromHubs.set(r[1], []);
                fromHubs.get(r[1]).push(alIata);
            }
            if (r[1] === fromIdx && r[0] !== toIdx) {
                if (!fromHubs.has(r[0])) fromHubs.set(r[0], []);
                fromHubs.get(r[0]).push(alIata);
            }
        });
    });

    // Find hubs that also connect to toIdx
    const seenHubs = new Map(); // hubIdx -> airline for Leg 2

    Object.entries(state.airlines).forEach(([alIata, al]) => {
        al.routes.forEach(r => {
            let hubIdx = null;
            // r goes hub → toIdx
            if (r[1] === toIdx && fromHubs.has(r[0])) hubIdx = r[0];
            // r goes toIdx → hub (undirected)
            if (r[0] === toIdx && fromHubs.has(r[1])) hubIdx = r[1];

            if (hubIdx !== null && !seenHubs.has(hubIdx)) {
                seenHubs.set(hubIdx, alIata);
            }
        });
    });

    if (state.connectionType === 'connecting' || state.connectionType === 'connecting-2') {
        // Sort hubs by traffic
        const sortedHubIndices = [...seenHubs.keys()]
            .sort((a, b) => (state.airports[b].flightsCount || 0) - (state.airports[a].flightsCount || 0));

        const connectingLegs = [];
        sortedHubIndices.forEach(hubIdx => {
            const hub = state.airports[hubIdx];
            const alIata2 = seenHubs.get(hubIdx);
            const alIata1 = (fromHubs.get(hubIdx) || [alIata2])[0];

            // Leg 1: from → hub (direct leg, solid green line)
            connectingLegs.push({
                src: fromAp,
                dst: hub,
                airline: alIata1,
                type: 'direct'
            });
            // Leg 2: hub → to (connecting leg, yellow dashed line)
            connectingLegs.push({
                src: hub,
                dst: toAp,
                airline: alIata2,
                type: 'connecting'
            });
        });
        state.activeRoutes.push(...connectingLegs);
    }

    // --- 2-stop connection routes ---
    const nFrom = new Map(); // hub1Idx -> [airlines]
    Object.entries(state.airlines).forEach(([alIata, al]) => {
        al.routes.forEach(r => {
            if (r[0] === fromIdx) {
                const h1 = r[1];
                if (h1 !== fromIdx && h1 !== toIdx) {
                    if (!nFrom.has(h1)) nFrom.set(h1, []);
                    nFrom.get(h1).push(alIata);
                }
            }
            if (r[1] === fromIdx) {
                const h1 = r[0];
                if (h1 !== fromIdx && h1 !== toIdx) {
                    if (!nFrom.has(h1)) nFrom.set(h1, []);
                    nFrom.get(h1).push(alIata);
                }
            }
        });
    });

    const nTo = new Map(); // hub2Idx -> [airlines]
    Object.entries(state.airlines).forEach(([alIata, al]) => {
        al.routes.forEach(r => {
            if (r[0] === toIdx) {
                const h2 = r[1];
                if (h2 !== fromIdx && h2 !== toIdx) {
                    if (!nTo.has(h2)) nTo.set(h2, []);
                    nTo.get(h2).push(alIata);
                }
            }
            if (r[1] === toIdx) {
                const h2 = r[0];
                if (h2 !== fromIdx && h2 !== toIdx) {
                    if (!nTo.has(h2)) nTo.set(h2, []);
                    nTo.get(h2).push(alIata);
                }
            }
        });
    });

    const twoStopPaths = []; // Array of { h1, h2, al1, al2, al3 }
    const seenPaths = new Set(); // To avoid duplicates: `${h1}-${h2}`

    Object.entries(state.airlines).forEach(([alIata, al]) => {
        al.routes.forEach(r => {
            const r0 = r[0];
            const r1 = r[1];

            // Case A: r0 is in nFrom (h1) and r1 is in nTo (h2)
            if (nFrom.has(r0) && nTo.has(r1) && r0 !== r1) {
                const pathKey = `${r0}-${r1}`;
                if (!seenPaths.has(pathKey)) {
                    seenPaths.add(pathKey);
                    const al1 = nFrom.get(r0)[0];
                    const al2 = alIata;
                    const al3 = nTo.get(r1)[0];
                    twoStopPaths.push({ h1: r0, h2: r1, al1, al2, al3 });
                }
            }
            // Case B: r1 is in nFrom (h1) and r0 is in nTo (h2)
            else if (nFrom.has(r1) && nTo.has(r0) && r0 !== r1) {
                const pathKey = `${r1}-${r0}`;
                if (!seenPaths.has(pathKey)) {
                    seenPaths.add(pathKey);
                    const al1 = nFrom.get(r1)[0];
                    const al2 = alIata;
                    const al3 = nTo.get(r0)[0];
                    twoStopPaths.push({ h1: r1, h2: r0, al1, al2, al3 });
                }
            }
        });
    });

    if (state.connectionType === 'connecting-2') {
        const sortedPaths = twoStopPaths
            .sort((a, b) => {
                const distA = getGeographicDistance(fromAp, state.airports[a.h1]) +
                              getGeographicDistance(state.airports[a.h1], state.airports[a.h2]) +
                              getGeographicDistance(state.airports[a.h2], toAp);
                const distB = getGeographicDistance(fromAp, state.airports[b.h1]) +
                              getGeographicDistance(state.airports[b.h1], state.airports[b.h2]) +
                              getGeographicDistance(state.airports[b.h2], toAp);
                return distA - distB;
            });

        const connectingLegs = [];
        sortedPaths.forEach(path => {
            // Leg 1: from -> h1 (dashed green line, type 'direct')
            connectingLegs.push({
                src: fromAp,
                dst: state.airports[path.h1],
                airline: path.al1,
                type: 'direct'
            });
            // Leg 2: h1 -> h2 (dashed yellow line, type 'connecting')
            connectingLegs.push({
                src: state.airports[path.h1],
                dst: state.airports[path.h2],
                airline: path.al2,
                type: 'connecting'
            });
            // Leg 3: h2 -> to (dashed red line, type 'connecting-2')
            connectingLegs.push({
                src: state.airports[path.h2],
                dst: toAp,
                airline: path.al3,
                type: 'connecting-2'
            });
        });
        state.activeRoutes.push(...connectingLegs);
    }

    // PERF: pre-build route geometry
    buildRouteFeatures();

    state.selectedAirportIndex = fromIdx;
    focusCameraOnPoints([[fromAp.lon, fromAp.lat], [toAp.lon, toAp.lat]]);
    initParticles();

    const directCount = directRoutes.length;
    let hubCount = 0;
    if (state.connectionType === 'connecting') {
        hubCount = seenHubs.size;
    } else if (state.connectionType === 'connecting-2') {
        hubCount = twoStopPaths.length;
    }

    // UI Updates
    document.getElementById('active-filter-pill').style.display = 'flex';
    document.getElementById('filter-pill-label').innerText = `${fromAp.iata} → ${toAp.iata}`;

    document.getElementById('stat-airports').innerText = hubCount;
    document.getElementById('stat-routes').innerText = state.activeRoutes.length;

    document.getElementById('stat-extra-card').style.display = 'flex';
    document.getElementById('stat-extra-label').innerText = "Direct Flights";
    document.getElementById('stat-extra-value').innerText = directCount > 0 ? directCount : 'None';

    // Unique airlines that operate the direct city-pair
    const routeAirlines = [];
    const seenAirlineCodes = new Set();
    directRoutes.forEach(r => {
        if (seenAirlineCodes.has(r.airline)) return;
        seenAirlineCodes.add(r.airline);
        const al = state.airlines[r.airline];
        if (al) routeAirlines.push(al);
    });
    routeAirlines.sort((a, b) => a.name.localeCompare(b.name));

    // Description text
    const descText = document.getElementById('stats-desc-text');
    const airlineSummary = routeAirlines.length
        ? ` Operated by ${routeAirlines.map(a => a.name).join(', ')}.`
        : '';
    if (state.connectionType === 'connecting') {
        if (directCount > 0) {
            descText.innerText = `${directCount} direct flight${directCount > 1 ? 's' : ''} found between ${fromAp.city} and ${toAp.city}.${airlineSummary} ${hubCount} possible 1-stop connection hubs shown.`;
        } else {
            descText.innerText = `No direct flights between ${fromAp.city} and ${toAp.city}. Showing ${hubCount} possible 1-stop connection hub${hubCount !== 1 ? 's' : ''}.`;
        }
    } else if (state.connectionType === 'connecting-2') {
        if (directCount > 0) {
            descText.innerText = `${directCount} direct flight${directCount > 1 ? 's' : ''} found between ${fromAp.city} and ${toAp.city}.${airlineSummary} ${hubCount} possible 2-stop connection paths found.`;
        } else {
            descText.innerText = `No direct flights between ${fromAp.city} and ${toAp.city}. Showing ${hubCount} possible 2-stop connection path${hubCount !== 1 ? 's' : ''}.`;
        }
    } else {
        if (directCount > 0) {
            descText.innerText = `${directCount} direct flight${directCount > 1 ? 's' : ''} found between ${fromAp.city} and ${toAp.city}.${airlineSummary}`;
        } else {
            descText.innerText = `No direct flights between ${fromAp.city} and ${toAp.city}. Switch to 1-Stop to see connection hubs.`;
        }
    }

    // Show operating airlines for the selected route, then optional connection lists
    const topHubsContainer = document.getElementById('top-hubs-container');
    const topHubsList = document.getElementById('top-hubs-list');
    topHubsList.innerHTML = '';

    displayRouteAirlines(routeAirlines, fromAp, toAp);

    if (state.connectionType === 'connecting') {
        const hubsHeading = document.createElement('h3');
        hubsHeading.className = 'route-panel-subheading';
        hubsHeading.innerText = '1-Stop Connection Hubs';
        topHubsList.parentElement.appendChild(hubsHeading);

        const hubsList = document.createElement('ul');
        hubsList.id = 'route-hubs-list';
        hubsList.className = 'route-secondary-list';

        const sortedHubs = [...seenHubs.keys()]
            .map(idx => state.airports[idx])
            .sort((a, b) => (b.flightsCount || 0) - (a.flightsCount || 0))
            .slice(0, 5);

        sortedHubs.forEach(hub => {
            const li = document.createElement('li');
            li.innerHTML = `<span class="hub-name">${hub.city} (${hub.iata})</span><span class="hub-count">via hub</span>`;
            li.addEventListener('mouseenter', () => {
                state.hoveredHubIndex = state.airports.indexOf(hub);
                markDirty();
            });
            li.addEventListener('mouseleave', () => {
                state.hoveredHubIndex = null;
                markDirty();
            });
            hubsList.appendChild(li);
        });

        if (sortedHubs.length === 0) {
            const li = document.createElement('li');
            li.innerHTML = `<span class="hub-name">No 1-stop hubs found</span>`;
            hubsList.appendChild(li);
        }
        topHubsList.parentElement.appendChild(hubsList);
        topHubsContainer.style.display = 'block';
    } else if (state.connectionType === 'connecting-2') {
        const hubsHeading = document.createElement('h3');
        hubsHeading.className = 'route-panel-subheading';
        hubsHeading.innerText = '2-Stop Connection Paths';
        topHubsList.parentElement.appendChild(hubsHeading);

        const hubsList = document.createElement('ul');
        hubsList.id = 'route-hubs-list';
        hubsList.className = 'route-secondary-list';

        const sortedPathsToShow = twoStopPaths
            .sort((a, b) => {
                const distA = getGeographicDistance(fromAp, state.airports[a.h1]) +
                              getGeographicDistance(state.airports[a.h1], state.airports[a.h2]) +
                              getGeographicDistance(state.airports[a.h2], toAp);
                const distB = getGeographicDistance(fromAp, state.airports[b.h1]) +
                              getGeographicDistance(state.airports[b.h1], state.airports[b.h2]) +
                              getGeographicDistance(state.airports[b.h2], toAp);
                return distA - distB;
            })
            .slice(0, 5);

        sortedPathsToShow.forEach(path => {
            const h1 = state.airports[path.h1];
            const h2 = state.airports[path.h2];
            const li = document.createElement('li');
            li.innerHTML = `<span class="hub-name">${fromAp.iata} → ${h1.iata} → ${h2.iata} → ${toAp.iata}</span><span class="hub-count">2 stops</span>`;
            li.addEventListener('mouseenter', () => {
                state.hoveredPath = path;
                markDirty();
            });
            li.addEventListener('mouseleave', () => {
                state.hoveredPath = null;
                markDirty();
            });
            hubsList.appendChild(li);
        });

        if (sortedPathsToShow.length === 0) {
            const li = document.createElement('li');
            li.innerHTML = `<span class="hub-name">No 2-stop paths found</span>`;
            hubsList.appendChild(li);
        }
        topHubsList.parentElement.appendChild(hubsList);
        topHubsContainer.style.display = 'block';
    }

    markDirty();
}

// Clear the From airport selection
function clearLocationFrom() {
    state.activeFilter = { type: null, value: null };
    state.selectedAirportIndex = null;
    document.getElementById('loc-from-chip').style.display = 'none';

    // If To is still set, keep it but revert to a vanilla filter reset
    if (state.locationToIndex !== null) {
        // Apply single-location filter from the To side
        const toIdx = state.locationToIndex;
        state.locationToIndex = null;
        document.getElementById('loc-to-chip').style.display = 'none';
    }
    resetFilter();
}

// Clear the To airport selection
function clearLocationTo() {
    state.locationToIndex = null;
    document.getElementById('loc-to-chip').style.display = 'none';

    // Re-apply single-airport filter for the From airport
    if (state.activeFilter.type === 'location' && state.activeFilter.value !== null) {
        setLocationFilter(state.activeFilter.value);
    }
}

function resetFilter() {
    state.activeFilter = { type: null, value: null };
    state.selectedAirportIndex = null;
    state.locationToIndex = null;

    // Hide chips
    document.getElementById('loc-from-chip').style.display = 'none';
    document.getElementById('loc-to-chip').style.display = 'none';

    state.activeRoutes = [];
    let gatheredCount = 0;

    const majorAirlines = Object.values(state.airlines)
        .sort((a, b) => b.routesCount - a.routesCount)
        .slice(0, 18);

    majorAirlines.forEach(al => {
        al.routes.forEach(r => {
            if (gatheredCount < 300) {
                state.activeRoutes.push({
                    src: state.airports[r[0]],
                    dst: state.airports[r[1]],
                    airline: al.iata
                });
                gatheredCount++;
            }
        });
    });

    // PERF: pre-build route geometry
    buildRouteFeatures();

    initParticles();

    // UI Reset
    document.getElementById('active-filter-pill').style.display = 'none';

    document.getElementById('stat-airports').innerText = state.airports.length;
    document.getElementById('stat-routes').innerText = state.routesCount;
    document.getElementById('stat-extra-card').style.display = 'flex';
    document.getElementById('stat-extra-label').innerText = "Airlines Indexed";
    document.getElementById('stat-extra-value').innerText = Object.keys(state.airlines).length;

    document.getElementById('stats-desc-text').innerText = "Showing the global commercial flights network. Search and select an airline or an airport above to analyze specific routes and connectivity hubs.";
    clearRouteSecondaryLists();
    document.getElementById('top-hubs-container').style.display = 'none';

    // Smoothly reset camera to default view when filters are cleared
    if (state.projectionType === 'globe') {
        animateCameraTo([0, -20, 0], 1.0, [0, 0]);
    } else {
        animateCameraTo([0, 0, 0], 1.0, [0, 0]);
    }

    markDirty();
}

// Helper to calculate the closest airport to a given lat/lon coordinate pair
function getClosestAirport(lat, lon) {
    let closestApIdx = -1;
    let minDistance = Infinity;
    
    state.airports.forEach((ap, idx) => {
        const isIntl = (
            ap.name.toLowerCase().includes('international') || 
            ap.name.toLowerCase().includes('intl') || 
            ap.name.toLowerCase().includes('int\'l') || 
            ap.name.toLowerCase().includes('internacional') || 
            ap.flightsCount >= 50
        ) && ap.flightsCount > 0;
        
        if (isIntl) {
            // Equirectangular distance approximation (fast and accurate enough for proximity)
            const x = (ap.lon - lon) * Math.cos((ap.lat + lat) * Math.PI / 360);
            const y = ap.lat - lat;
            const dist = x * x + y * y;
            if (dist < minDistance) {
                minDistance = dist;
                closestApIdx = idx;
            }
        }
    });
    
    if (closestApIdx === -1) {
        closestApIdx = state.airports.findIndex(ap => ap.iata === 'MEL');
        if (closestApIdx === -1) closestApIdx = 2554; // absolute fallback
    }
    
    return closestApIdx;
}

// Quick equirectangular distance helper (returns squared distance in degrees)
function getGeographicDistance(ap1, ap2) {
    if (!ap1 || !ap2) return Infinity;
    const x = (ap1.lon - ap2.lon) * Math.cos((ap1.lat + ap2.lat) * Math.PI / 360);
    const y = ap1.lat - ap2.lat;
    return x * x + y * y;
}

// Helper to programmatically activate the Location Tab in the UI Sidebar
function activateLocationTab() {
    state.activeTab = 'location';
    
    const tabAirline = document.getElementById('tab-airline');
    const tabLocation = document.getElementById('tab-location');
    const searchAirlineCont = document.getElementById('search-airline-container');
    const searchLocationCont = document.getElementById('search-location-container');

    if (tabAirline && tabLocation && searchAirlineCont && searchLocationCont) {
        tabLocation.classList.add('active');
        tabLocation.setAttribute('aria-selected', 'true');
        tabAirline.classList.remove('active');
        tabAirline.setAttribute('aria-selected', 'false');

        searchLocationCont.classList.add('active');
        searchAirlineCont.classList.remove('active');
    }
    
    hideSuggestions();
}

// Focus D3 camera projection on specific set of points with smooth animation
function focusCameraOnPoints(points) {
    if (!points || points.length === 0) return;
    const [lon, lat] = points[0];
    const isMobile = state.width <= 768;
    
    // Choose a subtle zoom-in for active focus (e.g. 1.25 for desktop, 1.05 for mobile)
    const targetZoom = isMobile ? 1.05 : 1.25;
    
    if (state.projectionType === 'globe') {
        // In orthographic globe, rotate by [-lon, -lat, 0] to bring the point to center stage
        const targetRotation = [-lon, -lat, 0];
        animateCameraTo(targetRotation, targetZoom, [0, 0]);
    } else {
        // In flat map mode, rotate by [-lon, 0, 0] to center longitude, and translate vertically to center latitude
        const targetRotation = [-lon, 0, 0];
        
        const shift = isMobile ? 0 : 100 * state.sidebarOffsetTransition;
        const center = [state.width / 2 + shift, state.height / 2];
        
        // Use a temporary projection to calculate the precise vertical translation offset needed
        const tempProjection = d3.geoEqualEarth()
            .scale(state.scale.flat * targetZoom)
            .translate(center)
            .rotate([targetRotation[0], 0, 0]);
            
        const projected = tempProjection([lon, lat]);
        const ty = projected ? (center[1] - projected[1]) : 0;
        
        animateCameraTo(targetRotation, targetZoom, [0, ty]);
    }
}

function focusCameraOnRoutes(routes) {
    if (!routes || routes.length === 0) return;
    
    // Analyze active routes to find the busiest airport (hub), then center on it
    const airportCounts = {};
    routes.forEach(r => {
        if (r.src) airportCounts[r.src.iata] = (airportCounts[r.src.iata] || 0) + 1;
        if (r.dst) airportCounts[r.dst.iata] = (airportCounts[r.dst.iata] || 0) + 1;
    });
    
    let busiestIata = null;
    let maxCount = -1;
    Object.entries(airportCounts).forEach(([iata, count]) => {
        if (count > maxCount) {
            maxCount = count;
            busiestIata = iata;
        }
    });
    
    if (busiestIata) {
        const ap = state.airports.find(a => a.iata === busiestIata);
        if (ap) {
            focusCameraOnPoints([[ap.lon, ap.lat]]);
        }
    }
}


// Count unique airports in active routes list
function getUniqueAirportsCount(routes) {
    const uniqueSet = new Set();
    routes.forEach(r => {
        uniqueSet.add(r.src.iata);
        uniqueSet.add(r.dst.iata);
    });
    return uniqueSet.size;
}

// Side panel statistical analysis
function displayAirlineHubs(al) {
    clearRouteSecondaryLists();

    const topHubsContainer = document.getElementById('top-hubs-container');
    const topHubsList = document.getElementById('top-hubs-list');
    const descText = document.getElementById('stats-desc-text');

    descText.innerText = `Visualizing flight connections for ${al.name} (${al.iata}). It operates ${al.routesCount} direct flights connecting airports around the globe.`;

    const hubs = {};
    al.routes.forEach(r => {
        const src = state.airports[r[0]];
        const dst = state.airports[r[1]];
        hubs[src.city] = (hubs[src.city] || 0) + 1;
        hubs[dst.city] = (hubs[dst.city] || 0) + 1;
    });

    const sortedHubs = Object.entries(hubs)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4);

    topHubsList.innerHTML = '';
    sortedHubs.forEach(([city, count]) => {
        const li = document.createElement('li');
        li.innerHTML = `<span class="hub-name">${city}</span><span class="hub-count">${count} routes</span>`;
        topHubsList.appendChild(li);
    });

    topHubsContainer.style.display = 'block';
    topHubsContainer.querySelector('h3').innerText = "Top Airline Hubs";
}

function clearRouteSecondaryLists() {
    const topHubsContainer = document.getElementById('top-hubs-container');
    if (!topHubsContainer) return;
    topHubsContainer.querySelectorAll('.route-panel-subheading, .route-secondary-list').forEach(el => el.remove());
}

function displayRouteAirlines(airlines, fromAp, toAp) {
    clearRouteSecondaryLists();

    const topHubsContainer = document.getElementById('top-hubs-container');
    const topHubsList = document.getElementById('top-hubs-list');
    const heading = topHubsContainer.querySelector('h3');

    heading.innerText = `Airlines on ${fromAp.iata} → ${toAp.iata}`;
    topHubsList.innerHTML = '';

    if (airlines.length === 0) {
        const li = document.createElement('li');
        li.innerHTML = `<span class="hub-name">No direct airline operators</span><span class="hub-count">—</span>`;
        topHubsList.appendChild(li);
    } else {
        airlines.forEach(al => {
            const li = document.createElement('li');
            li.innerHTML = `<span class="hub-name">${al.name}</span><span class="hub-count">${al.iata}</span>`;
            topHubsList.appendChild(li);
        });
    }

    topHubsContainer.style.display = 'block';
    // Bring operating airlines into view when a city-pair is selected
    requestAnimationFrame(() => {
        topHubsContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
}

function displayLocationAirlines(apIdx) {
    clearRouteSecondaryLists();

    const ap = state.airports[apIdx];
    const topHubsContainer = document.getElementById('top-hubs-container');
    const topHubsList = document.getElementById('top-hubs-list');
    const descText = document.getElementById('stats-desc-text');

    descText.innerText = `Visualizing all direct inbound and outbound routes for ${ap.name} in ${ap.city}, ${ap.country}. Serving as a connection node for ${state.activeRoutes.length} global paths.`;

    const opAirlines = {};
    state.activeRoutes.forEach(r => {
        const al = state.airlines[r.airline];
        if (al) {
            opAirlines[al.name] = (opAirlines[al.name] || 0) + 1;
        }
    });

    const sortedAirlines = Object.entries(opAirlines)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4);

    topHubsList.innerHTML = '';
    sortedAirlines.forEach(([name, count]) => {
        const li = document.createElement('li');
        li.innerHTML = `<span class="hub-name">${name}</span><span class="hub-count">${count} flights</span>`;
        topHubsList.appendChild(li);
    });

    topHubsContainer.style.display = 'block';
    topHubsContainer.querySelector('h3').innerText = "Key Carriers Operating";
}

// Setup flow particles along paths
// PERF: pre-compute and cache the geoInterpolate function per particle at spawn time
function initParticles() {
    state.particles = [];
    const maxParticles = Math.min(120, state.activeRoutes.length);
    const colors = getThemeColors();

    const indices = [];
    for (let i = 0; i < state.activeRoutes.length; i++) indices.push(i);
    indices.sort(() => Math.random() - 0.5);

    const particlesToSpawn = indices.slice(0, maxParticles);

    particlesToSpawn.forEach(idx => {
        const r = state.activeRoutes[idx];
        // PERF: create the interpolator ONCE per particle, not every frame
        const interpolator = d3.geoInterpolate(
            [r.src.lon, r.src.lat],
            [r.dst.lon, r.dst.lat]
        );
        state.particles.push({
            route: r,
            interpolator,
            progress: Math.random(),
            speed: 0.003 + Math.random() * 0.003,
            color: r.type === 'connecting'
                ? colors.particleConnecting
                : r.type === 'connecting-2'
                    ? colors.particleConnecting2
                    : colors.particleDirect
        });
    });

    markDirty();
}

// Draw the entire scene on Canvas
function render() {
    const ctx = state.ctx;
    const path = state.path;
    const themeColors = getThemeColors();

    // 1. Clear Screen
    ctx.clearRect(0, 0, state.width, state.height);

    // 1.5. Draw Satellite Imagery if active
    if (state.satelliteActive) {
        if (state.projectionType === 'globe') {
            ctx.save();
            ctx.beginPath();
            path({ type: 'Sphere' });
            ctx.clip();
            drawSatelliteTiles();
            ctx.restore();
        } else {
            drawSatelliteTiles();
        }
    }

    // 2. Draw Sphere Background (Globe mode only)
    if (state.projectionType === 'globe') {
        if (!state.satelliteActive) {
            ctx.beginPath();
            path({ type: 'Sphere' });
            ctx.fillStyle = themeColors.ocean;
            ctx.fill();
        }

        // PERF: use cached graticule geometry instead of recalculating every frame
        ctx.beginPath();
        path(state.graticuleGeometry);
        ctx.strokeStyle = themeColors.graticule;
        ctx.lineWidth = 0.5;
        ctx.stroke();
    }

    // 3. Draw Country Shapes & UN Borders
    if (state.countriesGeoJSON) {
        ctx.beginPath();
        path(state.countriesGeoJSON);
        
        if (!state.satelliteActive) {
            ctx.fillStyle = themeColors.landFill;
            ctx.fill();
        }

        ctx.strokeStyle = themeColors.landStroke;
        ctx.lineWidth = 0.7;
        ctx.stroke();

        ctx.strokeStyle = themeColors.unBorder;
        ctx.lineWidth = 0.4;
        ctx.stroke();
    }

    // 4. Draw Flight Connections (Arcs)
    drawFlightRoutes();

    // 5. Draw Flight Particles (Planes)
    drawParticles();

    // 6. Draw Airports
    drawAirports();
}

function getHighlightedRoutes() {
    const highlighted = new Set();
    if (!state.activeFilter || state.activeFilter.type !== 'location' || state.activeFilter.value === null) {
        return highlighted;
    }
    
    // 1. If we hovered over a list item hub
    if (state.hoveredHubIndex !== null) {
        const hub = state.airports[state.hoveredHubIndex];
        const fromAp = state.airports[state.activeFilter.value];
        state.activeRoutes.forEach(r => {
            const isLeg1 = (r.src.iata === fromAp.iata && r.dst.iata === hub.iata) || (r.src.iata === hub.iata && r.dst.iata === fromAp.iata);
            const isLeg2 = (r.src.iata === hub.iata) || (r.dst.iata === hub.iata);
            if (isLeg1 || isLeg2) {
                highlighted.add(r);
            }
        });
        return highlighted;
    }
    
    // 2. If we hovered over a 2-stop path in the list
    if (state.hoveredPath) {
        const p = state.hoveredPath;
        const fromAp = state.airports[state.activeFilter.value];
        const h1 = state.airports[p.h1];
        const h2 = state.airports[p.h2];
        const toAp = state.locationToIndex !== null ? state.airports[state.locationToIndex] : null;
        
        state.activeRoutes.forEach(r => {
            const matchesSegment = (r.src.iata === fromAp.iata && r.dst.iata === h1.iata) ||
                                   (r.src.iata === h1.iata && r.dst.iata === h2.iata) ||
                                   (r.src.iata === h2.iata && toAp && r.dst.iata === toAp.iata);
            if (matchesSegment) {
                highlighted.add(r);
            }
        });
        return highlighted;
    }
    
    // 3. If we hovered over an airport on the map (interactive map hover!)
    if (state.hoveredItem && state.hoveredItem.iata) {
        const hoveredAp = state.hoveredItem;
        const fromAp = state.airports[state.activeFilter.value];
        if (hoveredAp.iata === fromAp.iata) return highlighted; // Hovering origin
        
        // Find if this hovered airport is directly connected or is a connection destination
        const isDirectDest = state.activeRoutes.some(r => 
            r.type === 'direct' && ((r.src.iata === fromAp.iata && r.dst.iata === hoveredAp.iata) || (r.src.iata === hoveredAp.iata && r.dst.iata === fromAp.iata))
        );
        
        if (isDirectDest) {
            // Highlight direct route
            state.activeRoutes.forEach(r => {
                if (r.type === 'direct' && ((r.src.iata === fromAp.iata && r.dst.iata === hoveredAp.iata) || (r.src.iata === hoveredAp.iata && r.dst.iata === fromAp.iata))) {
                    highlighted.add(r);
                }
            });
        } else {
            // Find connecting paths ending at hoveredAp
            const hubs = new Set();
            state.activeRoutes.forEach(r => {
                if (r.type === 'connecting' && r.dst.iata === hoveredAp.iata) {
                    hubs.add(r.src.iata);
                    highlighted.add(r); // Leg 2
                }
                if (r.type === 'connecting-2' && r.dst.iata === hoveredAp.iata) {
                    highlighted.add(r); // Leg 3
                    hubs.add(r.src.iata);
                }
            });
            
            // Now highlight the legs connecting fromAp to those hubs
            state.activeRoutes.forEach(r => {
                if (r.type === 'direct' && hubs.has(r.dst.iata)) {
                    highlighted.add(r); // Leg 1
                }
                if (r.type === 'connecting' && hubs.has(r.dst.iata)) {
                    highlighted.add(r); // Leg 2 for 2-stop
                    // Also need Leg 1 for that hub
                    state.activeRoutes.forEach(r2 => {
                        if (r2.type === 'direct' && r2.dst.iata === r.src.iata) {
                            highlighted.add(r2);
                        }
                    });
                }
            });
        }
    }
    
    return highlighted;
}

function drawFlightRoutes() {
    const ctx = state.ctx;
    const path = state.path;
    const themeColors = getThemeColors();
    const hasFilter = !!state.activeFilter.type;

    const isP2P = state.selectedAirportIndex !== null && state.locationToIndex !== null;
    const fromAp = isP2P ? state.airports[state.selectedAirportIndex] : null;
    const toAp = isP2P ? state.airports[state.locationToIndex] : null;

    const highlightedSet = getHighlightedRoutes();
    const isHoverActive = highlightedSet.size > 0;

    // HIGH-PERFORMANCE BATCH RENDERING (99.7% fewer draw calls)
    // Used when not in point-to-point mode, representing the primary rendering load
    if (!isP2P) {
        // --- 1. Draw Inactive / Background Routes first ---
        if (isHoverActive) {
            // Draw all routes dimmed as background
            ctx.save();
            ctx.globalAlpha = 0.12;
            ctx.shadowBlur = 0;

            // Draw direct background routes
            if (state.activeRouteMultiLines.direct) {
                ctx.save();
                if (hasFilter) {
                    ctx.strokeStyle = themeColors.routeDirect;
                    ctx.lineWidth = 1.6;
                } else {
                    ctx.strokeStyle = themeColors.routeInactive;
                    ctx.lineWidth = 0.8;
                }
                ctx.beginPath();
                path(state.activeRouteMultiLines.direct);
                ctx.stroke();
                ctx.restore();
            }

            // Draw connecting background routes
            if (state.activeRouteMultiLines.connecting) {
                ctx.save();
                ctx.setLineDash([5, 6]);
                ctx.strokeStyle = themeColors.routeConnectingStroke;
                ctx.lineWidth = 1.2;
                ctx.beginPath();
                path(state.activeRouteMultiLines.connecting);
                ctx.stroke();
                ctx.restore();
            }

            // Draw connecting-2 background routes
            if (state.activeRouteMultiLines.connecting2) {
                ctx.save();
                ctx.setLineDash([5, 6]);
                ctx.strokeStyle = themeColors.routeConnecting2Stroke;
                ctx.lineWidth = 1.2;
                ctx.beginPath();
                path(state.activeRouteMultiLines.connecting2);
                ctx.stroke();
                ctx.restore();
            }

            ctx.restore();

            // --- 2. Draw Highlighted / Active Routes on top ---
            highlightedSet.forEach(r => {
                const feat = state.activeRouteFeatures[state.activeRoutes.indexOf(r)];
                if (!feat) return;

                ctx.save();
                ctx.globalAlpha = 1.0;
                ctx.lineWidth = 2.5;
                ctx.shadowBlur = 10;

                if (r.type === 'connecting') {
                    ctx.setLineDash([5, 6]);
                    ctx.strokeStyle = themeColors.routeConnectingStroke;
                    ctx.shadowColor = themeColors.routeConnectingGlow;
                } else if (r.type === 'connecting-2') {
                    ctx.setLineDash([5, 6]);
                    ctx.strokeStyle = themeColors.routeConnecting2Stroke;
                    ctx.shadowColor = themeColors.routeConnecting2Glow;
                } else {
                    ctx.strokeStyle = themeColors.routeDirect;
                    ctx.shadowColor = themeColors.routeDirectGlow;
                }

                ctx.beginPath();
                path(feat);
                ctx.stroke();
                ctx.restore();
            });

        } else {
            // Normal batch drawing (no hover active)
            // Draw connecting first (so direct routes render on top)
            if (state.activeRouteMultiLines.connecting) {
                ctx.save();
                ctx.setLineDash([5, 6]);
                ctx.strokeStyle = themeColors.routeConnectingStroke;
                ctx.lineWidth = 1.2;
                ctx.shadowBlur = 0;
                ctx.beginPath();
                path(state.activeRouteMultiLines.connecting);
                ctx.stroke();
                ctx.restore();
            }

            if (state.activeRouteMultiLines.connecting2) {
                ctx.save();
                ctx.setLineDash([5, 6]);
                ctx.strokeStyle = themeColors.routeConnecting2Stroke;
                ctx.lineWidth = 1.2;
                ctx.shadowBlur = 0;
                ctx.beginPath();
                path(state.activeRouteMultiLines.connecting2);
                ctx.stroke();
                ctx.restore();
            }

            if (state.activeRouteMultiLines.direct) {
                ctx.save();
                ctx.setLineDash([]);
                if (hasFilter) {
                    ctx.shadowColor = themeColors.routeDirectGlow;
                    ctx.shadowBlur = 5;
                    ctx.strokeStyle = themeColors.routeDirect;
                    ctx.lineWidth = 1.6;
                } else {
                    ctx.shadowBlur = 0;
                    ctx.strokeStyle = themeColors.routeInactive;
                    ctx.lineWidth = 0.8;
                }
                ctx.beginPath();
                path(state.activeRouteMultiLines.direct);
                ctx.stroke();
                ctx.restore();
            }
        }
        return; // End batch path
    }

    // --- Legacy / Fallback Individual Loop for Point-to-Point (P2P) mode ---
    ctx.save();
    ctx.shadowBlur = 0;

    state.activeRouteFeatures.forEach((feat, i) => {
        const r = state.activeRoutes[i];

        const isDirectP2P = fromAp && toAp && (
            (r.src.iata === fromAp.iata && r.dst.iata === toAp.iata) ||
            (r.src.iata === toAp.iata && r.dst.iata === fromAp.iata)
        );
        if (isDirectP2P) {
            // Drawn in solid glowing bucket below
            return;
        }

        ctx.save();
        let isHighlighted = isHoverActive && highlightedSet.has(r);
        if (isHoverActive) {
            if (!isHighlighted) {
                ctx.globalAlpha = 0.12;
            } else {
                ctx.globalAlpha = 1.0;
                ctx.lineWidth = 2.0;
                ctx.shadowBlur = 8;
                ctx.shadowColor = r.type === 'direct' ? themeColors.routeDirectGlow : (r.type === 'connecting' ? themeColors.routeConnectingGlow : themeColors.routeConnecting2Glow);
            }
        }

        if (r.type === 'direct') {
            ctx.setLineDash([4, 4]);
            ctx.strokeStyle = themeColors.routeDirect;
            if (!isHoverActive) ctx.lineWidth = 1.2;
            ctx.beginPath();
            path(feat);
            ctx.stroke();
        } else if (r.type === 'connecting') {
            ctx.setLineDash([5, 6]);
            ctx.strokeStyle = themeColors.routeConnectingStroke;
            if (!isHoverActive) ctx.lineWidth = 1.2;
            ctx.beginPath();
            path(feat);
            ctx.stroke();
        } else if (r.type === 'connecting-2') {
            ctx.setLineDash([5, 6]);
            ctx.strokeStyle = themeColors.routeConnecting2Stroke;
            if (!isHoverActive) ctx.lineWidth = 1.2;
            ctx.beginPath();
            path(feat);
            ctx.stroke();
        }
        ctx.restore();
    });

    ctx.setLineDash([]);
    ctx.restore();

    // --- Bucket B: direct P2P routes (solid glowing green) ---
    ctx.save();
    ctx.shadowColor = themeColors.routeDirectGlow;
    ctx.shadowBlur = 5;
    ctx.strokeStyle = themeColors.routeDirect;
    ctx.lineWidth = 1.6;
    ctx.setLineDash([]);

    state.activeRouteFeatures.forEach((feat, i) => {
        const r = state.activeRoutes[i];
        
        const isDirectP2P = fromAp && toAp && (
            (r.src.iata === fromAp.iata && r.dst.iata === toAp.iata) ||
            (r.src.iata === toAp.iata && r.dst.iata === fromAp.iata)
        );
        if (!isDirectP2P) return;

        ctx.save();
        let isHighlighted = isHoverActive && highlightedSet.has(r);
        if (isHoverActive) {
            if (!isHighlighted) {
                ctx.globalAlpha = 0.12;
            } else {
                ctx.globalAlpha = 1.0;
                ctx.lineWidth = 2.5;
                ctx.shadowBlur = 10;
                ctx.shadowColor = themeColors.routeDirectGlow;
            }
        }

        ctx.beginPath();
        path(feat);
        ctx.stroke();
        ctx.restore();
    });

    ctx.shadowBlur = 0;
    ctx.restore();
}

function drawParticles() {
    const ctx = state.ctx;
    const proj = state.projection;
    const centerLonLat = [-state.rotation[0], -state.rotation[1]];

    const particlesByColor = {};

    state.particles.forEach(p => {
        const currentCoords = p.interpolator(p.progress);

        if (state.projectionType === 'globe') {
            const dist = d3.geoDistance(centerLonLat, currentCoords);
            if (dist > Math.PI / 2) {
                p.progress += p.speed;
                if (p.progress >= 1.0) p.progress = 0;
                return;
            }
        }

        const px = proj(currentCoords);
        p.progress += p.speed;
        if (p.progress >= 1.0) p.progress = 0;

        if (!px) return;

        if (!particlesByColor[p.color]) {
            particlesByColor[p.color] = [];
        }
        particlesByColor[p.color].push(px);
    });

    ctx.save();
    ctx.shadowBlur = 8;

    Object.entries(particlesByColor).forEach(([color, points]) => {
        ctx.fillStyle = color;
        ctx.shadowColor = color;
        ctx.beginPath();
        points.forEach(pt => {
            ctx.moveTo(pt[0] + 2, pt[1]);
            ctx.arc(pt[0], pt[1], 2, 0, 2 * Math.PI);
        });
        ctx.fill();
    });

    ctx.shadowBlur = 0;
    ctx.restore();
}

function drawAirports() {
    const ctx = state.ctx;
    const proj = state.projection;
    const themeColors = getThemeColors();
    const centerLonLat = [-state.rotation[0], -state.rotation[1]];

    // PERF: draw selected airport pulse halo separately with shadow, then batch the rest
    // First pass: all non-selected airports (no shadow)
    ctx.save();
    ctx.shadowBlur = 0;
    ctx.fillStyle = state.activeFilter.type === 'location'
        ? themeColors.airportActive
        : state.activeFilter.type === 'airline'
            ? themeColors.airportActive
            : themeColors.airportBase;
    const dotRadius = state.activeFilter.type ? 2 : 1.5;

    ctx.beginPath();
    const limit = state.airports.length;
    for (let i = 0; i < limit; i++) {
        const ap = state.airports[i];
        if (state.selectedAirportIndex === i) continue;
        if (state.locationToIndex === i) continue;

        // Skip airports that are not connected to active flight paths
        if (state.activeAirportsSet && !state.activeAirportsSet.has(ap)) continue;

        if (state.projectionType === 'globe') {
            const dist = d3.geoDistance(centerLonLat, [ap.lon, ap.lat]);
            if (dist > Math.PI / 2) continue;
        }

        const px = proj([ap.lon, ap.lat]);
        if (!px) continue;

        ctx.moveTo(px[0] + dotRadius, px[1]);
        ctx.arc(px[0], px[1], dotRadius, 0, 2 * Math.PI);
    }
    ctx.fill();
    ctx.restore();

    // Helper to draw a pulsing highlighted airport dot
    function drawHighlightedAirport(apIdx, color) {
        const ap = state.airports[apIdx];
        if (!ap) return;
        const px = proj([ap.lon, ap.lat]);
        if (!px) return;

        ctx.save();
        const pulseRadius = 5 + (Date.now() % 1000) / 100 * 1.5;
        ctx.beginPath();
        ctx.arc(px[0], px[1], pulseRadius, 0, 2 * Math.PI);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(px[0], px[1], 5, 0, 2 * Math.PI);
        ctx.fillStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = 10;
        ctx.fill();
        ctx.restore();
    }

    // Second pass: selected "From" airport with glow halo
    if (state.selectedAirportIndex !== null) {
        drawHighlightedAirport(state.selectedAirportIndex, themeColors.routeLocation);
    }

    // Third pass: selected "To" airport with pink glow halo
    if (state.locationToIndex !== null) {
        drawHighlightedAirport(state.locationToIndex, themeColors.routeLocation);
    }
}

// PERF: rAF-throttled hover detection — called via the mousemove listener at most once per frame
function handleHoverProximity(e) {
    if (!state.airports.length) return;

    const rect = state.canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const proj = state.projection;
    const centerLonLat = [-state.rotation[0], -state.rotation[1]];
    const tooltip = document.getElementById('map-tooltip');

    let closestAirport = null;
    let minDist = 8; // detection threshold in pixels

    const scanLimit = state.airports.length;
    for (let i = 0; i < scanLimit; i++) {
        const ap = state.airports[i];

        // Skip airports that are not connected to active flight paths
        if (state.activeAirportsSet && !state.activeAirportsSet.has(ap)) continue;

        if (state.projectionType === 'globe') {
            const dist = d3.geoDistance(centerLonLat, [ap.lon, ap.lat]);
            if (dist > Math.PI / 2) continue;
        }

        const px = proj([ap.lon, ap.lat]);
        if (!px) continue;

        const dx = mouseX - px[0];
        const dy = mouseY - px[1];
        const pixelDist = Math.sqrt(dx * dx + dy * dy);

        if (pixelDist < minDist) {
            minDist = pixelDist;
            closestAirport = ap;
        }
    }

    if (closestAirport) {
        tooltip.innerHTML = `
            <div class="tooltip-title">${closestAirport.city} (${closestAirport.iata})</div>
            <div class="tooltip-line">
                <span class="label">Airport:</span>
                <span class="val">${closestAirport.name}</span>
            </div>
            <div class="tooltip-line">
                <span class="label">Country:</span>
                <span class="val">${closestAirport.country}</span>
            </div>
            <div class="tooltip-line">
                <span class="label">Connections:</span>
                <span class="val">${closestAirport.flightsCount} flights</span>
            </div>
        `;

        tooltip.style.left = `${e.clientX + 15}px`;
        tooltip.style.top = `${e.clientY + 15}px`;
        tooltip.style.display = 'flex';
        tooltip.style.opacity = 1;
        state.hoveredItem = closestAirport;
        state.canvas.style.cursor = 'pointer';
    } else {
        tooltip.style.display = 'none';
        tooltip.style.opacity = 0;
        state.hoveredItem = null;
        state.canvas.style.cursor = state.isDragging ? 'grabbing' : 'grab';
    }
}

// Animation loop
// PERF: only call render() when the dirty flag is set, or when particles / auto-rotation
// need a new frame. Idle frames with no state change skip the repaint entirely.
function startAnimationLoop() {
    const hasAnimatedParticles = () => state.particles.length > 0;

    function loop(timestamp) {
        if (!state.lastFrameTime) state.lastFrameTime = timestamp;

        // Interpolate sidebar transition for smooth canvas centering and scaling
        const targetOffset = state.sidebarCollapsed ? 0 : 1;
        if (Math.abs(state.sidebarOffsetTransition - targetOffset) > 0.001) {
            state.sidebarOffsetTransition += (targetOffset - state.sidebarOffsetTransition) * 0.12;
            updateBaseScales();
            setupProjections();
            state.needsRender = true;
        } else if (state.sidebarOffsetTransition !== targetOffset) {
            state.sidebarOffsetTransition = targetOffset;
            updateBaseScales();
            setupProjections();
            state.needsRender = true;
        }

        if (state.autoRotate && !state.rotationAnimating) {
            state.rotation[0] += state.rotationSpeed;
            if (state.rotation[0] >= 180) state.rotation[0] -= 360;
            // PERF: only rebuild the projection when the rotation actually changes
            setupProjections();
            state.needsRender = true;
        }

        // Particles always need a repaint when present (they move every frame)
        if (hasAnimatedParticles()) {
            state.particles.forEach(p => {
                p.progress += p.speed;
                if (p.progress >= 1.0) p.progress = 0;
            });
            state.needsRender = true;
        }

        // Only repaint if dirty (avoids wasted GPU compositing on idle frames)
        if (state.needsRender) {
            render();
            state.needsRender = false;
        }

        state.lastFrameTime = timestamp;
        state.animFrameId = requestAnimationFrame(loop);
    }

    state.animFrameId = requestAnimationFrame(loop);
}

// ── Region Camera Focus Control ─────────────────────────────────
const REGION_COORDINATES = {
    'atlantic': { rotation: [0, -20, 0], zoom: 1.0, translation: [0, 0] },
    'north-america': { rotation: [100, -40, 0], zoom: 1.0, translation: [0, 0] },
    'south-america': { rotation: [60, 20, 0], zoom: 1.0, translation: [0, 0] },
    'europe-africa': { rotation: [-15, -20, 0], zoom: 1.0, translation: [0, 0] },
    'asia': { rotation: [-100, -35, 0], zoom: 1.0, translation: [0, 0] },
    'australia': { rotation: [-133, 25, 0], zoom: 1.0, translation: [0, 0] }
};

function updateActiveRegionButton(regionId) {
    const buttons = document.querySelectorAll('.focus-region-btn');
    buttons.forEach(btn => {
        if (btn.getAttribute('data-region') === regionId) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
}

function clearActiveRegionButtons() {
    const buttons = document.querySelectorAll('.focus-region-btn');
    buttons.forEach(btn => btn.classList.remove('active'));
}

function animateCameraTo(targetRotation, targetZoom = 1.0, targetTranslation = [0, 0], duration = 800) {
    // Interrupt any active camera animations
    if (state.cameraAnimFrameId) {
        cancelAnimationFrame(state.cameraAnimFrameId);
    }

    const startRotation = [...state.rotation];
    const startZoom = state.zoom;
    const startTranslation = [...state.translation];
    const startTime = performance.now();

    // Disable auto-rotation if it was active
    if (state.autoRotate) {
        toggleAutoRotate(false);
    }

    state.rotationAnimating = true;

    function step(timestamp) {
        const elapsed = timestamp - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        // Easing: Cubic Out (smooth deceleration)
        const ease = 1 - Math.pow(1 - progress, 3);

        // Interpolate rotation with shortest angular distance wrapping
        let diffLon = targetRotation[0] - startRotation[0];
        diffLon = ((diffLon + 180) % 360 + 360) % 360 - 180;

        state.rotation[0] = startRotation[0] + diffLon * ease;
        state.rotation[1] = startRotation[1] + (targetRotation[1] - startRotation[1]) * ease;
        state.rotation[2] = startRotation[2] + (targetRotation[2] - startRotation[2]) * ease;

        // Interpolate zoom
        state.zoom = startZoom + (targetZoom - startZoom) * ease;

        // Interpolate translation
        state.translation[0] = startTranslation[0] + (targetTranslation[0] - startTranslation[0]) * ease;
        state.translation[1] = startTranslation[1] + (targetTranslation[1] - startTranslation[1]) * ease;

        setupProjections();
        markDirty();

        if (progress < 1) {
            state.cameraAnimFrameId = requestAnimationFrame(step);
        } else {
            state.rotationAnimating = false;
            state.cameraAnimFrameId = null;
        }
    }

    state.cameraAnimFrameId = requestAnimationFrame(step);
}

// ── D3 Satellite Tiles Integration (Option 2 under True-to-Earth Projections) ──
function initLeafletMap() {
    // Canvas is our only engine now. We ensure Leaflet elements remain hidden.
    const mapCanvas = document.getElementById('mapCanvas');
    const leafletMapEl = document.getElementById('leafletMap');
    if (mapCanvas) mapCanvas.style.display = 'block';
    if (leafletMapEl) leafletMapEl.style.display = 'none';
}

function updateLeafletLayers() {
    markDirty(); // Simply repaint the D3 canvas
}

function handleAirportClick(apIdx) {
    if (state.activeTab === 'airline') {
        activateLocationTab();
        setLocationFilter(apIdx);
    } else {
        if (state.selectedAirportIndex === null) {
            setLocationFilter(apIdx);
        } else if (state.selectedAirportIndex === apIdx) {
            clearLocationFrom();
        } else if (state.locationToIndex === apIdx) {
            clearLocationTo();
        } else {
            setLocationToFilter(apIdx);
        }
    }
    markDirty();
}

// ── High-Performance D3 Tile Projection & Warp Engine ──────────
const tileCache = new Map();

function latToTileY(lat, z) {
    const latRad = Math.max(-85.0511, Math.min(85.0511, lat)) * Math.PI / 180;
    const n = Math.pow(2, z);
    const y = (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n;
    return Math.max(0, Math.min(n - 1, Math.floor(y)));
}

function getTileBounds(x, y, z) {
    const n = Math.pow(2, z);
    const lonMin = x / n * 360 - 180;
    const lonMax = (x + 1) / n * 360 - 180;
    
    const latMinRad = Math.atan(Math.sinh(Math.PI * (1 - 2 * (y + 1) / n)));
    const latMaxRad = Math.atan(Math.sinh(Math.PI * (1 - 2 * y / n)));
    
    const latMin = latMinRad * 180 / Math.PI;
    const latMax = latMaxRad * 180 / Math.PI;
    
    return { lonMin, lonMax, latMin, latMax };
}

function getTileImage(x, y, z) {
    const key = `${z}/${y}/${x}`;
    if (tileCache.has(key)) {
        return tileCache.get(key);
    }
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;
    
    const tileState = {
        image: img,
        loaded: false,
        failed: false
    };
    
    img.onload = () => {
        tileState.loaded = true;
        markDirty(); // Trigger canvas redraw
    };
    
    img.onerror = () => {
        tileState.failed = true;
    };
    
    tileCache.set(key, tileState);
    return tileState;
}

function isTileVisible(x, y, z) {
    const bounds = getTileBounds(x, y, z);
    
    let centerLon = (( -state.rotation[0] + 180) % 360 + 360) % 360 - 180;
    let centerLat = state.projectionType === 'globe' ? -state.rotation[1] : 0;
    
    // Invert the screen center to get the exact geographic center in 2D mode
    if (state.projectionType === 'flat' && state.projection.invert) {
        try {
            const centerPt = state.projection.invert([state.width / 2, state.height / 2]);
            if (centerPt && !isNaN(centerPt[0]) && !isNaN(centerPt[1])) {
                centerLon = centerPt[0];
                centerLat = centerPt[1];
            } else {
                // Fallback closed-form mathematical inverse Equal Earth calculation 
                // to completely bypass D3's float precision / asin rounding errors under extreme zooms
                const scale = state.scale.flat * state.zoom;
                const translate = [
                    state.width / 2 + (state.width <= 768 ? 0 : 100 * state.sidebarOffsetTransition) + state.translation[0],
                    state.height / 2 + state.translation[1]
                ];
                
                const dy = translate[1] - state.height / 2;
                const theta = Math.max(-1.04, Math.min(1.04, dy / (scale * 1.340264)));
                centerLat = Math.asin(Math.sin(theta) / 0.866) * (180 / Math.PI);
                if (isNaN(centerLat)) centerLat = 0;
                
                const dx = state.width / 2 - translate[0];
                const cosTheta = Math.cos(theta);
                const deltaLon = (dx / (scale * 1.1547 * (cosTheta > 0.1 ? cosTheta : 1))) * (180 / Math.PI);
                centerLon = -state.rotation[0] + deltaLon;
                centerLon = ((centerLon + 180) % 360 + 360) % 360 - 180;
            }
        } catch (e) {}
    }
    
    // If the projection center (center of screen/globe) lies inside the tile, it is definitely visible
    if (centerLon >= bounds.lonMin && centerLon <= bounds.lonMax &&
        centerLat >= bounds.latMin && centerLat <= bounds.latMax) {
        return true;
    }
    
    // In 3D Globe mode, check if any part of the tile is on the visible hemisphere
    if (state.projectionType === 'globe') {
        const centerLonLat = [centerLon, centerLat];
        
        // Find the closest point in the tile bounding box to the center of the globe on the sphere
        let closestLon = centerLon;
        if (bounds.lonMin <= bounds.lonMax) {
            if (centerLon < bounds.lonMin || centerLon > bounds.lonMax) {
                const diffMin = ((bounds.lonMin - centerLon + 180) % 360 + 360) % 360 - 180;
                const diffMax = ((bounds.lonMax - centerLon + 180) % 360 + 360) % 360 - 180;
                closestLon = Math.abs(diffMin) < Math.abs(diffMax) ? bounds.lonMin : bounds.lonMax;
            }
        }
        
        let closestLat = centerLat;
        if (centerLat < bounds.latMin) closestLat = bounds.latMin;
        else if (centerLat > bounds.latMax) closestLat = bounds.latMax;
        
        const dist = d3.geoDistance([closestLon, closestLat], centerLonLat);
        // If the closest point is strictly on the back-face, the tile is completely invisible
        if (dist > Math.PI / 2 + 0.02) {
            return false;
        }
    }
    
    // Project the 4 corners to check screen viewport bounds overlap
    const pTL = state.projection([bounds.lonMin, bounds.latMax]);
    const pTR = state.projection([bounds.lonMax, bounds.latMax]);
    const pBR = state.projection([bounds.lonMax, bounds.latMin]);
    const pBL = state.projection([bounds.lonMin, bounds.latMin]);
    
    const pts = [pTL, pTR, pBR, pBL].filter(p => p !== null && !isNaN(p[0]) && !isNaN(p[1]));
    if (pts.length === 0) {
        // In 3D Globe, if the closest point is on the front-face but all corners are clipped,
        // it means the tile covers the visible center or is large and wraps the horizon, so it is visible!
        if (state.projectionType === 'globe') {
            return true;
        }
        return false;
    }
    
    const xs = pts.map(p => p[0]);
    const ys = pts.map(p => p[1]);
    const xMin = Math.min(...xs);
    const xMax = Math.max(...xs);
    const yMin = Math.min(...ys);
    const yMax = Math.max(...ys);
    
    // Check if the projected bounding box overlaps the screen viewport bounds
    return (xMax >= 0 && xMin <= state.width && yMax >= 0 && yMin <= state.height);
}

function getVisibleTilesAtZoom(targetZ) {
    const visible = [];
    
    function search(x, y, z) {
        if (!isTileVisible(x, y, z)) return;
        
        if (z === targetZ) {
            visible.push({ x, y });
            return;
        }
        
        const nextZ = z + 1;
        search(2 * x, 2 * y, nextZ);
        search(2 * x + 1, 2 * y, nextZ);
        search(2 * x, 2 * y + 1, nextZ);
        search(2 * x + 1, 2 * y + 1, nextZ);
    }
    
    search(0, 0, 0);
    return visible;
}

function drawTexturedTriangle(ctx, img, x0, y0, x1, y1, x2, y2, u0, v0, u1, v1, u2, v2) {
    ctx.save();
    
    // Draw triangular clipping path
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.closePath();
    ctx.clip();
    
    // Affine transformation matrix calculation
    const delta = u0 * (v1 - v2) + u1 * (v2 - v0) + u2 * (v0 - v1);
    if (Math.abs(delta) < 0.0001) {
        ctx.restore();
        return;
    }
    
    const a = (x0 * (v1 - v2) + x1 * (v2 - v0) + x2 * (v0 - v1)) / delta;
    const b = (y0 * (v1 - v2) + y1 * (v2 - v0) + y2 * (v0 - v1)) / delta;
    const c = (x0 * (u2 - u1) + x1 * (u0 - u2) + x2 * (u1 - u0)) / delta;
    const d = (y0 * (u2 - u1) + y1 * (u0 - u2) + y2 * (u1 - u0)) / delta;
    const e = (x0 * (u1 * v2 - u2 * v1) + x1 * (u2 * v0 - u0 * v2) + x2 * (u0 * v1 - u1 * v0)) / delta;
    const f = (y0 * (u1 * v2 - u2 * v1) + y1 * (u2 * v0 - u0 * v2) + y2 * (u0 * v1 - u1 * v0)) / delta;
    
    ctx.transform(a, b, c, d, e, f);
    ctx.drawImage(img, 0, 0);
    ctx.restore();
}

function drawSatelliteTiles() {
    const ctx = state.ctx;
    
    // Determine the optimal tile zoom level Z based on canvas scale and zoom factor
    const scaleValue = state.projectionType === 'globe' ? state.scale.globe : state.scale.flat;
    const worldWidth = scaleValue * state.zoom * 2 * Math.PI;
    // Clamp Z between 0 and 12 for high-resolution detailed zoom views
    const zDouble = Math.log2(worldWidth / 256);
    const z = Math.max(0, Math.min(12, Math.floor(zDouble)));
    const n = Math.pow(2, z);
    
    // Use our high-performance recursive quadtree to find visible tiles at zoom Z
    const visibleTiles = getVisibleTilesAtZoom(z);
    
    // Subdivide tile into N x N grid to wrap smoothly around curves.
    // At low zooms (z <= 3), use a fine 12x12 grid to perfectly align Web Mercator tiles
    // with the non-linear curvature of D3 Equal Earth / Orthographic projection,
    // completely eliminating vector outline misalignments (e.g. Spain).
    // At high zooms (z > 3), use a coarser grid (4x4 or 6x6) for peak performance.
    let N = 4;
    if (state.projectionType === 'globe') {
        N = z <= 3 ? 12 : 6;
    } else {
        N = z <= 3 ? 12 : 4;
    }
    
    // Temporarily expand the globe projection's clipAngle to 115 degrees
    // to allow D3 to project all visible tile vertices near or slightly behind the horizon.
    // The main canvas rendering Sphere mask will then perfectly clip them to the round boundary.
    const isGlobe = state.projectionType === 'globe';
    let oldClipAngle;
    if (isGlobe && typeof state.projection.clipAngle === 'function') {
        oldClipAngle = state.projection.clipAngle();
        state.projection.clipAngle(115);
    }
    
    // Globe visibility parameters
    const rawCenterLon = -state.rotation[0];
    const centerLon = ((rawCenterLon + 180) % 360 + 360) % 360 - 180;
    const centerLat = -state.rotation[1];
    const centerLonLat = [centerLon, centerLat];
    const limit = Math.PI / 2 + 0.02;

    visibleTiles.forEach(tileCoords => {
        const x = tileCoords.x;
        const y = tileCoords.y;
        const bounds = getTileBounds(x, y, z);
        const tile = getTileImage(x, y, z);
        if (!tile.loaded || tile.failed) return;
        
        // Calculate Mercator Y limits of the tile
        const yMaxMerc = Math.PI * (1 - 2 * y / n);
        const yMinMerc = Math.PI * (1 - 2 * (y + 1) / n);
        
        // 1. Precompute and cache projected vertex coordinates in a 2D grid
        // Array dimensions: (N + 1) x (N + 1)
        const grid = [];
        for (let j = 0; j <= N; j++) {
            grid[j] = [];
            const yMerc = yMaxMerc - j * (yMaxMerc - yMinMerc) / N;
            const lat = Math.atan(Math.sinh(yMerc)) * 180 / Math.PI;

            for (let i = 0; i <= N; i++) {
                const lon = bounds.lonMin + i * (bounds.lonMax - bounds.lonMin) / N;

                if (isGlobe) {
                    const dist = d3.geoDistance([lon, lat], centerLonLat);
                    if (dist > limit) {
                        grid[j][i] = null;
                        continue;
                    }
                }

                const px = state.projection([lon, lat]);
                grid[j][i] = (px && !isNaN(px[0]) && !isNaN(px[1])) ? px : null;
            }
        }

        // 2. Loop through grid cells and render triangles using cached vertex projections
        for (let i = 0; i < N; i++) {
            for (let j = 0; j < N; j++) {
                const pTL = grid[j][i];
                const pTR = grid[j][i + 1];
                const pBR = grid[j + 1][i + 1];
                const pBL = grid[j + 1][i];

                // If any corner is clipped, skip drawing this sub-quad
                if (!pTL || !pTR || !pBR || !pBL) continue;
                
                // Skip if the sub-quad crosses the projection's longitudinal split (stretches across the screen)
                if (state.projectionType === 'flat' && (
                    Math.abs(pTR[0] - pTL[0]) > state.width / 2 || 
                    Math.abs(pBR[0] - pBL[0]) > state.width / 2
                )) {
                    continue;
                }
                
                const u0 = i * 256 / N;
                const u1 = (i + 1) * 256 / N;
                const v0 = j * 256 / N;
                const v1 = (j + 1) * 256 / N;
                
                // Triangle 1: TL, TR, BL
                drawTexturedTriangle(ctx, tile.image, 
                    pTL[0], pTL[1], pTR[0], pTR[1], pBL[0], pBL[1],
                    u0, v0, u1, v0, u0, v1
                );
                // Triangle 2: TR, BR, BL
                drawTexturedTriangle(ctx, tile.image, 
                    pTR[0], pTR[1], pBR[0], pBR[1], pBL[0], pBL[1],
                    u1, v0, u1, v1, u0, v1
                );
            }
        }
    });
    
    // Restore the projection's original clipAngle
    if (isGlobe && typeof state.projection.clipAngle === 'function') {
        state.projection.clipAngle(oldClipAngle);
    }
}
