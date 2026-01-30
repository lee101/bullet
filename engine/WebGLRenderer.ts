/**
 * WebGL Sprite Batch Renderer for high-performance 2D rendering
 * Uses instanced rendering and texture atlases for minimal draw calls
 */

const VERTEX_SHADER = `#version 300 es
precision highp float;

layout(location = 0) in vec2 a_position;
layout(location = 1) in vec2 a_texcoord;

// Per-instance attributes
layout(location = 2) in vec4 a_transform; // x, y, scaleX, scaleY
layout(location = 3) in vec4 a_texRegion; // u, v, width, height
layout(location = 4) in vec4 a_color;     // r, g, b, a
layout(location = 5) in float a_rotation;

uniform mat4 u_projection;

out vec2 v_texcoord;
out vec4 v_color;

void main() {
  float c = cos(a_rotation);
  float s = sin(a_rotation);
  mat2 rot = mat2(c, s, -s, c);

  vec2 scaled = a_position * a_transform.zw;
  vec2 rotated = rot * scaled;
  vec2 pos = rotated + a_transform.xy;

  gl_Position = u_projection * vec4(pos, 0.0, 1.0);
  v_texcoord = a_texRegion.xy + a_texcoord * a_texRegion.zw;
  v_color = a_color;
}`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec2 v_texcoord;
in vec4 v_color;

uniform sampler2D u_texture;

out vec4 fragColor;

