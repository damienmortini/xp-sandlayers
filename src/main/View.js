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
import GLPlaneObject from "../../node_modules/dlib/gl/GLPlaneObject.js";
import Pointer from "../../node_modules/dlib/input/Pointer.js";
import SandLayer from "./SandLayer.js";
import SandLayerProcessing from "./SandLayerProcessing.js";

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

    this.quad = new GLPlaneObject({
      gl: this.gl,
      transform: null,
      width: 2,
      height: 2,
      normals: null,
      uvs: null
    });

    this.sandLayerProcessing = new SandLayerProcessing({
      gl: this.gl
    });

    // this.quad = new GLMesh({
    //   gl: this.gl,
    //   attributes: [
    //     ["position", new GLVertexAttribute({
    //       gl: this.gl,
    //       data: new PlaneMesh({
    //         width: 2,
    //         height: 2
    //       }).positions,
    //       size: 3
    //     })]
    //   ]
    // });

    // this.program = new GLProgram({
    //   gl: this.gl,
    //   vertexShaderChunks: [
    //     ["start", `
    //       in vec3 position;
    //       out vec3 vPosition;
    //     `],
    //     ["end", `
    //       vPosition = position;
    //       gl_Position = vec4(position, 1.);
    //     `]
    //   ],
    //   fragmentShaderChunks: [
    //     ["start", `
    //       precision highp float;

    //       uniform sampler2D frameBufferTexture;

    //       in vec3 vPosition;
    //     `],
    //     ["end", `
    //       vec2 uv = vPosition.xy * .5 + .5;
    //       fragColor = texture(frameBufferTexture, uv);
    //     `]
    //   ]
    // });
  }

  resize(width, height) {
    // this.camera.aspectRatio = width / height;

    this.update();
  }

  update() {
    this.gl.viewport(0, 0, this.gl.drawingBufferWidth, this.gl.drawingBufferHeight);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);

    this.cameraController.update();

    // this.quad.draw({
    //   // camera: this.camera
    // });

    this.sandLayerProcessing.draw({
      pointer: this.pointer,
      camera: this.camera
    });
  }
}
