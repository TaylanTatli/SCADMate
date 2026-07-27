import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { Box, Focus, RotateCcw } from "lucide-react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import type { RenderStatus } from "../types";
import type { RenderedView } from "../ai/skills";

interface PreviewPanelProps {
  stl: ArrayBuffer | null;
  status: RenderStatus;
  elapsedMs?: number;
  error?: string;
}

interface SceneState {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  grid: THREE.GridHelper;
  mesh: THREE.Mesh | null;
  animationFrame: number;
  resizeObserver: ResizeObserver;
  fit: () => void;
}

export interface PreviewPanelHandle {
  captureViews: () => Promise<RenderedView[]>;
}

function fitCamera(state: SceneState): void {
  if (!state.mesh) return;
  const box = new THREE.Box3().setFromObject(state.mesh);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxSize = Math.max(size.x, size.y, size.z, 1);
  const distance =
    maxSize / (2 * Math.tan(THREE.MathUtils.degToRad(state.camera.fov / 2)));
  state.camera.position.set(
    center.x + distance * 0.9,
    center.y - distance * 1.25,
    center.z + distance * 0.85,
  );
  state.camera.near = Math.max(distance / 100, 0.01);
  state.camera.far = distance * 100;
  state.camera.updateProjectionMatrix();
  state.controls.target.copy(center);
  state.controls.update();
}

function captureCanvas(renderer: THREE.WebGLRenderer): string {
  const source = renderer.domElement;
  const scale = Math.min(1, 512 / Math.max(source.width, source.height, 1));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(source.width * scale));
  canvas.height = Math.max(1, Math.round(source.height * scale));
  const context = canvas.getContext("2d");
  if (!context)
    throw new Error("A preview snapshot canvas could not be created.");
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/png");
}

function captureModelViews(state: SceneState): RenderedView[] {
  if (!state.mesh) return [];
  const box = new THREE.Box3().setFromObject(state.mesh);
  const center = box.getCenter(new THREE.Vector3());
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  const halfFov = THREE.MathUtils.degToRad(state.camera.fov / 2);
  const distance = Math.max(sphere.radius / Math.sin(halfFov), 1) * 1.18;
  const views: Array<{ name: RenderedView["name"]; direction: THREE.Vector3 }> =
    [
      { name: "isometric", direction: new THREE.Vector3(1, -1, 0.8) },
      { name: "front", direction: new THREE.Vector3(0, -1, 0.08) },
      { name: "rear", direction: new THREE.Vector3(0, 1, 0.08) },
      { name: "left", direction: new THREE.Vector3(-1, 0, 0.08) },
      { name: "right", direction: new THREE.Vector3(1, 0, 0.08) },
      { name: "top", direction: new THREE.Vector3(0, 0, 1) },
    ];
  const savedPosition = state.camera.position.clone();
  const savedQuaternion = state.camera.quaternion.clone();
  const savedUp = state.camera.up.clone();
  const savedTarget = state.controls.target.clone();
  const controlsEnabled = state.controls.enabled;
  const gridVisible = state.grid.visible;
  state.controls.enabled = false;
  state.grid.visible = false;

  try {
    return views.map(({ name, direction }) => {
      state.camera.up.set(0, 0, 1);
      if (name === "top") state.camera.up.set(0, 1, 0);
      state.camera.position
        .copy(center)
        .add(direction.normalize().multiplyScalar(distance));
      state.camera.near = Math.max(distance / 100, 0.01);
      state.camera.far = distance * 100;
      state.camera.lookAt(center);
      state.camera.updateProjectionMatrix();
      state.renderer.render(state.scene, state.camera);
      return { name, dataUrl: captureCanvas(state.renderer) };
    });
  } finally {
    state.camera.position.copy(savedPosition);
    state.camera.quaternion.copy(savedQuaternion);
    state.camera.up.copy(savedUp);
    state.camera.updateProjectionMatrix();
    state.controls.target.copy(savedTarget);
    state.controls.enabled = controlsEnabled;
    state.grid.visible = gridVisible;
    state.controls.update();
    state.renderer.render(state.scene, state.camera);
  }
}

