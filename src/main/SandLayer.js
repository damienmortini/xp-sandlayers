import GLProgram from "../../node_modules/dlib/gl/GLProgram.js";
import Matrix4 from "../../node_modules/dlib/math/Matrix4.js";
import GLMesh from "../../node_modules/dlib/gl/GLMesh.js";
import GLVertexAttribute from "../../node_modules/dlib/gl/GLVertexAttribute.js";
import GLBuffer from "../../node_modules/dlib/gl/GLBuffer.js";
import GLVertexArray from "../../node_modules/dlib/gl/GLVertexArray.js";

const GRAINS = 100000;

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

          velocity.xy += pointer.zw * .0001 * step(distance(position.xy, pointer.xy), .1);
          // velocity.xy += pointer.zw * .002 * (.2 + position.z * .8) * smoothstep(0., 1., .3 - distance(position.xy, pointer.xy));
          
          position += velocity * 10.;
          position *= sign(1. - abs(position));
          
          vec3 normal = texture(frameTexture, position.xy * .5 + .5).rgb * 2. - 1.;
          vTest.r = max(0., dot(normalize(velocity.xy), -normalize(normal.xy)));
          velocity *= .5 + vTest.r * .5;
          // vTest.xy = reflect(normalize(velocity.xy), normal.xy) * .5 + .5;
          // position.xy += vTest.xy * .0001;
          // position.z = 0.;
          // velocity *= 1. - clamp(length(frame.xy), 0., 1.) * .25;
          // velocity *= .5;
          
          // gl_Position = projectionView * transform * vec4(vec3(position.xy, position.z * .1), 1.);
          gl_Position = vec4(vec3(position.xy, position.z * .1), 1.);
          // gl_PointSize = ${devicePixelRatio} * 1.;
          gl_PointSize = 2.;
          
          // velocity *= sign(1. - abs(position));
          
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
          // if(length(gl_PointCoord * 2. - 1.) > 1.) {
            // discard;
          // }
          // vec3 color = mix(vec3(1., 1., 0.), vec3(1., 0., 1.), step(.33, vPosition.z));
          // color = mix(color, vec3(0., 1., 1.), step(.66, vPosition.z));
          // // color *= .5 + vPosition.z * .5;
          // color += length(vVelocity * 100.);
          // fragColor = vec4(color, 1.);
          // gl_FragDepth = 1. - vPosition.z;
          // fragColor = vec4(.01);
          // fragColor = vec4(1.);
          fragColor.a = .02;
          // fragColor.a = 1.;
          // fragColor.rgb = vec3(1.);
          // fragColor.gb *= 1. - vTest;
          // fragColor.rgb = texture(frameTexture, vPosition.xy * .5 + .5).rgb;
        `]
      ]
    });

    const data = new Float32Array(GRAINS * 6);
    for (let index = 0; index < GRAINS * 2; index++) {
      data[index * 6] = Math.random() * 2 - 1;
      data[index * 6 + 1] = Math.random() * 2 - 1;
      data[index * 6 + 2] = index / GRAINS;
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

  draw({ pointer, frameTexture }) {
    this.gl.enable(this.gl.BLEND);
    this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);

    this.program.use();
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