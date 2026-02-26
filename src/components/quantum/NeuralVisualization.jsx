import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';

/**
 * NEURAL NETWORK VISUALIZATION
 * Real-time 3D neural network showing fraud detection pathways
 */
export default function NeuralVisualization({ 
  nodes = 50, 
  connections = 100,
  activity = [],
  className = ""
}) {
  const containerRef = useRef(null);
  const sceneRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;

    const scene = new THREE.Scene();
    sceneRef.current = scene;
    
    const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
    camera.position.z = 30;

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(width, height);
    renderer.setClearColor(0x000000, 0);
    containerRef.current.appendChild(renderer.domElement);

    // Create neural nodes
    const nodeGeometry = new THREE.SphereGeometry(0.3, 16, 16);
    const nodeMaterial = new THREE.MeshBasicMaterial({ color: 0x00ffff });
    const nodeObjects = [];

    for (let i = 0; i < nodes; i++) {
      const node = new THREE.Mesh(nodeGeometry, nodeMaterial.clone());
      node.position.set(
        (Math.random() - 0.5) * 40,
        (Math.random() - 0.5) * 40,
        (Math.random() - 0.5) * 20
      );
      scene.add(node);
      nodeObjects.push(node);
    }

    // Create connections
    const lineMaterial = new THREE.LineBasicMaterial({ 
      color: 0x00ffff, 
      transparent: true, 
      opacity: 0.3 
    });
    
    const connectionLines = [];
    for (let i = 0; i < connections; i++) {
      const start = nodeObjects[Math.floor(Math.random() * nodes)];
      const end = nodeObjects[Math.floor(Math.random() * nodes)];
      
      const geometry = new THREE.BufferGeometry().setFromPoints([
        start.position,
        end.position
      ]);
      
      const line = new THREE.Line(geometry, lineMaterial.clone());
      scene.add(line);
      connectionLines.push({ line, start, end });
    }

    // Animation
    let frameId;
    const animate = () => {
      frameId = requestAnimationFrame(animate);

      // Pulse nodes
      nodeObjects.forEach((node, i) => {
        const scale = 1 + Math.sin(Date.now() * 0.001 + i) * 0.2;
        node.scale.set(scale, scale, scale);
        
        // Activity-based color
        if (activity.includes(i)) {
          node.material.color.setHex(0xff00ff); // Magenta for active
        } else {
          node.material.color.setHex(0x00ffff); // Cyan for idle
        }
      });

      // Update connection positions
      connectionLines.forEach(({ line, start, end }) => {
        line.geometry.setFromPoints([start.position, end.position]);
      });

      scene.rotation.y += 0.001;
      scene.rotation.x = Math.sin(Date.now() * 0.0005) * 0.2;

      renderer.render(scene, camera);
    };

    animate();

    return () => {
      cancelAnimationFrame(frameId);
      renderer.dispose();
      containerRef.current?.removeChild(renderer.domElement);
    };
  }, [nodes, connections, activity]);

  return (
    <div ref={containerRef} className={`w-full h-full ${className}`} />
  );
}