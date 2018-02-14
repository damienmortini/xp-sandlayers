import Matrix4 from "../../node_modules/dlib/math/Matrix4.js";
import GLProgram from "../../node_modules/dlib/gl/GLProgram.js";
import GLMesh from "../../node_modules/dlib/gl/GLMesh.js";
import Camera from "../../node_modules/dlib/3d/Camera.js";
import TrackballController from "../../node_modules/dlib/3d/controllers/TrackballController.js";
import GLVertexAttribute from "../../node_modules/dlib/gl/GLVertexAttribute.js";
import GLVertexArray from "../../node_modules/dlib/gl/GLVertexArray.js";
import GLBuffer from "../../node_modules/dlib/gl/GLBuffer.js";
import GLFrameBuffer from "../../node_modules/dlib/gl/GLFrameBuffer.js";
import GLTexture from "../../node_modules/dlib/gl/GLTexture.js";
import PlaneMesh from "../../node_modules/dlib/3d/PlaneMesh.js";
import GUI from "../../node_modules/dlib/gui/GUI.js";
import DepthShader from "../../node_modules/dlib/shaders/DepthShader.js";
import Pointer from "../../node_modules/dlib/input/Pointer.js";
import SandLayer from "./SandLayer.js";

const DEPTH_FRAME_BUFFER_SIZE = 1024;

export default class View {
  constructor({ canvas } = { canvas }) {
    this.canvas = canvas;

    const webGLOptions = {
      depth: true,
      alpha: false,
      // antialias: true
    };

    this.pointer = Pointer.get(this.canvas);

    if (!/\bforcewebgl1\b/.test(window.location.search)) {
      this.gl = this.canvas.getContext("webgl2", webGLOptions);
    }
    if (!this.gl) {
      this.gl = this.canvas.getContext("webgl", webGLOptions) || this.canvas.getContext("experimental-webgl", webGLOptions);
    }

    this.camera = new Camera();

    this.cameraController = new TrackballController({
      matrix: this.camera.transform,
      distance: Math.sqrt(3),
      // enabled: false
    });

    this.gl.clearColor(0, 0, 0, 1);
    // this.gl.enable(this.gl.CULL_FACE);
    // this.gl.enable(this.gl.DEPTH_TEST);

    this.depthFrameBuffer = new GLFrameBuffer({
      gl: this.gl
    });
    this.depthFrameBuffer.attach({
      texture: new GLTexture({
        gl: this.gl,
        width: DEPTH_FRAME_BUFFER_SIZE,
        height: DEPTH_FRAME_BUFFER_SIZE,
        minFilter: this.gl.LINEAR
      })
    })

    this.sandLayer = new SandLayer({
      gl: this.gl
    });

    this.plane = new GLMesh({
      gl: this.gl,
      attributes: [
        ["position", new GLVertexAttribute({
          gl: this.gl,
          data: new PlaneMesh({
            width: 2,
            height: 2
          }).positions,
          size: 3
        })]
      ]
    });

    this.program = new GLProgram({
      gl: this.gl,
      vertexShaderChunks: [
        ["start", `
          in vec3 position;
          out vec3 vPosition;
        `],
        ["end", `
          vPosition = position;
          gl_Position = vec4(position, 1.);
        `]
      ],
      fragmentShaderChunks: [
        ["start", `
          precision highp float;

          uniform sampler2D sandDepthTexture;

          in vec3 vPosition;

          ${DepthShader.bumpFromDepth()}
        `],
        ["end", `
          vec2 uv = vPosition.xy * .5 + .5;
          // fragColor = texture(sandDepthTexture, uv);
          vec4 bump = bumpFromDepth(sandDepthTexture, uv, vec2(1024.), 1.);

          vec3 color = vec3(1., .5, .5);
          color += max(0., dot(vec3(1.), bump.xyz)) * .2;

          // color = bump.xyz;

          fragColor = vec4(color, 1.);
        `]
      ]
    });

    this.planeVao = new GLVertexArray({
      gl: this.gl, 
      mesh: this.plane,
      program: this.program
    });
    this.planeVao.bind();
    this.depthFrameBuffer.colorTextures[0].bind();    
    this.planeVao.unbind();
  }

  resize(width, height) {
    this.camera.aspectRatio = width / height;

    this.update();
  }

  update() {
    this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);

    this.cameraController.update();

    this.depthFrameBuffer.bind();
    this.gl.viewport(0, 0, DEPTH_FRAME_BUFFER_SIZE, DEPTH_FRAME_BUFFER_SIZE);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);
    this.sandLayer.draw({
      camera: this.camera,
      pointer: this.pointer
    });
    this.depthFrameBuffer.unbind();
    
    this.gl.viewport(0, 0, this.gl.drawingBufferWidth, this.gl.drawingBufferHeight);
    this.program.use();
    this.planeVao.bind();
    this.plane.attributes.get("position").buffer.bind();
    this.plane.draw({
      mode: this.gl.TRIANGLE_STRIP
    });
  }
}
