const fs = require('node:fs');
const assert = require('node:assert/strict');
const core = require('../src/core.js');
const original = JSON.parse(fs.readFileSync('src/snapshot.json', 'utf8'));
const previous = ['P1', 'P2'].map(LabelLinea => ({attributes: {LabelLinea}}));
const merged = core.withTestRoutes({...original, features: [...original.features, ...previous]});
assert.equal(merged.features.length, original.features.length + 2);
assert.equal(core.withTestRoutes(merged).features.length, merged.features.length);
assert(!merged.features.some(f => f.attributes.LabelLinea === 'P2'));
const routes = core.validFeatures(merged).filter(f => f.attributes.LabelLinea === 'P1');
assert.equal(routes.length, 2);
for (const route of routes) {
 assert.equal(route.attributes.TestRoute, 'alcala-torreblanca-v1');
 assert(route.geometry.paths[0].length > 50);
 assert(core.distance(route) > 9 && core.distance(route) < 11);
 assert.equal(route.stops.length, 6);
 assert(route.stops.every(s => /ficticia/.test(s.attributes.Nombre)));
 const xml = core.gpx([route]);
 assert.match(xml, /Línea ficticia/);
 assert.equal((xml.match(/<wpt /g) || []).length, 6);
}
assert.notEqual(core.routeFilename(routes[0]), core.routeFilename(routes[1]));
assert.equal(routes[0].attributes.Sublinea, routes[1].attributes.Sublinea);
assert.notDeepEqual(routes[0].geometry.paths[0], routes[1].geometry.paths[0].slice().reverse());
const end = routes[0].geometry.paths[0].at(-1);
assert(Math.abs(end[0] - (-5.902623612232397)) < .0002 && Math.abs(end[1] - 37.3876332363076) < .0002);
assert.match(fs.readFileSync('src/app.js', 'utf8'), /data=withTestRoutes\(data\);\s*latestOfflineDataset=data/);
console.log('Correcto: una línea de prueba, ida y vuelta, seis paradas ficticias y sustitución de las copias antiguas.');