void main() {
  vec4 tex = texture(u_texture, v_texcoord);
  fragColor = tex * v_color;
  if (fragColor.a < 0.01) discard;
}`;

interface Sprite {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  u: number;
  v: number;
  uw: number;
  vh: number;
  r: number;
  g: number;
  b: number;
  a: number;
}

export class WebGLRenderer {
  private gl: WebGL2RenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private quadBuffer: WebGLBuffer | null = null;
  private instanceBuffer: WebGLBuffer | null = null;
  private projectionLoc: WebGLUniformLocation | null = null;
  private textureLoc: WebGLUniformLocation | null = null;
  private textures: Map<string, WebGLTexture> = new Map();

  private instanceData: Float32Array;
  private spriteCount = 0;
  private maxSprites: number;
  private width = 0;
  private height = 0;
  private initialized = false;

  constructor(maxSprites = 10000) {
    this.maxSprites = maxSprites;
    // 13 floats per sprite: x,y,sx,sy, u,v,uw,vh, r,g,b,a, rotation
    this.instanceData = new Float32Array(maxSprites * 13);
  }

  init(canvas: HTMLCanvasElement): boolean {
    const gl = canvas.getContext('webgl2', {
      alpha: true,
      antialias: false,
      premultipliedAlpha: true,
      preserveDrawingBuffer: false,
      powerPreference: 'high-performance'
    });

    if (!gl) {
      console.warn('WebGL2 not available, falling back to Canvas 2D');
      return false;
    }

    this.gl = gl;
    this.width = canvas.width;
    this.height = canvas.height;

    // Compile shaders
    const vs = this.compileShader(gl.VERTEX_SHADER, VERTEX_SHADER);
    const fs = this.compileShader(gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    if (!vs || !fs) return false;

    this.program = gl.createProgram()!;
    gl.attachShader(this.program, vs);
    gl.attachShader(this.program, fs);
    gl.linkProgram(this.program);

    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
      console.error('Shader link error:', gl.getProgramInfoLog(this.program));
      return false;
    }

    this.projectionLoc = gl.getUniformLocation(this.program, 'u_projection');
    this.textureLoc = gl.getUniformLocation(this.program, 'u_texture');

    // Create VAO
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);

    // Quad vertices (unit square)
    const quadVerts = new Float32Array([
      -0.5, -0.5, 0, 0,
       0.5, -0.5, 1, 0,
       0.5,  0.5, 1, 1,
      -0.5, -0.5, 0, 0,
       0.5,  0.5, 1, 1,
      -0.5,  0.5, 0, 1,
    ]);

    this.quadBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, quadVerts, gl.STATIC_DRAW);

    // Position attribute
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0);
    // Texcoord attribute
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 8);

    // Instance buffer
    this.instanceBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.instanceData.byteLength, gl.DYNAMIC_DRAW);

    const stride = 13 * 4; // 13 floats * 4 bytes
    // Transform (x, y, scaleX, scaleY)
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 4, gl.FLOAT, false, stride, 0);
    gl.vertexAttribDivisor(2, 1);
    // TexRegion (u, v, width, height)
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 4, gl.FLOAT, false, stride, 16);
    gl.vertexAttribDivisor(3, 1);
    // Color (r, g, b, a)
    gl.enableVertexAttribArray(4);
    gl.vertexAttribPointer(4, 4, gl.FLOAT, false, stride, 32);
    gl.vertexAttribDivisor(4, 1);
    // Rotation
    gl.enableVertexAttribArray(5);
    gl.vertexAttribPointer(5, 1, gl.FLOAT, false, stride, 48);
    gl.vertexAttribDivisor(5, 1);

    gl.bindVertexArray(null);

    // Enable blending
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    this.initialized = true;
    console.log('WebGL renderer initialized');
    return true;
  }

  private compileShader(type: number, source: string): WebGLShader | null {
    const gl = this.gl!;
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error('Shader compile error:', gl.getShaderInfoLog(shader));
      return null;
    }
    return shader;
  }

  loadTexture(id: string, image: HTMLImageElement): void {
    if (!this.gl || this.textures.has(id)) return;
    const gl = this.gl;

    const texture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    this.textures.set(id, texture);
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    if (this.gl) {
      this.gl.viewport(0, 0, width, height);
    }
  }

  begin(cameraX: number, cameraY: number): void {
    this.spriteCount = 0;
    if (!this.gl) return;

    const gl = this.gl;
    gl.viewport(0, 0, this.width, this.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);

    // Orthographic projection with camera offset
    const proj = new Float32Array([
      2 / this.width, 0, 0, 0,
      0, -2 / this.height, 0, 0,
      0, 0, -1, 0,
      -1 - (cameraX * 2 / this.width), 1 + (cameraY * 2 / this.height), 0, 1
    ]);
    gl.uniformMatrix4fv(this.projectionLoc, false, proj);
    gl.uniform1i(this.textureLoc, 0);
  }

  drawSprite(
    x: number, y: number,
    width: number, height: number,
    rotation = 0,
    u = 0, v = 0, uw = 1, vh = 1,
    r = 1, g = 1, b = 1, a = 1
  ): void {
    if (this.spriteCount >= this.maxSprites) return;

    const i = this.spriteCount * 13;
    this.instanceData[i + 0] = x;
    this.instanceData[i + 1] = y;
    this.instanceData[i + 2] = width;
    this.instanceData[i + 3] = height;
    this.instanceData[i + 4] = u;
    this.instanceData[i + 5] = v;
    this.instanceData[i + 6] = uw;
    this.instanceData[i + 7] = vh;
    this.instanceData[i + 8] = r;
    this.instanceData[i + 9] = g;
    this.instanceData[i + 10] = b;
    this.instanceData[i + 11] = a;
    this.instanceData[i + 12] = rotation;

    this.spriteCount++;
  }

  flush(textureId: string): void {
    if (!this.gl || this.spriteCount === 0) return;

    const gl = this.gl;
    const texture = this.textures.get(textureId);
    if (!texture) return;

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.instanceData.subarray(0, this.spriteCount * 13));

    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, this.spriteCount);
    this.spriteCount = 0;
  }

  end(): void {
    if (this.gl) {
      this.gl.bindVertexArray(null);
    }
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  destroy(): void {
    if (!this.gl) return;
    const gl = this.gl;

    this.textures.forEach(tex => gl.deleteTexture(tex));
    this.textures.clear();

    if (this.program) gl.deleteProgram(this.program);
    if (this.vao) gl.deleteVertexArray(this.vao);
    if (this.quadBuffer) gl.deleteBuffer(this.quadBuffer);
    if (this.instanceBuffer) gl.deleteBuffer(this.instanceBuffer);

    this.gl = null;
    this.initialized = false;
  }
}

export const webglRenderer = new WebGLRenderer();
