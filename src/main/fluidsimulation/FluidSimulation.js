import GLPlaneObject from "../../../node_modules/dlib/gl/objects/GLPlaneObject.js";
import GLMesh from "../../../node_modules/dlib/gl/GLMesh.js";
import PlaneMesh from "../../../node_modules/dlib/3d/PlaneMesh.js";
import GLTexture from "../../../node_modules/dlib/gl/GLTexture.js";
import GLFrameBuffer from "../../../node_modules/dlib/gl/GLFrameBuffer.js";

export default class FluidSimulation {
  constructor({
    gl,
    resolution = [512, 512]
  }) {
    this.quad = new GLPlaneObject({
      gl,
      width: 1, 
      height: 1,
      normals: null
    });

    this.frameBuffer1 = new GLFrameBuffer({
      gl,
      colorTextures: [new GLTexture({
        gl,
        width: resolution[0],
        height: resolution[1],
        minFilter: gl.LINEAR
      })]
    });

    this.frameBuffer2 = this.frameBuffer1.clone();
  }

  draw() {
    this.quad.draw();
  }
}