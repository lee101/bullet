export interface ShaderEffect {
  x: number;
  y: number;
  radius: number;
  type: 'fire' | 'ice' | 'lightning' | 'magic' | 'poison' | 'heal';
  intensity: number;
  life: number;
  maxLife: number;
}

const VERT = `
  attribute vec2 a_position;
  varying vec2 v_uv;
  void main() {
    v_uv = a_position * 0.5 + 0.5;
    gl_Position = vec4(a_position, 0.0, 1.0);
  }
`;

const FRAG_FIRE = `
  precision mediump float;
  varying vec2 v_uv;
  uniform float u_time;
  uniform vec2 u_center;
  uniform float u_radius;
  uniform float u_intensity;
  uniform vec2 u_resolution;

  float noise(vec2 p) {
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
  }

  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) {
      v += a * noise(p);
      p *= 2.0;
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution;
    vec2 center = u_center / u_resolution;
    float dist = distance(uv, center);
    float r = u_radius / min(u_resolution.x, u_resolution.y);

    if (dist > r) { discard; }

    float n = fbm(uv * 8.0 + u_time * 2.0);
    float flame = 1.0 - dist / r;
    flame = pow(flame, 1.5) * (0.7 + 0.3 * n);

    vec3 col = mix(
      vec3(1.0, 0.3, 0.0),
      vec3(1.0, 0.8, 0.2),
      flame * n
    );

    float alpha = flame * u_intensity;
    gl_FragColor = vec4(col, alpha * 0.8);
  }
`;

const FRAG_ICE = `
  precision mediump float;
  varying vec2 v_uv;
  uniform float u_time;
  uniform vec2 u_center;
  uniform float u_radius;
  uniform float u_intensity;
  uniform vec2 u_resolution;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  float voronoi(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    float m = 1.0;
    for (int y = -1; y <= 1; y++) {
      for (int x = -1; x <= 1; x++) {
        vec2 n = vec2(float(x), float(y));
        vec2 r = n + hash(i + n) - f;
        m = min(m, dot(r, r));
      }
    }
    return sqrt(m);
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution;
    vec2 center = u_center / u_resolution;
    float dist = distance(uv, center);
    float r = u_radius / min(u_resolution.x, u_resolution.y);

    if (dist > r) { discard; }

    float v = voronoi(uv * 20.0 + u_time * 0.5);
    float frost = 1.0 - dist / r;
    frost = pow(frost, 1.2) * (0.6 + 0.4 * v);

    vec3 col = mix(
      vec3(0.3, 0.7, 1.0),
      vec3(0.9, 0.95, 1.0),
      frost
    );

    float alpha = frost * u_intensity;
    gl_FragColor = vec4(col, alpha * 0.7);
  }
`;

const FRAG_LIGHTNING = `
  precision mediump float;
  varying vec2 v_uv;
  uniform float u_time;
  uniform vec2 u_center;
  uniform float u_radius;
  uniform float u_intensity;
  uniform vec2 u_resolution;

  float rand(float x) { return fract(sin(x) * 43758.5453); }

  void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution;
    vec2 center = u_center / u_resolution;
    float dist = distance(uv, center);
    float r = u_radius / min(u_resolution.x, u_resolution.y);

    if (dist > r) { discard; }

    vec2 d = uv - center;
    float angle = atan(d.y, d.x);
    float bolt = abs(sin(angle * 8.0 + u_time * 20.0));
    bolt = pow(bolt, 4.0);

    float flash = rand(floor(u_time * 10.0)) > 0.7 ? 1.5 : 1.0;
    float glow = (1.0 - dist / r) * bolt * flash;

    vec3 col = mix(
      vec3(0.5, 0.5, 1.0),
      vec3(1.0, 1.0, 0.8),
      glow
    );

    float alpha = glow * u_intensity;
    gl_FragColor = vec4(col, alpha);
  }
`;

const FRAG_MAGIC = `
  precision mediump float;
  varying vec2 v_uv;
  uniform float u_time;
  uniform vec2 u_center;
  uniform float u_radius;
  uniform float u_intensity;
  uniform vec2 u_resolution;

  void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution;
    vec2 center = u_center / u_resolution;
    float dist = distance(uv, center);
    float r = u_radius / min(u_resolution.x, u_resolution.y);

    if (dist > r) { discard; }

    vec2 d = uv - center;
    float angle = atan(d.y, d.x);
    float ring = abs(sin(dist * 60.0 - u_time * 3.0));
    float spiral = sin(angle * 3.0 + dist * 20.0 - u_time * 5.0) * 0.5 + 0.5;

    float glow = (1.0 - dist / r);
    glow = pow(glow, 0.8) * (ring * 0.3 + spiral * 0.4 + 0.3);

    vec3 col = mix(
      vec3(0.8, 0.2, 1.0),
      vec3(0.4, 0.8, 1.0),
      spiral
    );

    float alpha = glow * u_intensity;
    gl_FragColor = vec4(col, alpha * 0.85);
  }
`;

