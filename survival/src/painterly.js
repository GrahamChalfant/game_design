import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// The painterly finish: after the scene is drawn, a Kuwahara filter runs over the whole
// picture. Each pixel takes the average colour of whichever neighbouring patch is most
// even, so edges stay sharp but surfaces turn into soft, brush-like strokes.
const KuwaharaShader = {
  uniforms: { tDiffuse: { value: null }, resolution: { value: new THREE.Vector2() } },
  vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform vec2 resolution; varying vec2 vUv;
    const int R = 2; // brush size in pixels: bigger is more painted but blurrier and slower
    void main() {
      vec2 px = 1.0 / resolution;
      vec3 m0 = vec3(0.0), m1 = vec3(0.0), m2 = vec3(0.0), m3 = vec3(0.0);
      vec3 s0 = vec3(0.0), s1 = vec3(0.0), s2 = vec3(0.0), s3 = vec3(0.0);
      for (int j = -R; j <= R; j++) {
        for (int i = -R; i <= R; i++) {
          vec3 c = texture2D(tDiffuse, vUv + vec2(float(i), float(j)) * px).rgb;
          if (i <= 0 && j <= 0) { m0 += c; s0 += c * c; }
          if (i >= 0 && j <= 0) { m1 += c; s1 += c * c; }
          if (i <= 0 && j >= 0) { m2 += c; s2 += c * c; }
          if (i >= 0 && j >= 0) { m3 += c; s3 += c * c; }
        }
      }
      float n = float((R + 1) * (R + 1));
      vec3 best = vec3(0.0); float bestV = 1e9;
      vec3 ms[4]; ms[0] = m0; ms[1] = m1; ms[2] = m2; ms[3] = m3;
      vec3 ss[4]; ss[0] = s0; ss[1] = s1; ss[2] = s2; ss[3] = s3;
      for (int k = 0; k < 4; k++) {
        vec3 m = ms[k] / n;
        vec3 v = abs(ss[k] / n - m * m);
        float t = v.r + v.g + v.b;
        if (t < bestV) { bestV = t; best = m; }
      }
      gl_FragColor = vec4(best, 1.0);
    }`,
};

// Returns { render() } to use instead of renderer.render(scene, camera).
export function createPainterlyRenderer(renderer, scene, camera) {
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const kuwahara = new ShaderPass(KuwaharaShader);
  composer.addPass(kuwahara);
  composer.addPass(new OutputPass());
  const resize = () => {
    composer.setSize(window.innerWidth, window.innerHeight);
    renderer.getDrawingBufferSize(kuwahara.uniforms.resolution.value);
  };
  resize();
  window.addEventListener('resize', resize);
  return { render: () => composer.render() };
}
