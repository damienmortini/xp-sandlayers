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

const DEPTH_FRAME_BUFFER_SIZE = 1024;

export default class SandLayerProcessing {
  constructor({ gl }) {
    this.gl = gl;
    this.frameBuffer1 = new GLFrameBuffer({
      gl: this.gl
    });
    this.frameBuffer1.attach({
      texture: new GLTexture({
        gl: this.gl,
        width: DEPTH_FRAME_BUFFER_SIZE,
        height: DEPTH_FRAME_BUFFER_SIZE,
        minFilter: this.gl.LINEAR
      })
    });

    this.frameBuffer2 = new GLFrameBuffer({
      gl: this.gl
    });
    this.frameBuffer2.attach({
      texture: new GLTexture(this.frameBuffer1.colorTextures[0])
    });

    this.frameBuffer3 = new GLFrameBuffer({
      gl: this.gl
    });
    this.frameBuffer3.attach({
      texture: new GLTexture(this.frameBuffer1.colorTextures[0])
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

    this.basicPass = new GLObject({
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
              ["frameTexture", this.frameBuffer1.colorTextures[0]]
            ],
            fragmentShaderChunks: [
              ["start", `
              uniform sampler2D frameTexture;
              `
              ],
              ["end", `
                vec2 uv = vPosition.xy * .5 + .5;
                fragColor = texture(frameTexture, uv);
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
            texture: this.frameBuffer1.colorTextures[0]
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
              ["sandDepthTexture", this.frameBuffer3.colorTextures[0]]
            ],
            fragmentShaderChunks: [
              ["start", `
              uniform sampler2D sandDepthTexture;
    
              ${DepthShader.bumpFromDepth({
                getDepth: "return texture(depthTexture, uv).a;"
              })}
              `
              ],
              ["end", `
              vec2 uv = vPosition.xy * .5 + .5;
              vec4 bump = bumpFromDepth(sandDepthTexture, uv, vec2(512.), 1.);
              
              vec3 color = vec3(1., .5, .5);
              color += max(0., dot(vec3(1.), bump.xyz)) * .2;
              
              color = bump.xyz * .5 + .5;
              
              fragColor = vec4(color, 1.);
              `
              ]
            ]
          }]
      })
    });
  }

  draw({ pointer }) {
    this.frameBuffer1.bind();
    this.gl.viewport(0, 0, DEPTH_FRAME_BUFFER_SIZE, DEPTH_FRAME_BUFFER_SIZE);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);
    this.sandLayer.draw({
      pointer,
      frameTexture: this.frameBuffer2.colorTextures[0]
    });
    this.frameBuffer1.unbind();
        
    this.frameBuffer2.bind();
    this.blurPass.program.use();
    this.blurPass.program.uniforms.set("blurTexture", this.frameBuffer1.colorTextures[0]);
    this.blurPass.program.uniforms.set("blurDistance", [0, .25]);
    this.blurPass.draw();
    this.frameBuffer2.unbind();
    
    this.frameBuffer3.bind();
    this.blurPass.program.uniforms.set("blurTexture", this.frameBuffer2.colorTextures[0]);
    this.blurPass.program.uniforms.set("blurDistance", [.25, 0]);
    this.blurPass.draw();
    this.frameBuffer3.unbind();

    this.frameBuffer2.bind();
    this.depthPass.draw();
    this.frameBuffer2.unbind();

    this.gl.viewport(0, 0, this.gl.drawingBufferWidth, this.gl.drawingBufferHeight);
    
    this.basicPass.program.use();
    this.basicPass.program.uniforms.set("frameTexture", this.frameBuffer2.colorTextures[0]);
    this.basicPass.draw();

    // this.sandLayer.draw({
    //   pointer,
    //   frameTexture: this.frameBuffer2.colorTextures[0]
    // });
  }
}