const FRAG_POISON = `
  precision mediump float;
  varying vec2 v_uv;
  uniform float u_time;
  uniform vec2 u_center;
  uniform float u_radius;
  uniform float u_intensity;
  uniform vec2 u_resolution;

  float noise(vec2 p) {
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution;
    vec2 center = u_center / u_resolution;
    float dist = distance(uv, center);
    float r = u_radius / min(u_resolution.x, u_resolution.y);

    if (dist > r) { discard; }

    float n = noise(uv * 15.0 + vec2(0.0, u_time));
    float bubble = smoothstep(0.4, 0.5, n) * smoothstep(0.6, 0.5, n);

    float fog = 1.0 - dist / r;
    fog = pow(fog, 0.6) * (0.5 + 0.5 * noise(uv * 5.0 + u_time * 0.5));

    vec3 col = mix(
      vec3(0.2, 0.5, 0.1),
      vec3(0.6, 0.1, 0.8),
      bubble + fog * 0.3
    );

    float alpha = fog * u_intensity;
    gl_FragColor = vec4(col, alpha * 0.6);
  }
`;

const FRAG_HEAL = `
  precision mediump float;
  varying vec2 v_uv;
  uniform float u_time;
  uniform vec2 u_center;
  uniform float u_radius;
  uniform float u_intensity;
  uniform vec2 u_resolution;

  void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution;
    vec2 center = u_center / u_resolution;
    float dist = distance(uv, center);
    float r = u_radius / min(u_resolution.x, u_resolution.y);

    if (dist > r) { discard; }

    float ring = abs(sin(dist * 40.0 - u_time * 4.0));
    ring = pow(ring, 8.0);

    float pulse = sin(u_time * 6.0) * 0.3 + 0.7;
    float glow = (1.0 - dist / r) * pulse;

    vec3 col = mix(
      vec3(0.2, 1.0, 0.4),
      vec3(1.0, 1.0, 0.8),
      ring
    );

    float alpha = (glow * 0.6 + ring * 0.4) * u_intensity;
    gl_FragColor = vec4(col, alpha * 0.7);
  }
`;

export class ShaderManager {
  private gl: WebGLRenderingContext | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private programs: Map<string, WebGLProgram> = new Map();
  private effects: ShaderEffect[] = [];
  private time = 0;
  private posBuffer: WebGLBuffer | null = null;

  init(container: HTMLElement): boolean {
    this.canvas = document.createElement('canvas');
    this.canvas.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;z-index:10';
    container.appendChild(this.canvas);
    this.resize();

    this.gl = this.canvas.getContext('webgl', { alpha: true, premultipliedAlpha: false });
    if (!this.gl) return false;

    this.gl.enable(this.gl.BLEND);
    this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);

    this.posBuffer = this.gl.createBuffer();
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.posBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), this.gl.STATIC_DRAW);

    this.compileProgram('fire', FRAG_FIRE);
    this.compileProgram('ice', FRAG_ICE);
    this.compileProgram('lightning', FRAG_LIGHTNING);
    this.compileProgram('magic', FRAG_MAGIC);
    this.compileProgram('poison', FRAG_POISON);
    this.compileProgram('heal', FRAG_HEAL);

    window.addEventListener('resize', () => this.resize());
    return true;
  }

  private compileProgram(name: string, fragSrc: string) {
    if (!this.gl) return;
    const vs = this.gl.createShader(this.gl.VERTEX_SHADER)!;
    this.gl.shaderSource(vs, VERT);
    this.gl.compileShader(vs);

    const fs = this.gl.createShader(this.gl.FRAGMENT_SHADER)!;
    this.gl.shaderSource(fs, fragSrc);
    this.gl.compileShader(fs);

    const prog = this.gl.createProgram()!;
    this.gl.attachShader(prog, vs);
    this.gl.attachShader(prog, fs);
    this.gl.linkProgram(prog);
    this.programs.set(name, prog);
  }

  resize() {
    if (!this.canvas) return;
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
    this.gl?.viewport(0, 0, this.canvas.width, this.canvas.height);
  }

  addEffect(e: Omit<ShaderEffect, 'life' | 'maxLife'> & { duration: number }) {
    this.effects.push({ ...e, life: e.duration, maxLife: e.duration });
  }

  update(dt: number) {
    this.time += dt;
    this.effects = this.effects.filter(e => {
      e.life -= dt;
      e.intensity = e.life / e.maxLife;
      return e.life > 0;
    });
  }

  render(camX: number, camY: number) {
    if (!this.gl || !this.canvas) return;

    this.gl.clearColor(0, 0, 0, 0);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT);

    for (const e of this.effects) {
      const prog = this.programs.get(e.type);
      if (!prog) continue;

      this.gl.useProgram(prog);

      const posLoc = this.gl.getAttribLocation(prog, 'a_position');
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.posBuffer);
      this.gl.enableVertexAttribArray(posLoc);
      this.gl.vertexAttribPointer(posLoc, 2, this.gl.FLOAT, false, 0, 0);

      const screenX = e.x - camX + this.canvas.width / 2;
      const screenY = this.canvas.height - (e.y - camY + this.canvas.height / 2);

      this.gl.uniform1f(this.gl.getUniformLocation(prog, 'u_time'), this.time);
      this.gl.uniform2f(this.gl.getUniformLocation(prog, 'u_center'), screenX, screenY);
      this.gl.uniform1f(this.gl.getUniformLocation(prog, 'u_radius'), e.radius);
      this.gl.uniform1f(this.gl.getUniformLocation(prog, 'u_intensity'), e.intensity);
      this.gl.uniform2f(this.gl.getUniformLocation(prog, 'u_resolution'), this.canvas.width, this.canvas.height);

      this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);
    }
  }

  destroy() {
    this.canvas?.remove();
    this.effects = [];
  }
}
