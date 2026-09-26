import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

// Some built-in geometries are indexed and some are not; merging needs them all alike.
export const merge = (list) => mergeGeometries(list.map((g) => (g.index ? g.toNonIndexed() : g)));
