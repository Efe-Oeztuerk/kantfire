// Rendert kleine Waffenbilder (mit Skin) als Bild-URL – für HUD, Inventar, Shop und Truhen.
import * as THREE from 'three';
import { makeGun } from './models.js';

let renderer = null, scene = null, cam = null;
const cache = new Map();

function setup() {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(256, 112);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 2.2));
  const d = new THREE.DirectionalLight(0xffffff, 1.6); d.position.set(1, 2, 3); scene.add(d);
  cam = new THREE.OrthographicCamera(-0.6, 0.6, 0.26, -0.26, 0.01, 10);
  cam.position.set(2, 0.15, 0); cam.lookAt(0, 0, 0);
}

export function weaponIcon(wid, finish = 'f_stock') {
  const key = wid + '|' + finish;
  if (cache.has(key)) return cache.get(key);
  if (!renderer) setup();
  const g = makeGun(wid, finish, true);
  // Waffe zentrieren und auf Bildbreite skalieren
  const box = new THREE.Box3().setFromObject(g);
  const size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
  const s = 1.05 / Math.max(size.z, size.y * 2.3, 0.2);
  g.position.sub(center.multiplyScalar(s));
  g.scale.setScalar(s);
  g.rotation.y = 0;
  scene.add(g);
  renderer.render(scene, cam);
  const url = renderer.domElement.toDataURL('image/png');
  scene.remove(g);
  cache.set(key, url);
  return url;
}
