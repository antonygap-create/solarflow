import React, { useEffect, useRef } from 'react';
// @ts-ignore
import * as THREE from 'three';

interface Solar3DViewerProps {
  roofAreaSqm: number;
  pitchDegrees: number;
  azimuthDegrees: number;
  activePanelCount: number;
  isOrbiting: boolean;
  orbitHeading: number;
  isHeatmap?: boolean;
}

export const Solar3DViewer: React.FC<Solar3DViewerProps> = ({
  roofAreaSqm,
  pitchDegrees,
  azimuthDegrees,
  activePanelCount,
  isOrbiting,
  isHeatmap = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<any>(null);
  const cameraRef = useRef<any>(null);
  const rendererRef = useRef<any>(null);
  const houseGroupRef = useRef<any>(null);
  const animFrameRef = useRef<number | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;

    // 1. Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(isHeatmap ? 0x090d16 : 0x0b1120);
    sceneRef.current = scene;

    // 2. Camera
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(0, 18, 26);
    camera.lookAt(0, 3, 0);
    cameraRef.current = camera;

    // 3. WebGL Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    rendererRef.current = renderer;

    containerRef.current.innerHTML = '';
    containerRef.current.appendChild(renderer.domElement);

    // 4. Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xfffaed, 1.4);
    sunLight.position.set(15, 30, 20);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 1024;
    sunLight.shadow.mapSize.height = 1024;
    scene.add(sunLight);

    // 5. House & Roof 3D Group
    const houseGroup = new THREE.Group();
    houseGroupRef.current = houseGroup;
    scene.add(houseGroup);

    // Ground Plane
    const groundGeo = new THREE.PlaneGeometry(60, 60);
    const groundMat = new THREE.MeshStandardMaterial({
      color: isHeatmap ? 0x0f172a : 0x1e293b,
      roughness: 0.9,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    houseGroup.add(ground);

    // Main House Body (Photorealistic 3D Structure)
    const houseW = 12;
    const houseH = 5;
    const houseD = 10;

    const bodyGeo = new THREE.BoxGeometry(houseW, houseH, houseD);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: isHeatmap ? 0x1e293b : 0xe2e8f0,
      roughness: 0.7,
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = houseH / 2;
    body.castShadow = true;
    body.receiveShadow = true;
    houseGroup.add(body);

    // Pitched Roof Geometry
    const pitchRad = (pitchDegrees * Math.PI) / 180;
    const roofH = Math.tan(pitchRad) * (houseW / 2);

    const roofShape = new THREE.Shape();
    roofShape.moveTo(-houseW / 2 - 0.4, 0);
    roofShape.lineTo(0, Math.max(1.2, roofH));
    roofShape.lineTo(houseW / 2 + 0.4, 0);
    roofShape.closePath();

    const extrudeSettings = {
      steps: 1,
      depth: houseD + 0.8,
      bevelEnabled: false,
    };

    const roofGeo = new THREE.ExtrudeGeometry(roofShape, extrudeSettings);
    
    // Photorealistic Heatmap vs Standard Solar Material
    const roofMat = new THREE.MeshStandardMaterial({
      color: isHeatmap ? 0xf97316 : 0x475569,
      roughness: 0.5,
      metalness: 0.1,
      emissive: isHeatmap ? 0xeab308 : 0x000000,
      emissiveIntensity: isHeatmap ? 0.35 : 0,
    });
    const roof = new THREE.Mesh(roofGeo, roofMat);
    roof.position.set(0, houseH, -(houseD + 0.8) / 2);
    roof.castShadow = true;
    roof.receiveShadow = true;
    houseGroup.add(roof);

    // 6. 3D Qcells 600W Solar Panels (2.46m x 1.13m x 0.035m scaled)
    const panelsGroup = new THREE.Group();

    const panelW = 1.13;
    const panelL = 2.46;
    const panelH = 0.05;

    const cols = 6;
    const rows = Math.ceil(activePanelCount / cols);

    const frameMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.8, roughness: 0.3 });
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0x1d4ed8,
      metalness: 0.9,
      roughness: 0.1,
      emissive: 0x1e3a8a,
      emissiveIntensity: 0.2,
    });

    let count = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (count >= activePanelCount) break;
        count++;

        const panelMeshGroup = new THREE.Group();

        // Aluminum Outer Frame
        const frameGeo = new THREE.BoxGeometry(panelW, panelH, panelL);
        const frame = new THREE.Mesh(frameGeo, frameMat);
        frame.castShadow = true;
        panelMeshGroup.add(frame);

        // Dark Blue Silicon Cell Surface
        const cellGeo = new THREE.BoxGeometry(panelW - 0.06, panelH + 0.01, panelL - 0.06);
        const cell = new THREE.Mesh(cellGeo, glassMat);
        cell.castShadow = true;
        panelMeshGroup.add(cell);

        const xPos = (c - (cols - 1) / 2) * (panelW + 0.12);
        const zPos = (r - (rows - 1) / 2) * (panelL + 0.15);

        panelMeshGroup.position.set(xPos, 0, zPos);
        panelsGroup.add(panelMeshGroup);
      }
    }

    // Position panel array directly on pitched roof surface matching azimuth
    panelsGroup.position.set(0, houseH + Math.max(0.6, roofH / 2) + 0.1, 0);
    panelsGroup.rotation.x = -pitchRad * 0.8;
    panelsGroup.rotation.y = ((azimuthDegrees - 180) * Math.PI) / 180;

    houseGroup.add(panelsGroup);

    // Animation Loop
    const animate = () => {
      if (isOrbiting && houseGroupRef.current) {
        houseGroupRef.current.rotation.y += 0.008;
      }
      if (rendererRef.current && sceneRef.current && cameraRef.current) {
        rendererRef.current.render(sceneRef.current, cameraRef.current);
      }
      animFrameRef.current = requestAnimationFrame(animate);
    };

    animate();

    const handleResize = () => {
      if (!containerRef.current || !rendererRef.current || !cameraRef.current) return;
      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight;
      cameraRef.current.aspect = w / h;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(w, h);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
    };
  }, [roofAreaSqm, pitchDegrees, azimuthDegrees, activePanelCount, isOrbiting, isHeatmap]);

  return (
    <div className="relative w-full h-full rounded-2xl overflow-hidden bg-slate-950 shadow-2xl">
      <div ref={containerRef} className="w-full h-full" />
      <div className="absolute top-3 left-3 z-30 px-3 py-1.5 bg-slate-900/90 border border-slate-700 rounded-xl text-xs font-mono text-amber-300 shadow">
        🧊 Three.js Photorealistic 3D Engine · Qcells 600W CAD Mesh
      </div>
    </div>
  );
};