export const PreviewPanel = forwardRef<PreviewPanelHandle, PreviewPanelProps>(
  function PreviewPanel({ stl, status, elapsedMs, error }, ref) {
    const hostRef = useRef<HTMLDivElement>(null);
    const sceneRef = useRef<SceneState | null>(null);
    const [viewerError, setViewerError] = useState<string>();

    useImperativeHandle(
      ref,
      () => ({
        captureViews: async () => {
          const state = sceneRef.current;
          return state ? captureModelViews(state) : [];
        },
      }),
      [],
    );

    useEffect(() => {
      const host = hostRef.current;
      if (!host) return;

      const scene = new THREE.Scene();
      scene.background = new THREE.Color("#111412");
      const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 5000);
      camera.up.set(0, 0, 1);
      camera.position.set(130, -160, 110);

      let renderer: THREE.WebGLRenderer;
      try {
        renderer = new THREE.WebGLRenderer({
          antialias: true,
          alpha: false,
          preserveDrawingBuffer: true,
        });
      } catch {
        const errorTimer = window.setTimeout(
          () =>
            setViewerError(
              "WebGL is unavailable. Enable hardware acceleration to use the 3D preview.",
            ),
          0,
        );
        return () => window.clearTimeout(errorTimer);
      }
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.shadowMap.enabled = true;
      host.append(renderer.domElement);

      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      controls.screenSpacePanning = true;

      scene.add(new THREE.HemisphereLight("#f7f1df", "#202820", 2.4));
      const key = new THREE.DirectionalLight("#fff4d6", 4);
      key.position.set(-80, -100, 160);
      key.castShadow = true;
      scene.add(key);
      const rim = new THREE.DirectionalLight("#80a99b", 1.8);
      rim.position.set(120, 100, 60);
      scene.add(rim);

      const grid = new THREE.GridHelper(300, 30, "#3c493f", "#222a25");
      grid.rotation.x = Math.PI / 2;
      grid.position.z = -0.1;
      scene.add(grid);

      const resizeObserver = new ResizeObserver(() => {
        const { clientWidth, clientHeight } = host;
        if (!clientWidth || !clientHeight) return;
        camera.aspect = clientWidth / clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(clientWidth, clientHeight, false);
      });
      resizeObserver.observe(host);

      const state: SceneState = {
        renderer,
        scene,
        camera,
        controls,
        grid,
        mesh: null,
        animationFrame: 0,
        resizeObserver,
        fit: () => fitCamera(state),
      };
      const animate = () => {
        controls.update();
        renderer.render(scene, camera);
        state.animationFrame = requestAnimationFrame(animate);
      };

      state.animationFrame = requestAnimationFrame(animate);
      sceneRef.current = state;

      return () => {
        cancelAnimationFrame(state.animationFrame);
        state.resizeObserver.disconnect();
        state.controls.dispose();
        state.mesh?.geometry.dispose();
        if (state.mesh?.material instanceof THREE.Material)
          state.mesh.material.dispose();
        state.renderer.dispose();
        state.renderer.domElement.remove();
        sceneRef.current = null;
      };
    }, []);

    useEffect(() => {
      const state = sceneRef.current;
      if (!state || !stl) return;
      try {
        const geometry = new STLLoader().parse(stl);
        geometry.computeVertexNormals();
        geometry.center();
        const material = new THREE.MeshStandardMaterial({
          color: "#d79b4b",
          roughness: 0.6,
          metalness: 0.08,
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        if (state.mesh) {
          state.scene.remove(state.mesh);
          state.mesh.geometry.dispose();
          if (state.mesh.material instanceof THREE.Material)
            state.mesh.material.dispose();
        }
        state.mesh = mesh;
        state.scene.add(mesh);
        state.fit();
      } catch {
        // The render layer reports parse/compile failures; keep the prior valid mesh.
      }
    }, [stl]);

    const fit = useCallback(() => sceneRef.current?.fit(), []);
    const reset = useCallback(() => {
      const state = sceneRef.current;
      if (!state) return;
      state.controls.reset();
      state.fit();
    }, []);

    return (
      <section className="panel preview-panel" aria-label="3D preview">
        <div className="preview-heading">
          <div>
            <span className="eyebrow">Live model</span>
            <h2>3D preview</h2>
          </div>
          <div className="preview-actions">
            <button
              className="icon-button"
              onClick={fit}
              title="Fit model to view"
            >
              <Focus size={16} />
            </button>
            <button
              className="icon-button"
              onClick={reset}
              title="Reset camera"
            >
              <RotateCcw size={15} />
            </button>
          </div>
        </div>
        <div className="viewer-host" ref={hostRef}>
          {!stl && status === "idle" && (
            <div className="viewer-empty">
              <Box size={28} />
              <span>Your rendered model will appear here</span>
            </div>
          )}
          {viewerError && (
            <div className="viewer-empty viewer-unavailable">
              <Box size={28} />
              <span>{viewerError}</span>
            </div>
          )}
          {(status === "rendering" || status === "initializing") && (
            <div className="render-overlay">
              <span className="render-spinner" />
              <strong>
                {status === "initializing"
                  ? "Loading OpenSCAD…"
                  : "Compiling model…"}
              </strong>
              <small>Previous valid preview stays visible</small>
            </div>
          )}
          {status === "error" && error && (
            <div className="preview-error" title={error}>
              Compile failed · previous preview preserved
            </div>
          )}
          <div className="viewer-hint">Orbit · Pan · Zoom</div>
        </div>
        <div className="preview-footer">
          <span className={`compile-state ${status}`}>
            <i />
            {status === "success"
              ? `Compiled${elapsedMs ? ` in ${(elapsedMs / 1000).toFixed(1)}s` : ""}`
              : status === "error"
                ? "Compilation error"
                : status === "rendering" || status === "initializing"
                  ? "OpenSCAD is working"
                  : "Ready"}
          </span>
          <span>WebAssembly · Manifold</span>
        </div>
      </section>
    );
  },
);
