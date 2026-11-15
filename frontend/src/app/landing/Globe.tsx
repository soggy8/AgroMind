import { type CSSProperties, useEffect, useRef, useState } from "react";
import * as THREE from "three";

/**
 * Slowly turning Earth for the landing hero. Day side: NASA Blue Marble Next Generation; night side:
 * NASA VIIRS Black Marble city lights (both from NASA GIBS, public domain, in /public/earth).
 * Spins once every two minutes, west to east, on a 23.4° axis. Holds still under prefers-reduced-motion
 * and pauses while off screen. If WebGL is unavailable it renders nothing and the page reads the same.
 */
const DAY = "/earth/blue-marble-4096.jpg";
const NIGHT = "/earth/black-marble-2048.jpg";
const SECONDS_PER_TURN = 120;
const TILT = THREE.MathUtils.degToRad(23.4);
// Sun from the upper left and slightly behind, so the terminator and city lights cross the visible part.
const SUN = new THREE.Vector3(-0.6, 0.65, 0.05).normalize();
// Atmosphere tint: the rain token (--color-rain), as linear numbers for the shader.
const ATMOSPHERE = new THREE.Color(0x5cc8ff);

const earthVertex = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vNormalV;
  varying vec3 vViewDir;
  void main() {
    vUv = uv;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vNormalV = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vViewDir = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;

const earthFragment = /* glsl */ `
  uniform sampler2D dayMap;
  uniform sampler2D nightMap;
  uniform vec3 sunDir;
  uniform vec3 rim;
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vNormalV;
  varying vec3 vViewDir;
  void main() {
    float sun = dot(normalize(vNormalW), sunDir);
    float dayMix = smoothstep(-0.12, 0.22, sun);
    vec3 day = texture2D(dayMap, vUv).rgb * (0.35 + 0.9 * max(sun, 0.0));
    vec3 night = texture2D(nightMap, vUv).rgb;
    // Keep the bright city lights warm and strong; let the dark land stay faint.
    float lit = smoothstep(0.28, 0.75, max(night.r, max(night.g, night.b)));
    vec3 lights = night * 0.35 + vec3(1.0, 0.82, 0.55) * lit * 1.1;
    vec3 col = mix(lights, day, dayMix);
    float fres = pow(1.0 - max(dot(normalize(vNormalV), normalize(vViewDir)), 0.0), 2.6);
    col += rim * fres * (0.12 + 0.45 * dayMix);
    gl_FragColor = vec4(col, 1.0);
  }
`;

const atmosphereVertex = /* glsl */ `
  varying vec3 vNormalV;
  varying vec3 vNormalW;
  void main() {
    vNormalV = normalize(normalMatrix * normal);
    vNormalW = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const atmosphereFragment = /* glsl */ `
  uniform vec3 rim;
  uniform vec3 sunDir;
  varying vec3 vNormalV;
  varying vec3 vNormalW;
  void main() {
    float edge = pow(max(0.72 - dot(vNormalV, vec3(0.0, 0.0, 1.0)), 0.0), 3.0);
    float day = 0.25 + 0.75 * smoothstep(-0.3, 0.4, dot(normalize(vNormalW), sunDir));
    gl_FragColor = vec4(rim, 1.0) * edge * day * 1.05;
  }
`;

export default function Globe({ className = "", style }: { className?: string; style?: CSSProperties }) {
  const host = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
    } catch {
      return; // No WebGL: the hero simply has no globe.
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    el.appendChild(renderer.domElement);
    renderer.domElement.setAttribute("aria-hidden", "true");
    renderer.domElement.style.display = "block";

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
    camera.position.set(0, 0, 4.25);

    const loader = new THREE.TextureLoader();
    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    const load = (url: string) => {
      const t = loader.load(url, () => { loaded += 1; if (loaded === 2) { setReady(true); draw(); } });
      t.anisotropy = Math.min(8, maxAniso);
      return t;
    };
    let loaded = 0;
    const dayMap = load(DAY);
    const nightMap = load(NIGHT);

    const tilt = new THREE.Group();
    tilt.rotation.z = TILT;
    scene.add(tilt);

    const earthGeo = new THREE.SphereGeometry(1, 128, 96);
    const earthMat = new THREE.ShaderMaterial({
      uniforms: { dayMap: { value: dayMap }, nightMap: { value: nightMap }, sunDir: { value: SUN }, rim: { value: ATMOSPHERE } },
      vertexShader: earthVertex,
      fragmentShader: earthFragment,
    });
    const earth = new THREE.Mesh(earthGeo, earthMat);
    earth.rotation.y = -0.35; // Start with North America turned toward the viewer.
    tilt.add(earth);

    const atmoGeo = new THREE.SphereGeometry(1.07, 96, 64);
    const atmoMat = new THREE.ShaderMaterial({
      uniforms: { rim: { value: ATMOSPHERE }, sunDir: { value: SUN } },
      vertexShader: atmosphereVertex,
      fragmentShader: atmosphereFragment,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
    });
    scene.add(new THREE.Mesh(atmoGeo, atmoMat));

    const draw = () => renderer.render(scene, camera);
    const resize = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      renderer.domElement.style.width = "100%";
      renderer.domElement.style.height = "100%";
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      draw();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();

    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      earth.rotation.y += (dt * Math.PI * 2) / SECONDS_PER_TURN;
      draw();
      frame = requestAnimationFrame(tick);
    };
    const start = () => { if (!still && !frame) { last = performance.now(); frame = requestAnimationFrame(tick); } };
    const stop = () => { cancelAnimationFrame(frame); frame = 0; };
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) start(); else stop(); });
    io.observe(el);
    start();

    return () => {
      stop();
      io.disconnect();
      ro.disconnect();
      earthGeo.dispose(); earthMat.dispose(); atmoGeo.dispose(); atmoMat.dispose();
      dayMap.dispose(); nightMap.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return (
    <div ref={host} aria-hidden style={style}
      className={`transition-opacity duration-[1200ms] ease-out ${ready ? "opacity-100" : "opacity-0"} ${className}`} />
  );
}
