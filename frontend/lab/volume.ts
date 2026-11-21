import type { PerspectiveCamera } from 'three/webgpu'
import { lightSlope, paneSize, windowPanes } from './materialStudy'

const vertex = /* glsl */ `#version 300 es
out vec2 vNdc;

void main() {
  vec2 corner = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vNdc = corner * 2.0 - 1.0;
  gl_Position = vec4(vNdc, 0.0, 1.0);
}
`

const fragment = /* glsl */ `#version 300 es
precision highp float;
uniform mat4 viewToWorld;
uniform mat4 projectionInverse;
uniform vec2 panes[4];
uniform vec2 paneSize;
uniform vec2 lightSlope;
uniform float ceiling;
uniform vec4 grille;
uniform float density;
in vec2 vNdc;
out vec4 scatteredLight;

float depthInPane(vec3 eye, vec3 ray, vec2 pane) {
  vec3 local = vec3(eye.xz - lightSlope * eye.y - pane, eye.y);
  vec3 direction = vec3(ray.xz - lightSlope * ray.y, ray.y);
  vec3 lo = vec3(-paneSize, 0.0);
  vec3 hi = vec3(paneSize, ceiling);
  vec3 inverse = mix(vec3(-1.0), vec3(1.0), greaterThanEqual(direction, vec3(0.0)))
    / max(abs(direction), 0.00001);
  vec3 t0 = (lo - local) * inverse;
  vec3 t1 = (hi - local) * inverse;
  vec3 entered = min(t0, t1);
  vec3 exited = max(t0, t1);
  float start = max(0.0, max(entered.x, max(entered.y, entered.z)));
  float end = min(exited.x, min(exited.y, exited.z));
  if (end <= start) return 0.0;
  float stepSize = (end - start) / 18.0;
  float opticalDepth = 0.0;
  for (int i = 0; i < 18; i++) {
    vec3 p = local + direction * (start + (float(i) + 0.5) * stepSize);
    vec2 d = paneSize - abs(p.xy);
    float feather = smoothstep(0.0, 0.12, min(d.x, d.y));
    float fade = smoothstep(0.12, 1.05, p.z) * (1.0 - smoothstep(ceiling - 0.92, ceiling, p.z));
    float shadow = 1.0;
    if (grille.z > 0.0) {
      vec2 opening = p.xy + pane + lightSlope * ceiling;
      vec2 slat = abs(fract((opening - grille.xy) / grille.zw + 0.5) - 0.5);
      float penumbra = mix(0.23, 0.065, clamp(p.z / ceiling, 0.0, 1.0));
      shadow = mix(0.19, 1.0, smoothstep(0.045, penumbra, slat.x)
        * smoothstep(0.078, penumbra + 0.08, slat.y));
      fade *= 0.78 + 0.15 * sin(p.z * 2.1 + p.x * 3.1 + p.y * 4.1)
        + 0.07 * sin(p.z * 7.3 - p.x * 8.4);
    }
    opticalDepth += shadow * feather * fade * stepSize;
  }
  return opticalDepth;
}

void main() {
  vec3 eye = viewToWorld[3].xyz;
  vec3 ray = normalize(mat3(viewToWorld) * (projectionInverse * vec4(vNdc, 0.5, 1.0)).xyz);
  float opticalDepth = 0.0;
  for (int i = 0; i < 4; i++) opticalDepth += depthInPane(eye, ray, panes[i]);
  vec3 tint = mix(vec3(1.0, 0.49, 0.13), vec3(1.0, 0.74, 0.39), clamp(opticalDepth * 0.2, 0.0, 1.0));
  scatteredLight = vec4(tint, 1.0 - exp(-opticalDepth * density));
}
`

interface WindowLight {
  panes: readonly number[]
  size: readonly [number, number]
  slope: readonly [number, number]
  ceiling: number
  grid: readonly [number, number, number, number]
  density: number
}

export const labWindow: WindowLight = {
  panes: windowPanes.flat(),
  size: paneSize,
  slope: lightSlope,
  ceiling: 5.4,
  grid: [0, 0, 0, 0],
  density: 0.42,
}

export const dockWindow = {
  panes: [-5.2, 1.88, -2.51, 1.59, 0.28, 1.56, 3.08, 1.9],
  size: [0.95, 1.16],
  slope: [0.36, -0.65],
  ceiling: 11.56,
  grid: [-7.9, -8.17, 0.4, 0.21],
  density: 0.31,
} as const satisfies WindowLight

function compile(gl: WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type)
  if (!shader) throw new Error('GLSL shader initialization failed')
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader
  const log = gl.getShaderInfoLog(shader)
  gl.deleteShader(shader)
  throw new Error(log ?? 'GLSL shader compilation failed')
}

export function createVolumePass() {
  const canvas = document.createElement('canvas')
  canvas.className = 'volume'
  const gl = canvas.getContext('webgl2', { premultipliedAlpha: false, depth: false, antialias: false })
  if (!gl) throw new Error('GLSL 体积光需要 WebGL2')
  const program = gl.createProgram()
  if (!program) throw new Error('GLSL program initialization failed')
  for (const [type, source] of [[gl.VERTEX_SHADER, vertex], [gl.FRAGMENT_SHADER, fragment]] as const) {
    const shader = compile(gl, type, source)
    gl.attachShader(program, shader)
    gl.deleteShader(shader)
  }
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program)
    gl.deleteProgram(program)
    throw new Error(log ?? 'GLSL program linking failed')
  }
  gl.useProgram(program)
  const panesLocation = gl.getUniformLocation(program, 'panes[0]')
  const sizeLocation = gl.getUniformLocation(program, 'paneSize')
  const slopeLocation = gl.getUniformLocation(program, 'lightSlope')
  const ceilingLocation = gl.getUniformLocation(program, 'ceiling')
  const grilleLocation = gl.getUniformLocation(program, 'grille')
  const densityLocation = gl.getUniformLocation(program, 'density')
  const viewLocation = gl.getUniformLocation(program, 'viewToWorld')
  const projectionLocation = gl.getUniformLocation(program, 'projectionInverse')

  return {
    canvas,
    setSize(width: number, height: number) {
      const ratio = Math.min(window.devicePixelRatio * 0.8, 1)
      canvas.width = Math.max(1, Math.round(width * ratio))
      canvas.height = Math.max(1, Math.round(height * ratio))
      gl.viewport(0, 0, canvas.width, canvas.height)
    },
    render(camera: PerspectiveCamera, window: WindowLight) {
      gl.uniform2fv(panesLocation, window.panes)
      gl.uniform2fv(sizeLocation, window.size)
      gl.uniform2fv(slopeLocation, window.slope)
      gl.uniform1f(ceilingLocation, window.ceiling)
      gl.uniform4fv(grilleLocation, window.grid)
      gl.uniform1f(densityLocation, window.density)
      gl.uniformMatrix4fv(viewLocation, false, camera.matrixWorld.elements)
      gl.uniformMatrix4fv(projectionLocation, false, camera.projectionMatrixInverse.elements)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
    },
    dispose() {
      gl.deleteProgram(program)
      gl.getExtension('WEBGL_lose_context')?.loseContext()
      canvas.remove()
    },
  }
}
