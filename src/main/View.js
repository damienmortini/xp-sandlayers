import Matrix4 from "../../node_modules/dlib/math/Matrix4.js";
import GLProgram from "../../node_modules/dlib/gl/GLProgram.js";
import GLMesh from "../../node_modules/dlib/gl/GLMesh.js";
import Camera from "../../node_modules/dlib/3d/Camera.js";
import TrackballController from "../../node_modules/dlib/3d/controllers/TrackballController.js";
import GLVertexAttribute from "../../node_modules/dlib/gl/GLVertexAttribute.js";
import GLVertexArray from "../../node_modules/dlib/gl/GLVertexArray.js";
import GLBuffer from "../../node_modules/dlib/gl/GLBuffer.js";
import GUI from "../../node_modules/dlib/gui/GUI.js";
import Pointer from "../../node_modules/dlib/input/Pointer.js";

export default class View {
  constructor({canvas} = {canvas}) {
    this.canvas = canvas;

    const webGLOptions = {
      depth: true,
      alpha: false,
      antialias: true
    };

    this.pointer = Pointer.get(this.canvas);

    if(!/\bforcewebgl1\b/.test(window.location.search)) {
      this.gl = this.canvas.getContext("webgl2", webGLOptions);
    }
    if(!this.gl) {
      this.gl = this.canvas.getContext("webgl", webGLOptions) || this.canvas.getContext("experimental-webgl", webGLOptions);
    }

    this.camera = new Camera();

    this.cameraController = new TrackballController({
      matrix: this.camera.transform,
      distance: Math.sqrt(3)
    });

    this.gl.clearColor(0, 0, 0, 1);
    this.gl.enable(this.gl.CULL_FACE);
    this.gl.enable(this.gl.DEPTH_TEST);

    this.program = new GLProgram({
      gl: this.gl,
      transformFeedbackVaryings: ["positionOut"],
      uniforms: [
        ["transform", new Matrix4()]
      ],
      vertexShaderChunks: [
        ["start", `
          uniform mat4 projectionView;
          uniform mat4 transform;
          uniform vec4 pointer;

          in vec3 position;

          out vec3 positionOut;
        `],
        ["end", `
          vec3 position = position;
          position.xy += pointer.zw * .01 * smoothstep(0., 1., .3 - distance(position.xy, pointer.xy));
          gl_Position = projectionView * transform * vec4(position, 1.);
          gl_PointSize = ${devicePixelRatio};

          positionOut = position;
        `]
      ],
      fragmentShaderChunks: [
        ["start", `
          precision highp float;
        `],
        ["end", `
          fragColor = vec4(1.);
        `]
      ]
    });

    this.mesh = new GLMesh({
      gl: this.gl,
      attributes: [
        ["position", new GLVertexAttribute({
            gl: this.gl,
            size: 3
          })
        ]
      ]
    });

    this.transformFeedback = this.gl.createTransformFeedback();
    this.gl.bindTransformFeedback(this.gl.TRANSFORM_FEEDBACK, this.transformFeedback);
  }

  resize(width, height) {
    this.camera.aspectRatio = width / height;

    width *= .5;
    height *= .5;

    width = Math.floor(width);
    height = Math.floor(height);

    const positions = new Float32Array(width * height * 3);
    for (let i = 0; i < width; i++) {
      for (let j = 0; j < height; j++) {
        const id = j * width + i;
        // positions[id * 3] = ((i / width) * 2 - 1) * this.camera.aspectRatio;
        // positions[id * 3 + 1] = (j / height) * 2 - 1;
        positions[id * 3] = (Math.random() * 2 - 1) * this.camera.aspectRatio;
        positions[id * 3 + 1] = (Math.random() * 2 - 1);
      }
    }

    this.transformFeedbackBuffer1 = new GLBuffer({
      gl: this.gl,
      data: positions,
      usage: this.gl.DYNAMIC_COPY
    });

    this.transformFeedbackBuffer2 = new GLBuffer({
      gl: this.gl,
      data: positions,
      usage: this.gl.DYNAMIC_COPY
    });

    this.update();
  }
 
  update() {
    this.gl.viewport(0, 0, this.gl.drawingBufferWidth, this.gl.drawingBufferHeight);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);

    this.cameraController.update();
    
    this.program.use();
    this.program.uniforms.set("projectionView", this.camera.projectionView);
    this.program.uniforms.set("pointer", [
      this.pointer.normalizedCenteredFlippedY.x * this.camera.aspectRatio, 
      this.pointer.normalizedCenteredFlippedY.y, 
      this.pointer.velocity.x, 
      -this.pointer.velocity.y
    ]);
    
    this.mesh.attributes.get("position").buffer = this.transformFeedbackBuffer1;    
    this.program.attributes.set(this.mesh.attributes);

    this.transformFeedbackBuffer2.bind({
      target: this.gl.TRANSFORM_FEEDBACK_BUFFER,
      index: 0
    });
    
    this.gl.beginTransformFeedback(this.gl.POINTS);
    this.mesh.draw({
      mode: this.gl.POINTS
    });
    this.gl.endTransformFeedback();
    
    this.transformFeedbackBuffer2.unbind({
      target: this.gl.TRANSFORM_FEEDBACK_BUFFER,
      index: 0
    });

    [this.transformFeedbackBuffer1, this.transformFeedbackBuffer2] = [this.transformFeedbackBuffer2, this.transformFeedbackBuffer1];
  }
}
