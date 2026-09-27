import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

const METAL = 0x2c2c31;
const GLASS = 0x1d2630;

function tint(geo, hex) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.deleteAttribute("uv");
  const c = new THREE.Color(hex);
  const col = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < col.length; i += 3) col.set([c.r, c.g, c.b], i);
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  return g;
}

const join = (parts) => mergeGeometries(parts.map(([g, hex]) => tint(g, hex)));

// A toy high-wing spotter plane, nose along +z so lookAt flies it forward. Body in the side's
// colour, a band of the other side's cream or ink so it reads against the sky either way.
export function buildPlane(body, band) {
  const hull = join([
    [new THREE.CylinderGeometry(0.3, 0.12, 3, 12).rotateX(Math.PI / 2), body],
    [new THREE.CylinderGeometry(0.34, 0.34, 0.36, 14).rotateX(Math.PI / 2).translate(0, 0, 1.62), METAL],
    [new THREE.ConeGeometry(0.12, 0.26, 10).rotateX(Math.PI / 2).translate(0, 0, 1.92), METAL],
    [new THREE.CylinderGeometry(0.295, 0.28, 0.22, 12).rotateX(Math.PI / 2).translate(0, 0, -0.35), band],
    [new RoundedBoxGeometry(4.8, 0.08, 0.8, 2, 0.03).translate(0, 0.34, 0.45), body],
    [new RoundedBoxGeometry(0.5, 0.085, 0.5, 2, 0.03).translate(1.9, 0.345, 0.45), band],
    [new RoundedBoxGeometry(0.5, 0.085, 0.5, 2, 0.03).translate(-1.9, 0.345, 0.45), band],
    [new RoundedBoxGeometry(0.34, 0.26, 0.7, 2, 0.06).translate(0, 0.2, 0.6), GLASS],
    [new RoundedBoxGeometry(1.6, 0.05, 0.42, 2, 0.02).translate(0, 0.05, -1.35), body],
    [new RoundedBoxGeometry(0.05, 0.62, 0.5, 2, 0.02).translate(0, 0.33, -1.38), body],
    [new THREE.CylinderGeometry(0.02, 0.02, 0.62, 5).rotateZ(0.5).translate(0.28, 0.02, 0.5), METAL],
    [new THREE.CylinderGeometry(0.02, 0.02, 0.62, 5).rotateZ(-0.5).translate(-0.28, 0.02, 0.5), METAL],
    [new THREE.CylinderGeometry(0.14, 0.14, 0.08, 10).rotateZ(Math.PI / 2).translate(0.44, -0.28, 0.55), METAL],
    [new THREE.CylinderGeometry(0.14, 0.14, 0.08, 10).rotateZ(Math.PI / 2).translate(-0.44, -0.28, 0.55), METAL],
  ]);
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.1 });
  const plane = new THREE.Mesh(hull, mat);
  const prop = new THREE.Mesh(join([[new RoundedBoxGeometry(0.1, 1.5, 0.03, 1, 0.012), METAL]]), mat);
  prop.position.z = 1.84;
  plane.add(prop);
  plane.userData.prop = prop;
  plane.scale.setScalar(1.9);
  return plane;
}
