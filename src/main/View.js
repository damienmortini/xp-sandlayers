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

const GRAINS = 500000;

export default class View {
  constructor({canvas} = {canvas}) {
    this.canvas = canvas;

    const webGLOptions = {
      depth: true,
      alpha: false,
      // antialias: true
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
      distance: Math.sqrt(3),
      enabled: false
    });

    this.gl.clearColor(.8, .8, .8, 1);
    this.gl.enable(this.gl.CULL_FACE);
    this.gl.enable(this.gl.DEPTH_TEST);

    this.program = new GLProgram({
      gl: this.gl,
      transformFeedbackVaryings: ["vPosition", "vVelocity"],
      uniforms: [
        ["transform", new Matrix4()]
      ],
      vertexShaderChunks: [
        ["start", `
          uniform mat4 projectionView;
          uniform mat4 transform;
          uniform vec4 pointer;
          uniform float aspectRatio;

          in vec3 position;
          in vec3 velocity;

          out vec3 vPosition;
          out vec3 vVelocity;
        `],
        ["end", `
          vec3 position = position;
          vec3 velocity = velocity;
          vec4 pointer = pointer;

          position.x *= aspectRatio;
          pointer.x *= aspectRatio;
          
          velocity.xy += pointer.zw * .002 * (.2 + position.z * .8) * smoothstep(0., 1., .3 - distance(position.xy, pointer.xy));
          velocity *= .95;
          
          position += velocity;
          
          gl_Position = projectionView * transform * vec4(vec3(position.xy, position.z * .1), 1.);
          // gl_PointSize = ${devicePixelRatio} * 5.;
          gl_PointSize = 2.;
          
          position.x /= aspectRatio;
          velocity *= sign(1. - abs(position));
          
          vPosition = position;
          vVelocity = velocity;
        `]
      ],
      fragmentShaderChunks: [
        ["start", `
          precision highp float;

          in vec3 vVelocity;
          in vec3 vPosition;
        `],
        ["end", `
          if(length(gl_PointCoord * 2. - 1.) > 1.) {
            discard;
          }
          vec3 color = mix(vec3(1., 1., 0.), vec3(1., 0., 1.), step(.33, vPosition.z));
          color = mix(color, vec3(0., 1., 1.), step(.66, vPosition.z));
          // color *= .5 + vPosition.z * .5;
          color += length(vVelocity * 100.);
          fragColor = vec4(color, 1.);
          gl_FragDepth = 1. - vPosition.z;
        `]
      ]
    });

    this.mesh = new GLMesh({
      gl: this.gl,
      attributes: [
        ["position", new GLVertexAttribute({
            gl: this.gl,
            size: 3,
            stride: 24
          })
        ],
        ["velocity", new GLVertexAttribute({
            gl: this.gl,
            size: 3,
            stride: 24,
            offset: 12
          })
        ]
      ]
    });

    const data = new Float32Array(GRAINS * 6);
    for (let index = 0; index < GRAINS * 2; index++) {
      data[index * 6] = (Math.random() * 2 - 1) * this.camera.aspectRatio;
      data[index * 6 + 1] = (Math.random() * 2 - 1);
      data[index * 6 + 2] = Math.random();
    }

    this.transformFeedbackBuffer1 = new GLBuffer({
      gl: this.gl,
      data: data,
      usage: this.gl.DYNAMIC_COPY
    });

    this.transformFeedbackBuffer2 = new GLBuffer({
      gl: this.gl,
      data: data,
      usage: this.gl.DYNAMIC_COPY
    });

    this.transformFeedback = this.gl.createTransformFeedback();
    this.gl.bindTransformFeedback(this.gl.TRANSFORM_FEEDBACK, this.transformFeedback);
  }

  resize(width, height) {
    this.camera.aspectRatio = width / height;

    this.program.use();
    this.program.uniforms.set("aspectRatio", this.camera.aspectRatio);

    this.update();
  }
 
  update() {
    this.gl.viewport(0, 0, this.gl.drawingBufferWidth, this.gl.drawingBufferHeight);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);

    this.cameraController.update();
    
    this.program.use();
    this.program.uniforms.set("projectionView", this.camera.projectionView);
    this.program.uniforms.set("pointer", [
      this.pointer.normalizedCenteredFlippedY.x, 
      this.pointer.normalizedCenteredFlippedY.y, 
      this.pointer.velocity.x, 
      -this.pointer.velocity.y
    ]);
    
    this.mesh.attributes.get("position").buffer = this.transformFeedbackBuffer1;    
    this.mesh.attributes.get("velocity").buffer = this.transformFeedbackBuffer1;    
    this.program.attributes.set(this.mesh.attributes);

    this.transformFeedbackBuffer2.bind({
      target: this.gl.TRANSFORM_FEEDBACK_BUFFER,
      index: 0
    });
    
    this.gl.beginTransformFeedback(this.gl.POINTS);
    this.mesh.draw({
      mode: this.gl.POINTS,
      count: GRAINS
    });
    this.gl.endTransformFeedback();
    
    this.transformFeedbackBuffer2.unbind({
      target: this.gl.TRANSFORM_FEEDBACK_BUFFER,
      index: 0
    });

    [this.transformFeedbackBuffer1, this.transformFeedbackBuffer2] = [this.transformFeedbackBuffer2, this.transformFeedbackBuffer1];
  }
}
