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
import SandLayerProcessing from "./SandLayerProcessing.js";
import FluidSimulation from "./fluidsimulation/FluidSimulation.js";

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

    this.sandLayerProcessing = new SandLayerProcessing({
      gl: this.gl
    });

    this.fluidSimulation = new FluidSimulation({
      gl: this.gl
    });
  }

  resize(width, height) {
    // this.camera.aspectRatio = width / height;

    this.update();
  }

  update() {
    this.gl.viewport(0, 0, this.gl.drawingBufferWidth, this.gl.drawingBufferHeight);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);

    this.cameraController.update();

    // this.sandLayerProcessing.draw({
    //   pointer: this.pointer,
    //   camera: this.camera
    // });

    this.fluidSimulation.draw();
  }
}
