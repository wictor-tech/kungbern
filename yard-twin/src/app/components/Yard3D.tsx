import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { RunResult } from "../../engine/types.ts";
import type { TruckStatus } from "../playback.ts";
import { doorPositions, LAYOUT, layoutAt, makeSpots } from "../yardLayout.ts";

/** Isometrisk 3D-vy (Three.js) – samma layout och samma positioner som 2D-vyn. Laddas lat. */
const COLORS: Record<"light" | "dark", Record<TruckStatus | "ground" | "road" | "building" | "door" | "doorOn" | "cab" | "bg", number>> = {
  light: { bg: 0xf5fafe, ground: 0xe8eef4, road: 0xd6dee7, building: 0xdbeafe, door: 0xffffff, doorOn: 0x0ea5e9, cab: 0x0c4a6e, planned: 0x64748b, queue: 0x8b5cf6, gate: 0x8b5cf6, wait: 0xf59e0b, overflow: 0xef4444, unload: 0x0ea5e9, leave: 0x10b981, done: 0x64748b },
  dark: { bg: 0x0b1220, ground: 0x172235, road: 0x1f2a3c, building: 0x1a2c47, door: 0x111a2b, doorOn: 0x38bdf8, cab: 0xe0f2fe, planned: 0x94a3b8, queue: 0x8b5cf6, gate: 0x8b5cf6, wait: 0xf59e0b, overflow: 0xef4444, unload: 0x38bdf8, leave: 0x10b981, done: 0x94a3b8 },
};

interface Props {
  result: RunResult;
  doors: string[];
  t: number;
  theme: "light" | "dark";
}

export default function Yard3D({ result, doors, t, theme }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const state = useRef<{ renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.OrthographicCamera; trucks: Map<string, THREE.Group>; doorMeshes: Map<string, THREE.Mesh>; dyn: THREE.Group } | null>(null);
  const spots = useMemo(() => makeSpots(result), [result]);
  const doorX = useMemo(() => doorPositions(doors), [doors]);
  const pal = COLORS[theme];

  // Scen (byggs om när dörrar eller tema ändras)
  useEffect(() => {
    const el = host.current!;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true });
    } catch {
      el.textContent = "WebGL saknas i den här webbläsaren – använd 2D-vyn.";
      return;
    }
    const { W, H, BLD, ROAD_Y } = LAYOUT;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(pal.bg);
    const aspect = 16 / 9;
    const size = 380;
    const camera = new THREE.OrthographicCamera(-size * aspect, size * aspect, size, -size, -2000, 4000);
    camera.position.set(W / 2 + 600, 700, H / 2 + 700);
    camera.lookAt(W / 2, 0, H / 2);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.4);
    sun.position.set(400, 800, 300);
    scene.add(sun);

    const box = (w: number, h: number, d: number, color: number, x: number, y: number, z: number) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color }));
      m.position.set(x, y, z);
      scene.add(m);
      return m;
    };
    box(690, 2, 370, pal.ground, 300 + 345, -1, 140 + 185);
    box(330, 2, 74, pal.road, 165, -1, ROAD_Y - 15);
    box(BLD.w, 70, BLD.h, pal.building, BLD.x + BLD.w / 2, 35, BLD.y + BLD.h / 2);
    box(6, 30, 74, COLORS[theme].queue, LAYOUT.GATE.x - 27, 15, ROAD_Y - 15);
    const doorMeshes = new Map<string, THREE.Mesh>();
    for (const d of doors) doorMeshes.set(d, box(30, 26, 3, pal.door, doorX.get(d)!, 14, BLD.y + BLD.h + 1));
    const dyn = new THREE.Group();
    scene.add(dyn);

    const resize = () => {
      const w = el.clientWidth;
      const h = Math.round(w / aspect);
      renderer.setSize(w, h);
      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    };
    resize();
    el.appendChild(renderer.domElement);
    window.addEventListener("resize", resize);
    state.current = { renderer, scene, camera, trucks: new Map(), doorMeshes, dyn };
    return () => {
      window.removeEventListener("resize", resize);
      renderer.dispose();
      el.innerHTML = "";
      state.current = null;
    };
  }, [doors, doorX, pal, theme]);

  // Uppdatera lastbilar vid varje tidssteg
  useEffect(() => {
    const s = state.current;
    if (!s) return;
    const { trucks, busyDoors } = layoutAt(result, t, spots, doorX);
    const seen = new Set<string>();
    for (const p of trucks) {
      seen.add(p.id);
      let g = s.trucks.get(p.id);
      if (!g) {
        g = new THREE.Group();
        const trailer = new THREE.Mesh(new THREE.BoxGeometry(38, 18, 16), new THREE.MeshLambertMaterial({ color: pal[p.status] }));
        trailer.position.set(-5, 10, 0);
        const cab = new THREE.Mesh(new THREE.BoxGeometry(10, 14, 14), new THREE.MeshLambertMaterial({ color: pal.cab }));
        cab.position.set(20, 8, 0);
        g.add(trailer, cab);
        s.dyn.add(g);
        s.trucks.set(p.id, g);
      }
      ((g.children[0] as THREE.Mesh).material as THREE.MeshLambertMaterial).color.setHex(pal[p.status]);
      // mjuk förflyttning mot målet
      g.position.lerp(new THREE.Vector3(p.x, 0, p.y), g.position.lengthSq() === 0 ? 1 : 0.5);
      g.rotation.y = (-p.rot * Math.PI) / 180;
    }
    for (const [id, g] of s.trucks) {
      if (!seen.has(id)) {
        s.dyn.remove(g);
        s.trucks.delete(id);
      }
    }
    for (const [d, m] of s.doorMeshes) (m.material as THREE.MeshLambertMaterial).color.setHex(busyDoors.has(d) ? pal.doorOn : pal.door);
    s.renderer.render(s.scene, s.camera);
  }, [result, t, spots, doorX, pal]);

  return <div ref={host} style={{ width: "100%", borderRadius: 10, overflow: "hidden" }} role="img" aria-label="3D" />;
}
