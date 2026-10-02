import * as React from "react";

const VERTEX_SHADER = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

// A soft glass orb raymarched in a single fragment shader: low-frequency noise
// displacement makes it "breathe", two-light studio shading plus a fresnel rim
// keep it pearly against the porcelain page. Alpha stays 0 outside the orb so
// the canvas blends into the background; a faint halo smooths the silhouette.
const FRAGMENT_SHADER = `
precision highp float;
uniform vec2 uRes;
uniform float uTime;

float hash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float vnoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash(i), hash(i + vec3(1.0, 0.0, 0.0)), f.x),
        mix(hash(i + vec3(0.0, 1.0, 0.0)), hash(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
    mix(mix(hash(i + vec3(0.0, 0.0, 1.0)), hash(i + vec3(1.0, 0.0, 1.0)), f.x),
        mix(hash(i + vec3(0.0, 1.0, 1.0)), hash(i + vec3(1.0, 1.0, 1.0)), f.x), f.y),
    f.z);
}
float map(vec3 p) {
  float a = uTime * 0.12;
  mat2 r = mat2(cos(a), -sin(a), sin(a), cos(a));
  p.xz = r * p.xz;
  float breathe = 1.0 + 0.03 * sin(uTime * 0.7);
  float d = length(p) - breathe;
  d += 0.05 * vnoise(p * 2.6 + vec3(0.0, uTime * 0.18, uTime * 0.1));
  return d;
}
vec3 calcNormal(vec3 p) {
  vec2 e = vec2(0.0015, 0.0);
  return normalize(vec3(
    map(p + e.xyy) - map(p - e.xyy),
    map(p + e.yxy) - map(p - e.yxy),
    map(p + e.yyx) - map(p - e.yyx)));
}
void main() {
  vec2 uv = (gl_FragCoord.xy * 2.0 - uRes) / min(uRes.x, uRes.y);
  vec3 ro = vec3(0.0, 0.0, 2.9);
  vec3 rd = normalize(vec3(uv, -2.0));
  float t = 0.0;
  float hit = -1.0;
  float minD = 10.0;
  for (int i = 0; i < 96; i++) {
    vec3 p = ro + rd * t;
    float d = map(p);
    minD = min(minD, d);
    if (d < 0.0012) { hit = t; break; }
    t += d * 0.85;
    if (t > 6.0) break;
  }
  vec4 col = vec4(0.0);
  if (hit > 0.0) {
    vec3 p = ro + rd * hit;
    vec3 n = calcNormal(p);
    vec3 keyDir = normalize(vec3(0.65, 0.85, 0.55));
    float dif = clamp(dot(n, keyDir), 0.0, 1.0);
    float sky = clamp(n.y * 0.5 + 0.5, 0.0, 1.0);
    float fres = pow(1.0 - clamp(dot(n, -rd), 0.0, 1.0), 3.5);
    vec3 deep = vec3(0.106, 0.247, 0.627);
    vec3 blue = vec3(0.180, 0.420, 1.000);
    vec3 pearl = vec3(0.945, 0.970, 1.000);
    vec3 base = mix(deep, blue, sky);
    base = mix(base, pearl, pow(dif, 2.6) * 0.9);
    base += fres * vec3(0.360, 0.520, 1.000) * 0.85;
    vec3 h = normalize(keyDir - rd);
    base += pow(clamp(dot(n, h), 0.0, 1.0), 90.0) * 0.9;
    col = vec4(base, 1.0);
  } else {
    float halo = exp(-max(minD, 0.0) * 14.0) * 0.30;
    col = vec4(vec3(0.545, 0.678, 1.000), halo);
  }
  gl_FragColor = col;
}
`;

export function KanoOrb({className = ""}: {className?: string}) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const gl = canvas.getContext("webgl", {alpha: true, antialias: true, premultipliedAlpha: false});
    if (!gl) {
      setFailed(true);
      return;
    }
    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type)!;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        throw new Error(gl.getShaderInfoLog(shader) ?? "shader compile failed");
      }
      return shader;
    };
    let program: WebGLProgram;
    try {
      program = gl.createProgram()!;
      gl.attachShader(program, compile(gl.VERTEX_SHADER, VERTEX_SHADER));
      gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAGMENT_SHADER));
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        throw new Error(gl.getProgramInfoLog(program) ?? "program link failed");
      }
    } catch {
      setFailed(true);
      return;
    }
    gl.useProgram(program);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(program, "aPos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
    const uRes = gl.getUniformLocation(program, "uRes");
    const uTime = gl.getUniformLocation(program, "uTime");
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const side = Math.max(1, Math.round(canvas.clientWidth * dpr));
      if (canvas.width !== side || canvas.height !== side) {
        canvas.width = side;
        canvas.height = side;
        gl.viewport(0, 0, side, side);
      }
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const start = performance.now();
    let visible = true;
    let raf = 0;
    const render = (now: number) => {
      resize();
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uTime, (now - start) / 1000);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (!reduceMotion && visible) {
        raf = requestAnimationFrame(render);
      }
    };
    const visibility = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible && !reduceMotion) {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(render);
      }
    });
    visibility.observe(canvas);
    raf = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(raf);
      visibility.disconnect();
      observer.disconnect();
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
    };
  }, []);

  if (failed) {
    return <div aria-hidden="true" className={`kano-orb-fallback ${className}`} />;
  }
  return <canvas ref={canvasRef} aria-hidden="true" className={`kano-orb ${className}`} />;
}
