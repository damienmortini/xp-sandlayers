import GLProgram from "../../node_modules/dlib/gl/GLProgram.js";
import Matrix4 from "../../node_modules/dlib/math/Matrix4.js";
import GLMesh from "../../node_modules/dlib/gl/GLMesh.js";
import GLVertexAttribute from "../../node_modules/dlib/gl/GLVertexAttribute.js";
import GLBuffer from "../../node_modules/dlib/gl/GLBuffer.js";
import GLVertexArray from "../../node_modules/dlib/gl/GLVertexArray.js";

const GRAINS = 500000;

export default class SandLayer {
  constructor({ gl }) {
    this.gl = gl;

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
          uniform sampler2D frameTexture;

          in vec3 position;
          in vec3 velocity;

          out vec3 vPosition;
          out vec3 vVelocity;
          out vec4 vTest;
        `],
        ["end", `
          vec3 position = position;
          vec3 velocity = velocity;
          vec4 pointer = pointer;

          // velocity.xy += pointer.zw * .0001 * step(distance(position.xy, pointer.xy), .1);
          velocity.xy += pointer.zw * .01 * smoothstep(0., 1., .2 - distance(position.xy, pointer.xy));
          
          position += velocity;
          position *= sign(1. - abs(position));
          position.z -= .1;
          position.z = max(position.z, 0.);
          
          vec3 normal = texture(frameTexture, position.xy * .5 + .5).rgb * 2. - 1.;
          velocity = reflect(velocity, normal);
          velocity *= 1. - max(0., dot(normalize(velocity), normal));
          
          gl_Position = projectionView * transform * vec4(position, 1.);
          gl_PointSize = 1.;
          
          vPosition = position;
          vVelocity = velocity;
        `]
      ],
      fragmentShaderChunks: [
        ["start", `
          precision highp float;

          uniform sampler2D frameTexture;

          in vec3 vVelocity;
          in vec3 vPosition;
          in vec4 vTest;
        `],
        ["end", `
          fragColor.a = .02;
        `]
      ]
    });

    const data = new Float32Array(GRAINS * 6);
    for (let index = 0; index < GRAINS * 2; index++) {
      data[index * 6] = Math.random() * 2 - 1;
      data[index * 6 + 1] = Math.random() * 2 - 1;
      // data[index * 6 + 2] = index / GRAINS;
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
  }

  draw({ pointer, frameTexture, camera }) {
    this.gl.enable(this.gl.BLEND);
    this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);

    this.program.use();
    // this.program.uniforms.set("projectionView", camera.projectionView);
    this.program.uniforms.set("pointer", [
      pointer.normalizedCenteredFlippedY.x,
      pointer.normalizedCenteredFlippedY.y,
      pointer.velocity.x,
      -pointer.velocity.y
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
      count: GRAINS
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