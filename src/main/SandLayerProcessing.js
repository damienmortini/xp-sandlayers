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
import GLObject from "../../node_modules/dlib/gl/GLObject.js";
import BasicShader from "../../node_modules/dlib/shaders/BasicShader.js";
import BlurShader from "../../node_modules/dlib/shaders/BlurShader.js";

const FRAME_BUFFER_SIZE = GUI.add({
  object: {value: 512},
  key: "value",
  label: "Frame Buffer Size",
  options: [
    256,
    512,
    1024,
    2048
  ],
  reload: true
}).value;

export default class SandLayerProcessing {
  constructor({ gl }) {
    this.gl = gl;

    this.blurDistance = .25;
    GUI.add({
      object: this,
      key: "blurDistance",
      type: "range" 
    });

    this.displayMap = "default";
    GUI.add({
      object: this,
      key: "displayMap",
      options: [
        "default",
        "bump",
        "height"
      ]
    });

    this.displayPoints = false;
    GUI.add({
      object: this,
      key: "displayPoints"
    });

    this.mainFrameBuffer = new GLFrameBuffer({
      gl: this.gl
    });
    this.mainFrameBuffer.attach({
      texture: new GLTexture({
        gl: this.gl,
        width: FRAME_BUFFER_SIZE,
        height: FRAME_BUFFER_SIZE,
        minFilter: this.gl.LINEAR
      })
    });

    this.blurFrameBuffer1 = new GLFrameBuffer({
      gl: this.gl
    });
    this.blurFrameBuffer1.attach({
      texture: new GLTexture(this.mainFrameBuffer.colorTextures[0])
    });

    this.blurFrameBuffer2 = new GLFrameBuffer({
      gl: this.gl
    });
    this.blurFrameBuffer2.attach({
      texture: new GLTexture(this.mainFrameBuffer.colorTextures[0])
    });

    this.bumpFrameBuffer = new GLFrameBuffer({
      gl: this.gl
    });
    this.blurFrameBuffer2.attach({
      texture: new GLTexture(this.mainFrameBuffer.colorTextures[0])
    });

    this.sandLayer = new SandLayer({
      gl: this.gl
    });

    const quad = new GLMesh(Object.assign({
      gl
    }, new PlaneMesh({
      width: 2, 
      height: 2,
      normals: null
    })));

    this.sandPass = new GLObject({
      gl,
      mesh: quad,
      program: new GLProgram({
        gl,
        shaders: [
          new BasicShader({
            normals: false
          }),
          {
            uniforms: [
              ["frameTexture", this.mainFrameBuffer.colorTextures[0]],
              ["intensity", 1]              
            ],
            fragmentShaderChunks: [
              ["start", `
                uniform sampler2D frameTexture;
                uniform float intensity;
                uniform float basic;
                uniform float heightOnly;
                uniform vec3 colors[3];
              `
              ],
              ["end", `
                vec2 uv = vPosition.xy * .5 + .5;

                vec4 frameTexel = texture(frameTexture, uv);
                
                fragColor = frameTexel;
                fragColor.a = 1.;
                fragColor.rgb = mix(vec3(1., 1., 0.), vec3(0., 1., 1.), smoothstep(.4, .6, frameTexel.w));
                fragColor.rgb = mix(vec3(1., 0., 1.), fragColor.rgb, smoothstep(0., .2, frameTexel.w));

                vec3 normal = frameTexel.rgb * 2. - 1.;

                fragColor.rgb *= .8 + dot(normalize(vec3(1.)), normal) * .2;

                fragColor = mix(fragColor, mix(vec4(frameTexel.rgb * .5 + .5, frameTexel.w), vec4(vec3(frameTexel.w), 1.), heightOnly) * intensity, basic);
              `
              ]
            ]
          }]
      })
    });

    this.blurPass = new GLObject({
      gl, 
      mesh: quad,
      program: new GLProgram({
        gl,
        shaders: [
          new BasicShader({
            normals: false
          }),
          new BlurShader({
            texture: this.mainFrameBuffer.colorTextures[0]
          })
        ]
      })
    });

    this.depthPass = new GLObject({
      gl,
      mesh: quad,
      program: new GLProgram({
        gl,
        shaders: [
          new BasicShader({
            normals: false
          }),
          {
            uniforms: [
              ["sandDepthTexture", this.blurFrameBuffer2.colorTextures[0]]
            ],
            fragmentShaderChunks: [
              ["start", `
              uniform sampler2D sandDepthTexture;
    
              ${DepthShader.bumpFromDepth({
                getDepth: `
                  return texture(depthTexture, uv).r;
                `
              })}
              `
              ],
              ["end", `
              vec2 uv = vPosition.xy * .5 + .5;
              vec4 bump = bumpFromDepth(sandDepthTexture, uv, vec2(512.), 1.);
              fragColor = vec4(bump.xyz * .5 + .5, bump.w);
              `
              ]
            ]
          }]
      })
    });
  }

  draw({ pointer, camera }) {
    this.mainFrameBuffer.bind();
    this.gl.viewport(0, 0, FRAME_BUFFER_SIZE, FRAME_BUFFER_SIZE);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);
    this.sandLayer.draw({
      pointSize: FRAME_BUFFER_SIZE / 512,
      pointer,
      camera,
      useCamera: false,
      frameTexture: this.blurFrameBuffer1.colorTextures[0]
    });
    this.mainFrameBuffer.unbind();
        
    this.blurFrameBuffer1.bind();
    this.blurPass.program.use();
    this.blurPass.program.uniforms.set("blurTexture", this.mainFrameBuffer.colorTextures[0]);
    this.blurPass.program.uniforms.set("blurDistance", [0, this.blurDistance]);
    this.blurPass.draw();
    this.blurFrameBuffer1.unbind();
    
    this.blurFrameBuffer2.bind();
    this.blurPass.program.uniforms.set("blurTexture", this.blurFrameBuffer1.colorTextures[0]);
    this.blurPass.program.uniforms.set("blurDistance", [this.blurDistance, 0]);
    this.blurPass.draw();
    this.blurFrameBuffer2.unbind();

    this.bumpFrameBuffer.bind();
    this.depthPass.draw();
    this.bumpFrameBuffer.unbind();

    this.gl.viewport(0, 0, this.gl.drawingBufferWidth, this.gl.drawingBufferHeight);
  
    this.sandPass.program.use();
    if (this.displayMap === "bump") {
      this.sandPass.program.uniforms.set("frameTexture", this.bumpFrameBuffer.colorTextures[0]);
      this.sandPass.program.uniforms.set("intensity", 1);
      this.sandPass.program.uniforms.set("basic", 1);
      this.sandPass.program.uniforms.set("heightOnly", 0);
    } else if (this.displayMap === "height") {
      this.sandPass.program.uniforms.set("frameTexture", this.bumpFrameBuffer.colorTextures[0]);
      this.sandPass.program.uniforms.set("intensity", 1);
      this.sandPass.program.uniforms.set("basic", 1);
      this.sandPass.program.uniforms.set("heightOnly", 1);
    } else {
      this.sandPass.program.uniforms.set("frameTexture", this.bumpFrameBuffer.colorTextures[0]);
      this.sandPass.program.uniforms.set("intensity", 1);
      this.sandPass.program.uniforms.set("heightOnly", 0);
      this.sandPass.program.uniforms.set("basic", 0);
    }
    this.sandPass.draw();

    if(this.displayPoints) {
      this.sandLayer.draw({
        pointSize: FRAME_BUFFER_SIZE / 128,
        camera,
        pointer,
        frameTexture: this.blurFrameBuffer1.colorTextures[0]
      });
    }
  }
}