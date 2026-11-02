/**
 * AeroFlow Flight Data Refresh (2026)
 *
 * Applies researched, confirmed updates that were drafted earlier but never
 * written into data/data.json, plus additional 2024–2026 airline/airport fixes.
 *
 * Sources annotated per change. Run: node scripts/update-flight-data-2026.js
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const DATA_PATH = path.join(__dirname, '../data/data.json');
const GZ_PATH = path.join(__dirname, '../data/data.json.gz');
const data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));

function log(msg) { console.log('[DATA-2026] ' + msg); }

function buildIndexMap(airports) {
  const byIata = {};
  airports.forEach((ap, i) => { byIata[ap.iata] = i; });
  return byIata;
}

function mergeAirlineRoutes(fromCode, toCode, reason) {
  const from = data.airlines[fromCode];
  const to = data.airlines[toCode];
  if (!from) {
    log(`  skip merge ${fromCode} → ${toCode}: source missing`);
    return 0;
  }
  if (!to) {
    log(`  skip merge ${fromCode} → ${toCode}: target missing — deleting source only`);
    delete data.airlines[fromCode];
    return 0;
  }

  const seen = new Set(to.routes.map(([f, t]) => `${f}-${t}`));
  let added = 0;
  for (const [f, t] of from.routes) {
    const key = `${f}-${t}`;
    if (!seen.has(key) && f !== t) {
      seen.add(key);
      to.routes.push([f, t]);
      added++;
    }
  }
  to.routesCount = to.routes.length;
  delete data.airlines[fromCode];
  log(`  MERGED ${fromCode} → ${toCode}: +${added} routes (${reason})`);
  return added;
}

function removeAirline(code, reason) {
  const al = data.airlines[code];
  if (!al) {
    log(`  skip remove ${code}: already absent`);
    return 0;
  }
  const n = al.routes.length;
  delete data.airlines[code];
  log(`  REMOVED ${code} "${al.name}" (${n} routes) — ${reason}`);
  return n;
}

// ─── 1. Airport / city / country modernizations ──────────────────────────────
log('Step 1: airport, city, and country name updates');

const airportFixes = {
  // City typos (OpenFlights legacy)
  CSX: { city: 'Changsha' },
  NGB: { city: 'Ningbo' },
  MAA: { city: 'Chennai' }, // formerly Madras
  // Airport renames / relocated terminals
  HFE: { name: 'Hefei Xinqiao International Airport', lat: 31.977, lon: 116.973 },
  TAO: { name: 'Qingdao Jiaodong International Airport', lat: 36.349, lon: 120.082 },
  LAS: { name: 'Harry Reid International Airport' }, // McCarran renamed 2021
  MXP: { city: 'Milan' },
};

let airportFixCount = 0;
for (const ap of data.airports) {
  if (airportFixes[ap.iata]) {
    Object.assign(ap, airportFixes[ap.iata]);
    airportFixCount++;
  }
}
log(`✓ ${airportFixCount} airport attribute updates`);

let countryFixCount = 0;
for (const ap of data.airports) {
  if (ap.country === 'Burma') { ap.country = 'Myanmar'; countryFixCount++; }
  else if (ap.country === 'Czech Republic') { ap.country = 'Czechia'; countryFixCount++; }
  else if (ap.country === 'Macedonia') { ap.country = 'North Macedonia'; countryFixCount++; }
}
log(`✓ ${countryFixCount} country name updates`);

// ─── 2. Closed airports → active replacements ────────────────────────────────
// BER opened 31 Oct 2020; TXL passenger ops ended 8 Nov 2020; SXF became BER T5
// NAY civil ops ended 25 Sep 2019; China United moved to PKX (Daxing), not PEK
log('Step 2: migrate closed airports');

if (!data.airports.find(a => a.iata === 'BER')) {
  data.airports.push({
    iata: 'BER',
    name: 'Berlin Brandenburg Airport',
    city: 'Berlin',
    country: 'Germany',
    lat: 52.3667,
    lon: 13.5033,
    flightsCount: 0
  });
  log('  Added BER (Berlin Brandenburg Airport)');
}

let indexMap = buildIndexMap(data.airports);
const redirectTo = {
  TXL: 'BER',
  SXF: 'BER',
  NAY: 'PKX', // China United base moved to Daxing
};

let redirected = 0;
for (const airline of Object.values(data.airlines)) {
  for (let i = 0; i < airline.routes.length; i++) {
    let [fromIdx, toIdx] = airline.routes[i];
    let changed = false;
    for (const [deprecated, target] of Object.entries(redirectTo)) {
      const depIdx = indexMap[deprecated];
      const tgtIdx = indexMap[target];
      if (depIdx === undefined || tgtIdx === undefined) continue;
      if (fromIdx === depIdx) { fromIdx = tgtIdx; changed = true; }
      if (toIdx === depIdx) { toIdx = tgtIdx; changed = true; }
    }
    if (changed) {
      airline.routes[i] = [fromIdx, toIdx];
      redirected++;
    }
  }
}
log(`✓ Redirected ${redirected} route endpoints from closed airports`);

// Drop self-loops created by merges
for (const airline of Object.values(data.airlines)) {
  airline.routes = airline.routes.filter(([f, t]) => f !== t);
  airline.routesCount = airline.routes.length;
}

// Remove closed airport records and remap all route indices
const toRemove = ['TXL', 'SXF', 'NAY'];
const removeIndices = new Set(
  toRemove.map(iata => indexMap[iata]).filter(i => i !== undefined)
);

const oldToNew = {};
let newIdx = 0;
for (let oldIdx = 0; oldIdx < data.airports.length; oldIdx++) {
  oldToNew[oldIdx] = removeIndices.has(oldIdx) ? null : newIdx++;
}

for (const airline of Object.values(data.airlines)) {
  airline.routes = airline.routes
    .map(([f, t]) => {
      const nf = oldToNew[f];
      const nt = oldToNew[t];
      if (nf === null || nt === null || nf === undefined || nt === undefined) return null;
      return [nf, nt];
    })
    .filter(Boolean);
  // Deduplicate after remaps
  const seen = new Set();
  airline.routes = airline.routes.filter(([f, t]) => {
    const key = `${f}-${t}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  airline.routesCount = airline.routes.length;
}

data.airports = data.airports.filter((_, i) => !removeIndices.has(i));
log(`✓ Removed closed airports ${toRemove.join(', ')}; now ${data.airports.length} airports`);
indexMap = buildIndexMap(data.airports);

// ─── 3. Airline display-name modernizations (same IATA, current brand) ───────
log('Step 3: modernize airline names');

const airlineRenames = {
  // Confirmed current marketing names
  G3: 'GOL Linhas Aéreas',          // was mislabeled Sky Express (Greece is GQ)
  SQ: 'Singapore Airlines',         // was Singapore Airlines Cargo
  LH: 'Lufthansa',                  // was Lufthansa Cargo
  JL: 'Japan Airlines',             // was Japan Airlines Domestic
  GS: 'Tianjin Airlines',           // GS reassigned; Air Foyle long defunct
  LA: 'LATAM Airlines',             // LAN/TAM brand consolidation
  TR: 'Scoot',                      // Tigerair Singapore → Scoot
  VJ: 'VietJet Air',
  XY: 'flynas',                     // Nas Air rebranded 2013
  OD: 'Batik Air Malaysia',         // Malindo Air rebranded 2022
  AI: 'Air India',
  AZ: 'ITA Airways',                // Alitalia successor keeps AZ
  KM: 'KM Malta Airlines',          // Air Malta ceased Mar 2024; KM reused
  A5: 'Air France Hop',             // Airlinair folded into HOP!/Air France Hop
  SK: 'Scandinavian Airlines',
  SV: 'Saudia',
  AV: 'Avianca',
  IB: 'Iberia',
  TP: 'TAP Air Portugal',
  UX: 'Air Europa',
  DE: 'Condor',
  DY: 'Norwegian',
  TO: 'Transavia',
  HV: 'Transavia',
  U2: 'easyJet',
  W6: 'Wizz Air',
  FZ: 'flydubai',
  '9C': 'Spring Airlines',
  HO: 'Juneyao Air',
  AD: 'Azul Brazilian Airlines',
  G4: 'Allegiant Air',
  B6: 'JetBlue',
  AS: 'Alaska Airlines',
  WN: 'Southwest Airlines',
  AA: 'American Airlines',
  DL: 'Delta Air Lines',
  UA: 'United Airlines',
  AC: 'Air Canada',
  BA: 'British Airways',
  AF: 'Air France',
  KL: 'KLM',
  LX: 'SWISS',
  OS: 'Austrian Airlines',
  SN: 'Brussels Airlines',
  EW: 'Eurowings',
  TK: 'Turkish Airlines',
  EK: 'Emirates',
  QR: 'Qatar Airways',
  EY: 'Etihad Airways',
  CX: 'Cathay Pacific',
  NH: 'All Nippon Airways',
  KE: 'Korean Air',
  OZ: 'Asiana Airlines',
  TG: 'Thai Airways',
  MH: 'Malaysia Airlines',
  GA: 'Garuda Indonesia',
  CI: 'China Airlines',
  BR: 'EVA Air',
  AK: 'AirAsia',
  D7: 'AirAsia X',
  '5J': 'Cebu Pacific',
  PR: 'Philippine Airlines',
  VN: 'Vietnam Airlines',
  HU: 'Hainan Airlines',
  CZ: 'China Southern Airlines',
  MU: 'China Eastern Airlines',
  CA: 'Air China',
  '3U': 'Sichuan Airlines',
  MF: 'XiamenAir',
  '6E': 'IndiGo',
  SG: 'SpiceJet',
  IX: 'Air India Express',
  PC: 'Pegasus Airlines',
  XQ: 'SunExpress',
  MS: 'Egyptair',
  RJ: 'Royal Jordanian',
  GF: 'Gulf Air',
  WY: 'Oman Air',
  UL: 'SriLankan Airlines',
  BT: 'airBaltic',
  LO: 'LOT Polish Airlines',
  OK: 'Czech Airlines',
  RO: 'TAROM',
  JU: 'Air Serbia',
  A3: 'Aegean Airlines',
  VY: 'Vueling',
  LS: 'Jet2.com',
  FR: 'Ryanair',
  EI: 'Aer Lingus',
  AM: 'Aeroméxico',
  AR: 'Aerolíneas Argentinas',
  CM: 'Copa Airlines',
  Y4: 'Volaris',
  VB: 'VivaAerobus',
  BF: 'French Bee',
  NZ: 'Air New Zealand',
  VA: 'Virgin Australia',
  JQ: 'Jetstar',
  QF: 'Qantas',
  WS: 'WestJet',
  F9: 'Frontier Airlines',
  ZH: 'Shenzhen Airlines',
  S4: 'Azores Airlines',
  VR: 'Cabo Verde Airlines',
  VS: 'Virgin Atlantic',
  '3K': 'Jetstar Asia',
  KN: 'China United Airlines',
};

let renameCount = 0;
for (const [code, newName] of Object.entries(airlineRenames)) {
  if (data.airlines[code] && data.airlines[code].name !== newName) {
    log(`  RENAME ${code}: "${data.airlines[code].name}" → "${newName}"`);
    data.airlines[code].name = newName;
    renameCount++;
  }
}
log(`✓ ${renameCount} airline names modernized`);

// ─── 4. Merge absorbed carriers into active successors ───────────────────────
log('Step 4: merge absorbed carriers into successors');

// Successor merges researched from official cessation / rebrand records
const MERGES = [
  { from: 'US', to: 'AA', reason: 'US Airways final flight 17 Oct 2015; merged into American Airlines' },
  { from: 'FL', to: 'WN', reason: 'AirTran final flight 28 Dec 2014; absorbed into Southwest' },
  { from: 'VX', to: 'AS', reason: 'Virgin America brand retired 24 Apr 2018; merged into Alaska' },
  { from: 'MI', to: 'SQ', reason: 'SilkAir merged into Singapore Airlines May 2021' },
  { from: 'JJ', to: 'LA', reason: 'TAM rebranded into LATAM Brazil after LAN-TAM merger' },
  { from: '4U', to: 'EW', reason: 'Germanwings IATA 4U abandoned Mar 2018; ops under Eurowings EW; closed Apr 2020' },
  { from: 'KA', to: 'CX', reason: 'Dragonair → Cathay Dragon; brand fully ceased Oct 2020 into Cathay Pacific' },
  { from: 'TZ', to: 'TR', reason: 'Scoot legacy TZ code; Scoot flies as TR' },
  { from: 'VF', to: '3K', reason: 'Valuair absorbed into Jetstar Asia Oct 2014' },
  { from: 'TV', to: 'SN', reason: 'Virgin Express merged into Brussels Airlines Mar 2007' },
  { from: 'EL', to: 'NH', reason: 'Air Nippon absorbed into ANA Apr 2012' },
  { from: 'AP', to: 'AZ', reason: 'Air One phased out by Alitalia/ITA lineage Oct 2014' },
  { from: 'RG', to: 'G3', reason: 'VRG / Varig merged into GOL 2007' },
];

for (const m of MERGES) mergeAirlineRoutes(m.from, m.to, m.reason);

// ─── 5. Remove confirmed defunct airlines (no active successor merge) ─────────
log('Step 5: remove defunct airlines without successors');

const DEFUNCT_REMOVE = {
  // Historical (pre-existing audit list)
  TT: 'Tigerair Australia suspended Mar 2020; brand discontinued Sep 2020',
  UN: 'Transaero license revoked Oct 2015',
  AB: 'Air Berlin insolvency; flights ceased 28 Oct 2017',
  GE: 'TransAsia Airways ceased 22 Nov 2016',
  JP: 'Adria Airways bankruptcy 30 Sep 2019',
  '9W': 'Jet Airways ceased 17 Apr 2019',
  WW: 'bmibaby ceased 9 Sep 2012',
  CY: 'Cyprus Airways ceased 9 Jan 2015 (later revived under different entity/ops model)',
  OV: 'Estonian Air ceased 8 Nov 2015',
  ZI: 'Aigle Azur ceased 6 Sep 2019',
  KK: 'AtlasGlobal ceased permanently 12 Feb 2020',
  LT: 'Air Lituanica ceased 22 May 2015',
  DN: 'Senegal Airlines ceased 12 Apr 2016',
  Z4: 'Zoom Airlines insolvency Aug 2008',
  S2: 'Air Sahara acquired 2007; successor JetLite also defunct',
  '9E': 'Pinnacle Airlines renamed Endeavor Air; not an independent scheduled brand here',
  MX: 'Mexicana ceased 28 Aug 2010',
  PI: 'Piedmont Airlines (1948–1989) merged into USAir',
  JY: 'Not a commercial airline (Italian Air Force entry)',
  QH: 'Air Florida bankrupt Jul 1984',
  JA: 'Air Bosna ceased 2003',
  B9: 'Air Bangladesh licence revoked ~2007',
  QL: 'Aero Lanka ceased 2004',
  BM: 'Air Sicilia ceased 2001',
  '4D': 'Air Sinai effectively inactive as scheduled carrier',
  JW: 'Arrow Air ceased Feb 2010',
  JN: 'Excel Airways administration Sep 2008',
  EO: 'Express One International ceased 2007',
  EU: 'Empresa Ecuatoriana De Aviacion ceased 2006',
  RZ: 'Euro Exec Express ceased ~2008',
  EF: 'Far Eastern Air Transport suspended Aug 2008',
  GV: 'Aero Flight inactive',
  YK: 'Cyprus Turkish Airlines ceased 2010',
  K2: 'Eurolot ceased 28 Apr 2015',
  NS: 'Caucasus Airlines ceased ~2010',
  VH: 'Virgin Pacific ceased ~2013',
  PL: 'Aeroperú ceased 1999',
  A4: 'Southern Winds licence suspended 2007',
  LC: 'Varig Log ceased 2012',
  '8B': 'BusinessAir ceased ~2012',
  YO: 'TransHolding System ceased ~2010',
  V9: 'Star1 Airlines ceased 2009',
  DH: 'Dennis Sky inactive',
  OC: 'Catovair ceased 2012',
  W9: 'Air Bagan suspended; not resumed',
  E8: 'City Airways ceased 2012',
  '6T': 'Air Mandalay suspended 2020; not resumed',
  ZM: 'Apache Air not a scheduled commercial airline',
  HG: 'Niki (flyNiki) ceased 13/14 Dec 2017 after Air Berlin collapse',
  BE: 'Flybe final cessation 28 Jan 2023 (second collapse)',
  // 2026 confirmations
  NK: 'Spirit Airlines permanently ceased operations 2 May 2026 (SEC 8-K / carrier wind-down)',
  O6: 'Avianca Brasil / Oceanair suspended 24 May 2019; bankrupt 14 Jul 2020',
};

let removedRoutes = 0;
for (const [code, reason] of Object.entries(DEFUNCT_REMOVE)) {
  removedRoutes += removeAirline(code, reason);
}
log(`✓ Defunct removals complete (${removedRoutes} route entries dropped without merge)`);

// ─── 6. Recompute flightsCount ───────────────────────────────────────────────
log('Step 6: recompute airport flightsCount');
const computed = new Array(data.airports.length).fill(0);
for (const airline of Object.values(data.airlines)) {
  for (const [f, t] of airline.routes) {
    if (f >= 0 && f < computed.length) computed[f]++;
    if (t >= 0 && t < computed.length) computed[t]++;
  }
}
let recount = 0;
data.airports.forEach((ap, i) => {
  if (ap.flightsCount !== computed[i]) {
    ap.flightsCount = computed[i];
    recount++;
  }
});
log(`✓ flightsCount updated for ${recount} airports`);

// ─── 7. Integrity checks ─────────────────────────────────────────────────────
log('Step 7: integrity checks');
const maxIdx = data.airports.length - 1;
let errors = 0;
for (const [code, airline] of Object.entries(data.airlines)) {
  if (!airline.name || !Array.isArray(airline.routes)) {
    log(`ERROR: airline ${code} malformed`);
    errors++;
  }
  for (const [f, t] of airline.routes) {
    if (f < 0 || f > maxIdx || t < 0 || t > maxIdx) {
      log(`ERROR: ${code} out-of-range route [${f},${t}]`);
      errors++;
    }
    if (f === t) {
      log(`ERROR: ${code} self-loop at ${f}`);
      errors++;
    }
  }
}
for (const gone of toRemove) {
  if (indexMap[gone] !== undefined) {
    log(`ERROR: closed airport ${gone} still present`);
    errors++;
  }
}
for (const must of ['BER', 'PKX']) {
  if (indexMap[must] === undefined) {
    log(`ERROR: required airport ${must} missing`);
    errors++;
  }
}
for (const goneAl of ['US', 'AB', '4U', 'NK', 'BE', 'HG', 'TXL']) {
  if (goneAl.length === 3) continue; // airport codes skipped
  if (data.airlines[goneAl]) {
    log(`ERROR: defunct airline ${goneAl} still present`);
    errors++;
  }
}

if (errors > 0) {
  console.error(`[DATA-2026] Aborting write: ${errors} integrity errors`);
  process.exit(1);
}

let totalRoutes = 0;
const unique = new Set();
for (const airline of Object.values(data.airlines)) {
  totalRoutes += airline.routes.length;
  for (const [f, t] of airline.routes) unique.add(`${f}-${t}`);
}

log('\n=== FINAL STATS ===');
log(`Airports:              ${data.airports.length}`);
log(`Airlines:              ${Object.keys(data.airlines).length}`);
log(`Total route entries:   ${totalRoutes}`);
log(`Unique city-pair dirs: ${unique.size}`);
log(`LH name: ${data.airlines.LH?.name}`);
log(`SQ name: ${data.airlines.SQ?.name}`);
log(`G3 name: ${data.airlines.G3?.name}`);
log(`EW routes: ${data.airlines.EW?.routesCount}`);
log(`AA routes: ${data.airlines.AA?.routesCount}`);
log(`BER flightsCount: ${data.airports[indexMap.BER]?.flightsCount}`);

// ─── 8. Write JSON + gzip companion ──────────────────────────────────────────
const json = JSON.stringify(data);
fs.writeFileSync(DATA_PATH, json);
fs.writeFileSync(GZ_PATH, zlib.gzipSync(Buffer.from(json)));
log(`\n✅ Wrote data.json (${(Buffer.byteLength(json) / 1024).toFixed(1)} KB)`);
log(`✅ Wrote data.json.gz (${(fs.statSync(GZ_PATH).size / 1024).toFixed(1)} KB)`);
