import GLProgram from "../../node_modules/dlib/gl/GLProgram.js";
import Matrix4 from "../../node_modules/dlib/math/Matrix4.js";
import Vector2 from "../../node_modules/dlib/math/Vector2.js";
import NoiseShader from "../../node_modules/dlib/shaders/NoiseShader.js";
import GLMesh from "../../node_modules/dlib/gl/GLMesh.js";
import GLVertexAttribute from "../../node_modules/dlib/gl/GLVertexAttribute.js";
import GLBuffer from "../../node_modules/dlib/gl/GLBuffer.js";
import GLVertexArray from "../../node_modules/dlib/gl/GLVertexArray.js";
import GUI from "../../node_modules/dlib/gui/GUI.js";
import Ticker from "../../node_modules/dlib/utils/Ticker.js";

const SAND_GRAINS_NUMBER = GUI.add({
  object: {value: 500000},
  key: "value",
  label: "Sand grains number",
  reload: true,
  options: [
    100000,
    500000,
    1000000
  ]
}).value;

export default class SandLayer {
  constructor({ gl }) {
    this.gl = gl;

    this._matrix4 = new Matrix4();

    this.useCameraTransform = false;
    GUI.add({
      object: this,
      key: "useCameraTransform"
    });
    
    this.wind = new Vector2();
    GUI.add({
      object: this.wind,
      key: "x",
      min: -1,
      type: "range"
    });
    GUI.add({
      object: this.wind,
      key: "y",
      min: -1,
      type: "range"
    });

    this.needsPointerDown = false;
    GUI.add({
      object: this,
      key: "needsPointerDown"
    });

    this.pointSize = 1.;
    GUI.add({
      object: this,
      key: "pointSize",
      type: "range",
      max: 5
    });

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
          uniform vec2 globalWind;
          uniform bool use3Dphysic;
          uniform float time;
          uniform float pointSize;
          uniform sampler2D frameTexture;

          in vec3 position;
          in vec3 velocity;

          out vec3 vPosition;
          out vec3 vVelocity;
          out vec4 vTest;

          ${NoiseShader.random()}
        `],
        ["end", `
          vec3 position = position;
          vec3 velocity = velocity;
          vec4 pointer = pointer;

          velocity.xy += globalWind * .01;

          // velocity.xy += pointer.zw * .001 * step(distance(position.xy, pointer.xy), .1);
          velocity.xy += pointer.zw * .02 * smoothstep(0., 1., .2 - distance(position.xy, pointer.xy));
          
          position.xy += velocity.xy;
          position *= sign(1. - abs(position));
          // position = clamp(position, vec3(-1.), vec3(1.));
          // position.z = max(position.z, .1);
          
          vec4 bump = texture(frameTexture, position.xy * .5 + .5);

          float height = bump.w;
          if(length(velocity.xy) > .001) {
            position.z = height + .1;
          }
          vec3 normal = bump.rgb * 2. - 1.;
          
          if(use3Dphysic) {
            velocity = reflect(velocity, normal);
            velocity *= 1. - max(0., dot(normalize(velocity), normal));
          } else {
            velocity = velocity * (1. - min(length(normal.xy), 1.));
          }
          // velocity.z = max(-.01, velocity.z - .01);

          // vec3 newPosition = vec3(random(position.x * .001) * 2. - 1., random(position.y * .001) * 2. - 1., 0.);
          // if(abs(position.x) > 1. || abs(position.y) > 1.) {
          //   position = newPosition;
          // }

          gl_Position = projectionView * transform * vec4(position * vec3(1., 1., .05), 1.);
          gl_PointSize = pointSize;
          
          vPosition = position;
          vVelocity = velocity;
        `]
      ],
      fragmentShaderChunks: [
        ["start", `
          precision highp float;

          uniform sampler2D frameTexture;
          uniform float opacity;

          in vec3 vVelocity;
          in vec3 vPosition;
          in vec4 vTest;
        `],
        ["end", `
          fragColor.a = opacity;
          fragColor.a = 1.;
          fragColor.rgb = vec3(vPosition.z);
          gl_FragDepth = -vPosition.z;
        `]
      ]
    });

    const data = new Float32Array(SAND_GRAINS_NUMBER * 6);
    for (let index = 0; index < SAND_GRAINS_NUMBER * 2; index++) {
      data[index * 6] = Math.random() * 2 - 1;
      data[index * 6 + 1] = Math.random() * 2 - 1;
      // data[index * 6 + 2] = index / SAND_GRAINS_NUMBER;
    }

    this.transformFeedbackBuffer1 = new GLBuffer({
      gl: this.gl,
      data: data,
      usage: this.gl.DYNAMIC_COPY
    });    
    this.transformFeedbackBuffer2 = new GLBuffer(this.transformFeedbackBuffer1);

    this.mesh = new GLMesh({
      gl: this.gl,
      attributes: [
        ["position", new GLVertexAttribute({
          gl: this.gl,
          size: 3,
          buffer: this.transformFeedbackBuffer1,
          data,
          stride: 24
        })
        ],
        ["velocity", new GLVertexAttribute({
          gl: this.gl,
          size: 3,
          buffer: this.transformFeedbackBuffer1,
          data,
          stride: 24,
          offset: 12
        })
        ]
      ]
    });

    this.transformFeedback = this.gl.createTransformFeedback();

    this.vao1 = new GLVertexArray({
      gl: this.gl,
      mesh: this.mesh,
      program: this.program
    });

    this.mesh.attributes.get("position").buffer = this.transformFeedbackBuffer2;
    this.mesh.attributes.get("velocity").buffer = this.transformFeedbackBuffer2;

    this.vao2 = new GLVertexArray({
      gl: this.gl,
      mesh: this.mesh,
      program: this.program
    });

    GUI.add({
      object: {value: false},
      key: "value",
      label: "Use 3D physic",
      onChange: (value) => {
        this.program.use();
        this.program.uniforms.set("use3Dphysic", value)
      }
    });

    GUI.add({
      object: {value: .02},
      key: "value",
      label: "Opacity",
      type: "range",
      onChange: (value) => {
        this.program.use();
        this.program.uniforms.set("opacity", value)
      }
    });
  }

  draw({ pointer, frameTexture, camera, pointSize = 1, useCamera = true }) {
    this.gl.enable(this.gl.DEPTH_TEST);
    // this.gl.enable(this.gl.BLEND);
    // this.gl.blendColor(0, 0, 0, 1);
    // this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);

    this.program.use();
    if(!useCamera || this.useCameraTransform) {
      this.program.uniforms.set("projectionView", camera.projectionView);
    } else {
      this.program.uniforms.set("projectionView", this._matrix4);
    }
    
    this.program.uniforms.set("time", Ticker.time);
    this.program.uniforms.set("pointSize", pointSize * this.pointSize);
    this.program.uniforms.set("globalWind", this.wind);
    this.program.uniforms.set("pointer", [
      pointer.normalizedCenteredFlippedY.x,
      pointer.normalizedCenteredFlippedY.y,
      pointer.velocity.x * (!this.needsPointerDown || pointer.downed ? 1 : 0),
      -pointer.velocity.y * (!this.needsPointerDown || pointer.downed ? 1 : 0)
    ]);
    
    this.vao1.bind();
    
    this.gl.bindTransformFeedback(this.gl.TRANSFORM_FEEDBACK, this.transformFeedback);
    this.transformFeedbackBuffer2.bind({
      target: this.gl.TRANSFORM_FEEDBACK_BUFFER,
      index: 0
    });
    frameTexture.bind();
    this.gl.beginTransformFeedback(this.gl.POINTS);
    this.mesh.draw({
      mode: this.gl.POINTS,
      count: SAND_GRAINS_NUMBER
    });
    this.gl.endTransformFeedback();
    frameTexture.unbind();
    this.transformFeedbackBuffer2.unbind({
      target: this.gl.TRANSFORM_FEEDBACK_BUFFER,
      index: 0
    });
    this.gl.bindTransformFeedback(this.gl.TRANSFORM_FEEDBACK, null);

    this.vao1.unbind();

    [this.transformFeedbackBuffer1, this.transformFeedbackBuffer2] = [this.transformFeedbackBuffer2, this.transformFeedbackBuffer1];
    [this.vao1, this.vao2] = [this.vao2, this.vao1];

    this.gl.disable(this.gl.BLEND);
  }
}