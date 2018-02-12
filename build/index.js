(function () {
'use strict';

class Signal extends Set {
  constructor() {
    super();
    
    this._onceCallbacks = new Set();
  }

  add(value, {once = false} = {}) {
    if(once) {
      this._onceCallbacks.add(value);
    }

    super.add(value);
  }

  dispatch(value) {
    for (let callback of this) {
      callback(value);

      if(this._onceCallbacks.has(callback)) {
        this._onceCallbacks.delete(callback);
        this.delete(callback);
      }
    }
  }
}

class Ticker extends Signal {
  constructor() {
    super();
    
    this._updateBinded = this.update.bind(this);

    this._previousTimestamp = window.performance.now();
    this.deltaTime = 0;
    this.timeScale = 1;

    this.update();
  }

  update(time) {
    requestAnimationFrame(this._updateBinded);

    const timestamp = window.performance.now();
    this.deltaTime = (timestamp - this._previousTimestamp) * .001;
    this.timeScale = this.deltaTime / .0166666667;
    this._previousTimestamp = timestamp;

    this.dispatch(time);
  }
}

var Ticker$1 = new Ticker();

class LoopElement extends HTMLElement {
  constructor({autoplay = false, background = false} = {}) {
    super();
    this._autoplay = autoplay || this.hasAttribute("autoplay");
    this._background = background || this.hasAttribute("background");

    this.paused = true;
    this._pausedByBlur = false;

    this._updateBinded = this.update.bind(this);
  }

  connectedCallback() {
    if(!this._background) {
      window.top.addEventListener("blur", this._onBlur = () => {
        this._pausedByBlur = !this.paused;
        this.pause();
      });
      window.top.addEventListener("focus", this._onFocus = () => {
        if(this._pausedByBlur) {
          this.play();
        }
      });
    }
    if(window.top.document.hasFocus() && this._autoplay) {
      this.play();
    } else if (this._autoplay) {
      this._pausedByBlur = true;
      requestAnimationFrame(this._updateBinded);
    }
  }

  disconnectedCallback() {
    this.pause();
    window.top.removeEventListener("blur", this._onBlur);
    window.top.removeEventListener("focus", this._onFocus);
  }

  play() {
    this.paused = false;
    this._pausedByBlur = false;
    Ticker$1.add(this._updateBinded);
    this.dispatchEvent(new Event("playing"));
  }

  pause() {
    this.paused = true;
    Ticker$1.delete(this._updateBinded);
    this.dispatchEvent(new Event("pause"));
  }

  update() {}
}

window.customElements.define("dlib-loop", LoopElement);

let baseURI = "";

const PROMISES = new Map();
const OBJECTS = new Map();

const TYPE_MAP = new Map([
  ["text", new Set(["txt", "html", "js", "svg"])],
  ["json", new Set(["json"])],
  ["binary", new Set(["bin"])],
  ["image", new Set(["png", "jpg", "gif"])],
  ["video", new Set(["mp4", "webm"])],
  ["audio", new Set(["mp3", "ogg"])],
  ["style", new Set(["css"])],
  ["font", new Set(["woff", "woff2", "ttf"])],
]);

class Loader {
  static get onLoad() {
    return Promise.all(PROMISES.values());
  }

  static get promises() {
    return PROMISES;
  }

  static get typeMap() {
    return TYPE_MAP;
  }

  static get(value) {
    return OBJECTS.get(value);
  }

  static get baseURI() {
    return baseURI;
  }

  static set baseURI(value) {
    baseURI = value;
  }

  static load(values) {
    const returnArray = values instanceof Array;
    
    if(!returnArray) {
      values = [values];
    }

    let promises = [];

    for (let value of values) {
      if(!value) {
        continue;
      }

      let type;
      if(typeof value === "object") {
        type = value.type;
        value = value.value;
      }

      const src = `${baseURI}${typeof value === "string" ? value : (value.href || value.src)}`;
      const extension = /[\\/](.*)\.(.*)$/.exec(src)[2];

      if(!type) {
        for (const [key, value] of TYPE_MAP) {
          if(value.has(extension)) {
            type = key;
            break;
          }
        }
      }

      let promise = new Promise(function(resolve, reject) {
        if(PROMISES.get(value)) {
          PROMISES.get(value).then(resolve);
          return;
        }
        
        if(Loader.get(value)) {
          resolve(Loader.get(value));
          return;
        }

        fetch(`${baseURI}${src}`)
        .catch(() => {
          return new Promise(function(resolve, reject) {
            const xhr = new XMLHttpRequest;
            xhr.onload = function() {
              resolve(new Response(xhr.responseText, {status: xhr.status}));
            };
            xhr.open("GET", `${baseURI}${src}`);
            xhr.send(null);
          })
        })
        .then((response) => {
          if(type === "text") {
            return response.text();
          } else if(type === "json") {
            return response.json();
          } else if(type === "binary") {
            return response.arrayBuffer();
          } else if(type === "image") {
            return new Promise((resolve) => {
              const image = document.createElement("img");
              image.onload = () => { resolve(image); };
              image.src = src;
            });
          } else if(type === "video" || type === "audio") {
            return new Promise((resolve) => {
              const media = document.createElement(type);
              media.oncanplaythrough = () => { resolve(media); };
              media.src = src;
            });
          } else if(type === "style") {
            return new Promise((resolve) => {
              const link = document.createElement("link");
              link.rel = "stylesheet";
              link.type = "text/css";
              link.onload = () => { resolve(link); };
              document.head.appendChild(link);
              link.href = src;
            });
          } else if(type === "font") {
            return new Promise((resolve) => {
              let fontFace = new FontFace(/([^\/]*)\.(woff|woff2|ttf)$/.exec(value)[1], `url("${value}")`);
              document.fonts.add(fontFace);
              return fontFace.load();
            });
          } else if(type === "template") {
            return response.text().then((html) => {
              const template = document.createElement("template");
              template.innerHTML = html;
              return template;
            });
          } else {
            return response.blob();
          }
        })
        .then((response) => {
          PROMISES.delete(value);
          OBJECTS.set(value, response);
          resolve(response);
        });
      });

      promises.push(promise);
      PROMISES.set(value, promise);
    }

    return returnArray ? Promise.all(promises) : promises[0];
  }
}

/* Copyright (c) 2015, Brandon Jones, Colin MacKenzie IV.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE. */

/**
 * Common utilities
 * @module glMatrix
 */

// Configuration Constants

let ARRAY_TYPE = (typeof Float32Array !== 'undefined') ? Float32Array : Array;


/**
 * Sets the type of array used when creating new vectors and matrices
 *
 * @param {Type} type Array type, such as Float32Array or Array
 */


const degree = Math.PI / 180;

/**
 * Convert Degree To Radian
 *
 * @param {Number} a Angle in Degrees
 */


/**
 * Tests whether or not the arguments have approximately the same value, within an absolute
 * or relative tolerance of glMatrix.EPSILON (an absolute tolerance is used for values less
 * than or equal to 1.0, and a relative tolerance is used for larger values)
 *
 * @param {Number} a The first number to test.
 * @param {Number} b The second number to test.
 * @returns {Boolean} True if the numbers are approximately equal, false otherwise.
 */

/* Copyright (c) 2015, Brandon Jones, Colin MacKenzie IV.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE. */

/**
 * 4x4 Matrix
 * @module mat4
 */

/**
 * Creates a new identity mat4
 *
 * @returns {mat4} a new 4x4 matrix
 */


/**
 * Creates a new mat4 initialized with values from an existing matrix
 *
 * @param {mat4} a matrix to clone
 * @returns {mat4} a new 4x4 matrix
 */


/**
 * Copy the values from one mat4 to another
 *
 * @param {mat4} out the receiving matrix
 * @param {mat4} a the source matrix
 * @returns {mat4} out
 */
function copy(out, a) {
  out[0] = a[0];
  out[1] = a[1];
  out[2] = a[2];
  out[3] = a[3];
  out[4] = a[4];
  out[5] = a[5];
  out[6] = a[6];
  out[7] = a[7];
  out[8] = a[8];
  out[9] = a[9];
  out[10] = a[10];
  out[11] = a[11];
  out[12] = a[12];
  out[13] = a[13];
  out[14] = a[14];
  out[15] = a[15];
  return out;
}

/**
 * Create a new mat4 with the given values
 *
 * @param {Number} m00 Component in column 0, row 0 position (index 0)
 * @param {Number} m01 Component in column 0, row 1 position (index 1)
 * @param {Number} m02 Component in column 0, row 2 position (index 2)
 * @param {Number} m03 Component in column 0, row 3 position (index 3)
 * @param {Number} m10 Component in column 1, row 0 position (index 4)
 * @param {Number} m11 Component in column 1, row 1 position (index 5)
 * @param {Number} m12 Component in column 1, row 2 position (index 6)
 * @param {Number} m13 Component in column 1, row 3 position (index 7)
 * @param {Number} m20 Component in column 2, row 0 position (index 8)
 * @param {Number} m21 Component in column 2, row 1 position (index 9)
 * @param {Number} m22 Component in column 2, row 2 position (index 10)
 * @param {Number} m23 Component in column 2, row 3 position (index 11)
 * @param {Number} m30 Component in column 3, row 0 position (index 12)
 * @param {Number} m31 Component in column 3, row 1 position (index 13)
 * @param {Number} m32 Component in column 3, row 2 position (index 14)
 * @param {Number} m33 Component in column 3, row 3 position (index 15)
 * @returns {mat4} A new mat4
 */


/**
 * Set the components of a mat4 to the given values
 *
 * @param {mat4} out the receiving matrix
 * @param {Number} m00 Component in column 0, row 0 position (index 0)
 * @param {Number} m01 Component in column 0, row 1 position (index 1)
 * @param {Number} m02 Component in column 0, row 2 position (index 2)
 * @param {Number} m03 Component in column 0, row 3 position (index 3)
 * @param {Number} m10 Component in column 1, row 0 position (index 4)
 * @param {Number} m11 Component in column 1, row 1 position (index 5)
 * @param {Number} m12 Component in column 1, row 2 position (index 6)
 * @param {Number} m13 Component in column 1, row 3 position (index 7)
 * @param {Number} m20 Component in column 2, row 0 position (index 8)
 * @param {Number} m21 Component in column 2, row 1 position (index 9)
 * @param {Number} m22 Component in column 2, row 2 position (index 10)
 * @param {Number} m23 Component in column 2, row 3 position (index 11)
 * @param {Number} m30 Component in column 3, row 0 position (index 12)
 * @param {Number} m31 Component in column 3, row 1 position (index 13)
 * @param {Number} m32 Component in column 3, row 2 position (index 14)
 * @param {Number} m33 Component in column 3, row 3 position (index 15)
 * @returns {mat4} out
 */
function set(out, m00, m01, m02, m03, m10, m11, m12, m13, m20, m21, m22, m23, m30, m31, m32, m33) {
  out[0] = m00;
  out[1] = m01;
  out[2] = m02;
  out[3] = m03;
  out[4] = m10;
  out[5] = m11;
  out[6] = m12;
  out[7] = m13;
  out[8] = m20;
  out[9] = m21;
  out[10] = m22;
  out[11] = m23;
  out[12] = m30;
  out[13] = m31;
  out[14] = m32;
  out[15] = m33;
  return out;
}


/**
 * Set a mat4 to the identity matrix
 *
 * @param {mat4} out the receiving matrix
 * @returns {mat4} out
 */
function identity(out) {
  out[0] = 1;
  out[1] = 0;
  out[2] = 0;
  out[3] = 0;
  out[4] = 0;
  out[5] = 1;
  out[6] = 0;
  out[7] = 0;
  out[8] = 0;
  out[9] = 0;
  out[10] = 1;
  out[11] = 0;
  out[12] = 0;
  out[13] = 0;
  out[14] = 0;
  out[15] = 1;
  return out;
}

/**
 * Transpose the values of a mat4
 *
 * @param {mat4} out the receiving matrix
 * @param {mat4} a the source matrix
 * @returns {mat4} out
 */


/**
 * Inverts a mat4
 *
 * @param {mat4} out the receiving matrix
 * @param {mat4} a the source matrix
 * @returns {mat4} out
 */
function invert(out, a) {
  let a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
  let a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
  let a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
  let a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];

  let b00 = a00 * a11 - a01 * a10;
  let b01 = a00 * a12 - a02 * a10;
  let b02 = a00 * a13 - a03 * a10;
  let b03 = a01 * a12 - a02 * a11;
  let b04 = a01 * a13 - a03 * a11;
  let b05 = a02 * a13 - a03 * a12;
  let b06 = a20 * a31 - a21 * a30;
  let b07 = a20 * a32 - a22 * a30;
  let b08 = a20 * a33 - a23 * a30;
  let b09 = a21 * a32 - a22 * a31;
  let b10 = a21 * a33 - a23 * a31;
  let b11 = a22 * a33 - a23 * a32;

  // Calculate the determinant
  let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;

  if (!det) {
    return null;
  }
  det = 1.0 / det;

  out[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
  out[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
  out[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
  out[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
  out[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
  out[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
  out[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
  out[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
  out[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det;
  out[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
  out[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
  out[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
  out[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det;
  out[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
  out[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det;
  out[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;

  return out;
}

/**
 * Calculates the adjugate of a mat4
 *
 * @param {mat4} out the receiving matrix
 * @param {mat4} a the source matrix
 * @returns {mat4} out
 */


/**
 * Calculates the determinant of a mat4
 *
 * @param {mat4} a the source matrix
 * @returns {Number} determinant of a
 */


/**
 * Multiplies two mat4s
 *
 * @param {mat4} out the receiving matrix
 * @param {mat4} a the first operand
 * @param {mat4} b the second operand
 * @returns {mat4} out
 */
function multiply(out, a, b) {
  let a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
  let a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
  let a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
  let a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];

  // Cache only the current line of the second matrix
  let b0  = b[0], b1 = b[1], b2 = b[2], b3 = b[3];
  out[0] = b0*a00 + b1*a10 + b2*a20 + b3*a30;
  out[1] = b0*a01 + b1*a11 + b2*a21 + b3*a31;
  out[2] = b0*a02 + b1*a12 + b2*a22 + b3*a32;
  out[3] = b0*a03 + b1*a13 + b2*a23 + b3*a33;

  b0 = b[4]; b1 = b[5]; b2 = b[6]; b3 = b[7];
  out[4] = b0*a00 + b1*a10 + b2*a20 + b3*a30;
  out[5] = b0*a01 + b1*a11 + b2*a21 + b3*a31;
  out[6] = b0*a02 + b1*a12 + b2*a22 + b3*a32;
  out[7] = b0*a03 + b1*a13 + b2*a23 + b3*a33;

  b0 = b[8]; b1 = b[9]; b2 = b[10]; b3 = b[11];
  out[8] = b0*a00 + b1*a10 + b2*a20 + b3*a30;
  out[9] = b0*a01 + b1*a11 + b2*a21 + b3*a31;
  out[10] = b0*a02 + b1*a12 + b2*a22 + b3*a32;
  out[11] = b0*a03 + b1*a13 + b2*a23 + b3*a33;

  b0 = b[12]; b1 = b[13]; b2 = b[14]; b3 = b[15];
  out[12] = b0*a00 + b1*a10 + b2*a20 + b3*a30;
  out[13] = b0*a01 + b1*a11 + b2*a21 + b3*a31;
  out[14] = b0*a02 + b1*a12 + b2*a22 + b3*a32;
  out[15] = b0*a03 + b1*a13 + b2*a23 + b3*a33;
  return out;
}

/**
 * Translate a mat4 by the given vector
 *
 * @param {mat4} out the receiving matrix
 * @param {mat4} a the matrix to translate
 * @param {vec3} v vector to translate by
 * @returns {mat4} out
 */
function translate(out, a, v) {
  let x = v[0], y = v[1], z = v[2];
  let a00, a01, a02, a03;
  let a10, a11, a12, a13;
  let a20, a21, a22, a23;

  if (a === out) {
    out[12] = a[0] * x + a[4] * y + a[8] * z + a[12];
    out[13] = a[1] * x + a[5] * y + a[9] * z + a[13];
    out[14] = a[2] * x + a[6] * y + a[10] * z + a[14];
    out[15] = a[3] * x + a[7] * y + a[11] * z + a[15];
  } else {
    a00 = a[0]; a01 = a[1]; a02 = a[2]; a03 = a[3];
    a10 = a[4]; a11 = a[5]; a12 = a[6]; a13 = a[7];
    a20 = a[8]; a21 = a[9]; a22 = a[10]; a23 = a[11];

    out[0] = a00; out[1] = a01; out[2] = a02; out[3] = a03;
    out[4] = a10; out[5] = a11; out[6] = a12; out[7] = a13;
    out[8] = a20; out[9] = a21; out[10] = a22; out[11] = a23;

    out[12] = a00 * x + a10 * y + a20 * z + a[12];
    out[13] = a01 * x + a11 * y + a21 * z + a[13];
    out[14] = a02 * x + a12 * y + a22 * z + a[14];
    out[15] = a03 * x + a13 * y + a23 * z + a[15];
  }

  return out;
}

/**
 * Scales the mat4 by the dimensions in the given vec3 not using vectorization
 *
 * @param {mat4} out the receiving matrix
 * @param {mat4} a the matrix to scale
 * @param {vec3} v the vec3 to scale the matrix by
 * @returns {mat4} out
 **/
function scale(out, a, v) {
  let x = v[0], y = v[1], z = v[2];

  out[0] = a[0] * x;
  out[1] = a[1] * x;
  out[2] = a[2] * x;
  out[3] = a[3] * x;
  out[4] = a[4] * y;
  out[5] = a[5] * y;
  out[6] = a[6] * y;
  out[7] = a[7] * y;
  out[8] = a[8] * z;
  out[9] = a[9] * z;
  out[10] = a[10] * z;
  out[11] = a[11] * z;
  out[12] = a[12];
  out[13] = a[13];
  out[14] = a[14];
  out[15] = a[15];
  return out;
}

/**
 * Rotates a mat4 by the given angle around the given axis
 *
 * @param {mat4} out the receiving matrix
 * @param {mat4} a the matrix to rotate
 * @param {Number} rad the angle to rotate the matrix by
 * @param {vec3} axis the axis to rotate around
 * @returns {mat4} out
 */


/**
 * Rotates a matrix by the given angle around the X axis
 *
 * @param {mat4} out the receiving matrix
 * @param {mat4} a the matrix to rotate
 * @param {Number} rad the angle to rotate the matrix by
 * @returns {mat4} out
 */
function rotateX(out, a, rad) {
  let s = Math.sin(rad);
  let c = Math.cos(rad);
  let a10 = a[4];
  let a11 = a[5];
  let a12 = a[6];
  let a13 = a[7];
  let a20 = a[8];
  let a21 = a[9];
  let a22 = a[10];
  let a23 = a[11];

  if (a !== out) { // If the source and destination differ, copy the unchanged rows
    out[0]  = a[0];
    out[1]  = a[1];
    out[2]  = a[2];
    out[3]  = a[3];
    out[12] = a[12];
    out[13] = a[13];
    out[14] = a[14];
    out[15] = a[15];
  }

  // Perform axis-specific matrix multiplication
  out[4] = a10 * c + a20 * s;
  out[5] = a11 * c + a21 * s;
  out[6] = a12 * c + a22 * s;
  out[7] = a13 * c + a23 * s;
  out[8] = a20 * c - a10 * s;
  out[9] = a21 * c - a11 * s;
  out[10] = a22 * c - a12 * s;
  out[11] = a23 * c - a13 * s;
  return out;
}

/**
 * Rotates a matrix by the given angle around the Y axis
 *
 * @param {mat4} out the receiving matrix
 * @param {mat4} a the matrix to rotate
 * @param {Number} rad the angle to rotate the matrix by
 * @returns {mat4} out
 */
function rotateY(out, a, rad) {
  let s = Math.sin(rad);
  let c = Math.cos(rad);
  let a00 = a[0];
  let a01 = a[1];
  let a02 = a[2];
  let a03 = a[3];
  let a20 = a[8];
  let a21 = a[9];
  let a22 = a[10];
  let a23 = a[11];

  if (a !== out) { // If the source and destination differ, copy the unchanged rows
    out[4]  = a[4];
    out[5]  = a[5];
    out[6]  = a[6];
    out[7]  = a[7];
    out[12] = a[12];
    out[13] = a[13];
    out[14] = a[14];
    out[15] = a[15];
  }

  // Perform axis-specific matrix multiplication
  out[0] = a00 * c - a20 * s;
  out[1] = a01 * c - a21 * s;
  out[2] = a02 * c - a22 * s;
  out[3] = a03 * c - a23 * s;
  out[8] = a00 * s + a20 * c;
  out[9] = a01 * s + a21 * c;
  out[10] = a02 * s + a22 * c;
  out[11] = a03 * s + a23 * c;
  return out;
}

/**
 * Rotates a matrix by the given angle around the Z axis
 *
 * @param {mat4} out the receiving matrix
 * @param {mat4} a the matrix to rotate
 * @param {Number} rad the angle to rotate the matrix by
 * @returns {mat4} out
 */
function rotateZ(out, a, rad) {
  let s = Math.sin(rad);
  let c = Math.cos(rad);
  let a00 = a[0];
  let a01 = a[1];
  let a02 = a[2];
  let a03 = a[3];
  let a10 = a[4];
  let a11 = a[5];
  let a12 = a[6];
  let a13 = a[7];

  if (a !== out) { // If the source and destination differ, copy the unchanged last row
    out[8]  = a[8];
    out[9]  = a[9];
    out[10] = a[10];
    out[11] = a[11];
    out[12] = a[12];
    out[13] = a[13];
    out[14] = a[14];
    out[15] = a[15];
  }

  // Perform axis-specific matrix multiplication
  out[0] = a00 * c + a10 * s;
  out[1] = a01 * c + a11 * s;
  out[2] = a02 * c + a12 * s;
  out[3] = a03 * c + a13 * s;
  out[4] = a10 * c - a00 * s;
  out[5] = a11 * c - a01 * s;
  out[6] = a12 * c - a02 * s;
  out[7] = a13 * c - a03 * s;
  return out;
}

/**
 * Creates a matrix from a vector translation
 * This is equivalent to (but much faster than):
 *
 *     mat4.identity(dest);
 *     mat4.translate(dest, dest, vec);
 *
 * @param {mat4} out mat4 receiving operation result
 * @param {vec3} v Translation vector
 * @returns {mat4} out
 */


/**
 * Creates a matrix from a vector scaling
 * This is equivalent to (but much faster than):
 *
 *     mat4.identity(dest);
 *     mat4.scale(dest, dest, vec);
 *
 * @param {mat4} out mat4 receiving operation result
 * @param {vec3} v Scaling vector
 * @returns {mat4} out
 */


/**
 * Creates a matrix from a given angle around a given axis
 * This is equivalent to (but much faster than):
 *
 *     mat4.identity(dest);
 *     mat4.rotate(dest, dest, rad, axis);
 *
 * @param {mat4} out mat4 receiving operation result
 * @param {Number} rad the angle to rotate the matrix by
 * @param {vec3} axis the axis to rotate around
 * @returns {mat4} out
 */


/**
 * Creates a matrix from the given angle around the X axis
 * This is equivalent to (but much faster than):
 *
 *     mat4.identity(dest);
 *     mat4.rotateX(dest, dest, rad);
 *
 * @param {mat4} out mat4 receiving operation result
 * @param {Number} rad the angle to rotate the matrix by
 * @returns {mat4} out
 */


/**
 * Creates a matrix from the given angle around the Y axis
 * This is equivalent to (but much faster than):
 *
 *     mat4.identity(dest);
 *     mat4.rotateY(dest, dest, rad);
 *
 * @param {mat4} out mat4 receiving operation result
 * @param {Number} rad the angle to rotate the matrix by
 * @returns {mat4} out
 */


/**
 * Creates a matrix from the given angle around the Z axis
 * This is equivalent to (but much faster than):
 *
 *     mat4.identity(dest);
 *     mat4.rotateZ(dest, dest, rad);
 *
 * @param {mat4} out mat4 receiving operation result
 * @param {Number} rad the angle to rotate the matrix by
 * @returns {mat4} out
 */


/**
 * Creates a matrix from a quaternion rotation and vector translation
 * This is equivalent to (but much faster than):
 *
 *     mat4.identity(dest);
 *     mat4.translate(dest, vec);
 *     let quatMat = mat4.create();
 *     quat4.toMat4(quat, quatMat);
 *     mat4.multiply(dest, quatMat);
 *
 * @param {mat4} out mat4 receiving operation result
 * @param {quat4} q Rotation quaternion
 * @param {vec3} v Translation vector
 * @returns {mat4} out
 */


/**
 * Returns the translation vector component of a transformation
 *  matrix. If a matrix is built with fromRotationTranslation,
 *  the returned vector will be the same as the translation vector
 *  originally supplied.
 * @param  {vec3} out Vector to receive translation component
 * @param  {mat4} mat Matrix to be decomposed (input)
 * @return {vec3} out
 */


/**
 * Returns the scaling factor component of a transformation
 *  matrix. If a matrix is built with fromRotationTranslationScale
 *  with a normalized Quaternion paramter, the returned vector will be
 *  the same as the scaling vector
 *  originally supplied.
 * @param  {vec3} out Vector to receive scaling factor component
 * @param  {mat4} mat Matrix to be decomposed (input)
 * @return {vec3} out
 */


/**
 * Returns a quaternion representing the rotational component
 *  of a transformation matrix. If a matrix is built with
 *  fromRotationTranslation, the returned quaternion will be the
 *  same as the quaternion originally supplied.
 * @param {quat} out Quaternion to receive the rotation component
 * @param {mat4} mat Matrix to be decomposed (input)
 * @return {quat} out
 */


/**
 * Creates a matrix from a quaternion rotation, vector translation and vector scale
 * This is equivalent to (but much faster than):
 *
 *     mat4.identity(dest);
 *     mat4.translate(dest, vec);
 *     let quatMat = mat4.create();
 *     quat4.toMat4(quat, quatMat);
 *     mat4.multiply(dest, quatMat);
 *     mat4.scale(dest, scale)
 *
 * @param {mat4} out mat4 receiving operation result
 * @param {quat4} q Rotation quaternion
 * @param {vec3} v Translation vector
 * @param {vec3} s Scaling vector
 * @returns {mat4} out
 */


/**
 * Creates a matrix from a quaternion rotation, vector translation and vector scale, rotating and scaling around the given origin
 * This is equivalent to (but much faster than):
 *
 *     mat4.identity(dest);
 *     mat4.translate(dest, vec);
 *     mat4.translate(dest, origin);
 *     let quatMat = mat4.create();
 *     quat4.toMat4(quat, quatMat);
 *     mat4.multiply(dest, quatMat);
 *     mat4.scale(dest, scale)
 *     mat4.translate(dest, negativeOrigin);
 *
 * @param {mat4} out mat4 receiving operation result
 * @param {quat4} q Rotation quaternion
 * @param {vec3} v Translation vector
 * @param {vec3} s Scaling vector
 * @param {vec3} o The origin vector around which to scale and rotate
 * @returns {mat4} out
 */


/**
 * Calculates a 4x4 matrix from the given quaternion
 *
 * @param {mat4} out mat4 receiving operation result
 * @param {quat} q Quaternion to create matrix from
 *
 * @returns {mat4} out
 */
function fromQuat(out, q) {
  let x = q[0], y = q[1], z = q[2], w = q[3];
  let x2 = x + x;
  let y2 = y + y;
  let z2 = z + z;

  let xx = x * x2;
  let yx = y * x2;
  let yy = y * y2;
  let zx = z * x2;
  let zy = z * y2;
  let zz = z * z2;
  let wx = w * x2;
  let wy = w * y2;
  let wz = w * z2;

  out[0] = 1 - yy - zz;
  out[1] = yx + wz;
  out[2] = zx - wy;
  out[3] = 0;

  out[4] = yx - wz;
  out[5] = 1 - xx - zz;
  out[6] = zy + wx;
  out[7] = 0;

  out[8] = zx + wy;
  out[9] = zy - wx;
  out[10] = 1 - xx - yy;
  out[11] = 0;

  out[12] = 0;
  out[13] = 0;
  out[14] = 0;
  out[15] = 1;

  return out;
}

/**
 * Generates a frustum matrix with the given bounds
 *
 * @param {mat4} out mat4 frustum matrix will be written into
 * @param {Number} left Left bound of the frustum
 * @param {Number} right Right bound of the frustum
 * @param {Number} bottom Bottom bound of the frustum
 * @param {Number} top Top bound of the frustum
 * @param {Number} near Near bound of the frustum
 * @param {Number} far Far bound of the frustum
 * @returns {mat4} out
 */


/**
 * Generates a perspective projection matrix with the given bounds
 *
 * @param {mat4} out mat4 frustum matrix will be written into
 * @param {number} fovy Vertical field of view in radians
 * @param {number} aspect Aspect ratio. typically viewport width/height
 * @param {number} near Near bound of the frustum
 * @param {number} far Far bound of the frustum
 * @returns {mat4} out
 */
function perspective(out, fovy, aspect, near, far) {
  let f = 1.0 / Math.tan(fovy / 2);
  let nf = 1 / (near - far);
  out[0] = f / aspect;
  out[1] = 0;
  out[2] = 0;
  out[3] = 0;
  out[4] = 0;
  out[5] = f;
  out[6] = 0;
  out[7] = 0;
  out[8] = 0;
  out[9] = 0;
  out[10] = (far + near) * nf;
  out[11] = -1;
  out[12] = 0;
  out[13] = 0;
  out[14] = (2 * far * near) * nf;
  out[15] = 0;
  return out;
}

/**
 * Generates a perspective projection matrix with the given field of view.
 * This is primarily useful for generating projection matrices to be used
 * with the still experiemental WebVR API.
 *
 * @param {mat4} out mat4 frustum matrix will be written into
 * @param {Object} fov Object containing the following values: upDegrees, downDegrees, leftDegrees, rightDegrees
 * @param {number} near Near bound of the frustum
 * @param {number} far Far bound of the frustum
 * @returns {mat4} out
 */


/**
 * Generates a orthogonal projection matrix with the given bounds
 *
 * @param {mat4} out mat4 frustum matrix will be written into
 * @param {number} left Left bound of the frustum
 * @param {number} right Right bound of the frustum
 * @param {number} bottom Bottom bound of the frustum
 * @param {number} top Top bound of the frustum
 * @param {number} near Near bound of the frustum
 * @param {number} far Far bound of the frustum
 * @returns {mat4} out
 */


/**
 * Generates a look-at matrix with the given eye position, focal point, and up axis
 *
 * @param {mat4} out mat4 frustum matrix will be written into
 * @param {vec3} eye Position of the viewer
 * @param {vec3} center Point the viewer is looking at
 * @param {vec3} up vec3 pointing up
 * @returns {mat4} out
 */


/**
 * Generates a matrix that makes something look at something else.
 *
 * @param {mat4} out mat4 frustum matrix will be written into
 * @param {vec3} eye Position of the viewer
 * @param {vec3} center Point the viewer is looking at
 * @param {vec3} up vec3 pointing up
 * @returns {mat4} out
 */


/**
 * Returns a string representation of a mat4
 *
 * @param {mat4} a matrix to represent as a string
 * @returns {String} string representation of the matrix
 */


/**
 * Returns Frobenius norm of a mat4
 *
 * @param {mat4} a the matrix to calculate Frobenius norm of
 * @returns {Number} Frobenius norm
 */


/**
 * Adds two mat4's
 *
 * @param {mat4} out the receiving matrix
 * @param {mat4} a the first operand
 * @param {mat4} b the second operand
 * @returns {mat4} out
 */


/**
 * Subtracts matrix b from matrix a
 *
 * @param {mat4} out the receiving matrix
 * @param {mat4} a the first operand
 * @param {mat4} b the second operand
 * @returns {mat4} out
 */


/**
 * Multiply each element of the matrix by a scalar.
 *
 * @param {mat4} out the receiving matrix
 * @param {mat4} a the matrix to scale
 * @param {Number} b amount to scale the matrix's elements by
 * @returns {mat4} out
 */


/**
 * Adds two mat4's after multiplying each element of the second operand by a scalar value.
 *
 * @param {mat4} out the receiving vector
 * @param {mat4} a the first operand
 * @param {mat4} b the second operand
 * @param {Number} scale the amount to scale b's elements by before adding
 * @returns {mat4} out
 */


/**
 * Returns whether or not the matrices have exactly the same elements in the same position (when compared with ===)
 *
 * @param {mat4} a The first matrix.
 * @param {mat4} b The second matrix.
 * @returns {Boolean} True if the matrices are equal, false otherwise.
 */


/**
 * Returns whether or not the matrices have approximately the same elements in the same position.
 *
 * @param {mat4} a The first matrix.
 * @param {mat4} b The second matrix.
 * @returns {Boolean} True if the matrices are equal, false otherwise.
 */


/**
 * Alias for {@link mat4.multiply}
 * @function
 */


/**
 * Alias for {@link mat4.subtract}
 * @function
 */

class Matrix4 extends Float32Array {
  constructor(array = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]) {
    super(array);
    return this;
  }

  set x(value) {
    this[12] = value;
  }

  get x() {
    return this[12];
  }

  set y(value) {
    this[13] = value;
  }

  get y() {
    return this[13];
  }

  set z(value) {
    this[14] = value;
  }

  get z() {
    return this[14];
  }

  set w(value) {
    this[15] = value;
  }

  get w() {
    return this[15];
  }

  set(m00, m01, m02, m03, m10, m11, m12, m13, m20, m21, m22, m23, m30, m31, m32, m33) {
    if(m00.length) {
      return this.copy(m00);
    }
    set(this, m00, m01, m02, m03, m10, m11, m12, m13, m20, m21, m22, m23, m30, m31, m32, m33);
    return this;
  }

  translate(vector3, matrix4 = this) {
    translate(this, matrix4, vector3);
    return this;
  }

  rotateX(value, matrix4 = this) {
    rotateX(this, matrix4, value);
    return this;
  }

  rotateY(value, matrix4 = this) {
    rotateY(this, matrix4, value);
    return this;
  }

  rotateZ(value, matrix4 = this) {
    rotateZ(this, matrix4, value);
    return this;
  }

  scale(value, matrix4 = this) {
    scale(this, matrix4, typeof value === "number" ? [value, value, value] : value);
    return this;
  }

  multiply(matrix4a, matrix4b) {
    if (matrix4b) {
      multiply(this, matrix4a, matrix4b);
    } else {
      multiply(this, this, matrix4a);
    }
    return this;
  }

  identity() {
    identity(this);
    return this;
  }

  copy(matrix4) {
    copy(this, matrix4);
    return this;
  }

  fromPerspective({fov, aspectRatio, near, far} = {}) {
    perspective(this, fov, aspectRatio, near, far);
    return this;
  }

  fromQuaternion(quaternion) {
    fromQuat(this, quaternion);
    return this;
  }

  setPosition(vector3) {
    this.x = vector3[0];
    this.y = vector3[1];
    this.z = vector3[2];
    return this;
  }

  invert(matrix4 = this) {
    invert(this, matrix4);
    return this;
  }
}

/* Copyright (c) 2015, Brandon Jones, Colin MacKenzie IV.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE. */

/**
 * 2 Dimensional Vector
 * @module vec2
 */

/**
 * Creates a new, empty vec2
 *
 * @returns {vec2} a new 2D vector
 */
function create$1() {
  let out = new ARRAY_TYPE(2);
  out[0] = 0;
  out[1] = 0;
  return out;
}

/**
 * Creates a new vec2 initialized with values from an existing vector
 *
 * @param {vec2} a vector to clone
 * @returns {vec2} a new 2D vector
 */


/**
 * Creates a new vec2 initialized with the given values
 *
 * @param {Number} x X component
 * @param {Number} y Y component
 * @returns {vec2} a new 2D vector
 */


/**
 * Copy the values from one vec2 to another
 *
 * @param {vec2} out the receiving vector
 * @param {vec2} a the source vector
 * @returns {vec2} out
 */
function copy$1(out, a) {
  out[0] = a[0];
  out[1] = a[1];
  return out;
}

/**
 * Set the components of a vec2 to the given values
 *
 * @param {vec2} out the receiving vector
 * @param {Number} x X component
 * @param {Number} y Y component
 * @returns {vec2} out
 */
function set$1(out, x, y) {
  out[0] = x;
  out[1] = y;
  return out;
}

/**
 * Adds two vec2's
 *
 * @param {vec2} out the receiving vector
 * @param {vec2} a the first operand
 * @param {vec2} b the second operand
 * @returns {vec2} out
 */
function add$1(out, a, b) {
  out[0] = a[0] + b[0];
  out[1] = a[1] + b[1];
  return out;
}

/**
 * Subtracts vector b from vector a
 *
 * @param {vec2} out the receiving vector
 * @param {vec2} a the first operand
 * @param {vec2} b the second operand
 * @returns {vec2} out
 */
function subtract$1(out, a, b) {
  out[0] = a[0] - b[0];
  out[1] = a[1] - b[1];
  return out;
}

/**
 * Multiplies two vec2's
 *
 * @param {vec2} out the receiving vector
 * @param {vec2} a the first operand
 * @param {vec2} b the second operand
 * @returns {vec2} out
 */


/**
 * Divides two vec2's
 *
 * @param {vec2} out the receiving vector
 * @param {vec2} a the first operand
 * @param {vec2} b the second operand
 * @returns {vec2} out
 */


/**
 * Math.ceil the components of a vec2
 *
 * @param {vec2} out the receiving vector
 * @param {vec2} a vector to ceil
 * @returns {vec2} out
 */


/**
 * Math.floor the components of a vec2
 *
 * @param {vec2} out the receiving vector
 * @param {vec2} a vector to floor
 * @returns {vec2} out
 */


/**
 * Returns the minimum of two vec2's
 *
 * @param {vec2} out the receiving vector
 * @param {vec2} a the first operand
 * @param {vec2} b the second operand
 * @returns {vec2} out
 */


/**
 * Returns the maximum of two vec2's
 *
 * @param {vec2} out the receiving vector
 * @param {vec2} a the first operand
 * @param {vec2} b the second operand
 * @returns {vec2} out
 */


/**
 * Math.round the components of a vec2
 *
 * @param {vec2} out the receiving vector
 * @param {vec2} a vector to round
 * @returns {vec2} out
 */


/**
 * Scales a vec2 by a scalar number
 *
 * @param {vec2} out the receiving vector
 * @param {vec2} a the vector to scale
 * @param {Number} b amount to scale the vector by
 * @returns {vec2} out
 */
function scale$1(out, a, b) {
  out[0] = a[0] * b;
  out[1] = a[1] * b;
  return out;
}

/**
 * Adds two vec2's after scaling the second operand by a scalar value
 *
 * @param {vec2} out the receiving vector
 * @param {vec2} a the first operand
 * @param {vec2} b the second operand
 * @param {Number} scale the amount to scale b by before adding
 * @returns {vec2} out
 */


/**
 * Calculates the euclidian distance between two vec2's
 *
 * @param {vec2} a the first operand
 * @param {vec2} b the second operand
 * @returns {Number} distance between a and b
 */


/**
 * Calculates the squared euclidian distance between two vec2's
 *
 * @param {vec2} a the first operand
 * @param {vec2} b the second operand
 * @returns {Number} squared distance between a and b
 */


/**
 * Calculates the length of a vec2
 *
 * @param {vec2} a vector to calculate length of
 * @returns {Number} length of a
 */
function length(a) {
  var x = a[0],
    y = a[1];
  return Math.sqrt(x*x + y*y);
}

/**
 * Calculates the squared length of a vec2
 *
 * @param {vec2} a vector to calculate squared length of
 * @returns {Number} squared length of a
 */
function squaredLength (a) {
  var x = a[0],
    y = a[1];
  return x*x + y*y;
}

/**
 * Negates the components of a vec2
 *
 * @param {vec2} out the receiving vector
 * @param {vec2} a vector to negate
 * @returns {vec2} out
 */
function negate(out, a) {
  out[0] = -a[0];
  out[1] = -a[1];
  return out;
}

/**
 * Returns the inverse of the components of a vec2
 *
 * @param {vec2} out the receiving vector
 * @param {vec2} a vector to invert
 * @returns {vec2} out
 */


/**
 * Normalize a vec2
 *
 * @param {vec2} out the receiving vector
 * @param {vec2} a vector to normalize
 * @returns {vec2} out
 */
function normalize(out, a) {
  var x = a[0],
    y = a[1];
  var len = x*x + y*y;
  if (len > 0) {
    //TODO: evaluate use of glm_invsqrt here?
    len = 1 / Math.sqrt(len);
    out[0] = a[0] * len;
    out[1] = a[1] * len;
  }
  return out;
}

/**
 * Calculates the dot product of two vec2's
 *
 * @param {vec2} a the first operand
 * @param {vec2} b the second operand
 * @returns {Number} dot product of a and b
 */
function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1];
}

/**
 * Computes the cross product of two vec2's
 * Note that the cross product must by definition produce a 3D vector
 *
 * @param {vec3} out the receiving vector
 * @param {vec2} a the first operand
 * @param {vec2} b the second operand
 * @returns {vec3} out
 */
function cross(out, a, b) {
  var z = a[0] * b[1] - a[1] * b[0];
  out[0] = out[1] = 0;
  out[2] = z;
  return out;
}

/**
 * Performs a linear interpolation between two vec2's
 *
 * @param {vec2} out the receiving vector
 * @param {vec2} a the first operand
 * @param {vec2} b the second operand
 * @param {Number} t interpolation amount between the two inputs
 * @returns {vec2} out
 */
function lerp(out, a, b, t) {
  var ax = a[0],
    ay = a[1];
  out[0] = ax + t * (b[0] - ax);
  out[1] = ay + t * (b[1] - ay);
  return out;
}

/**
 * Generates a random vector with the given scale
 *
 * @param {vec2} out the receiving vector
 * @param {Number} [scale] Length of the resulting vector. If ommitted, a unit vector will be returned
 * @returns {vec2} out
 */


/**
 * Transforms the vec2 with a mat2
 *
 * @param {vec2} out the receiving vector
 * @param {vec2} a the vector to transform
 * @param {mat2} m matrix to transform with
 * @returns {vec2} out
 */


/**
 * Transforms the vec2 with a mat2d
 *
 * @param {vec2} out the receiving vector
 * @param {vec2} a the vector to transform
 * @param {mat2d} m matrix to transform with
 * @returns {vec2} out
 */


/**
 * Transforms the vec2 with a mat3
 * 3rd vector component is implicitly '1'
 *
 * @param {vec2} out the receiving vector
 * @param {vec2} a the vector to transform
 * @param {mat3} m matrix to transform with
 * @returns {vec2} out
 */
function transformMat3(out, a, m) {
  var x = a[0],
    y = a[1];
  out[0] = m[0] * x + m[3] * y + m[6];
  out[1] = m[1] * x + m[4] * y + m[7];
  return out;
}

/**
 * Transforms the vec2 with a mat4
 * 3rd vector component is implicitly '0'
 * 4th vector component is implicitly '1'
 *
 * @param {vec2} out the receiving vector
 * @param {vec2} a the vector to transform
 * @param {mat4} m matrix to transform with
 * @returns {vec2} out
 */
function transformMat4(out, a, m) {
  let x = a[0];
  let y = a[1];
  out[0] = m[0] * x + m[4] * y + m[12];
  out[1] = m[1] * x + m[5] * y + m[13];
  return out;
}

/**
 * Returns a string representation of a vector
 *
 * @param {vec2} a vector to represent as a string
 * @returns {String} string representation of the vector
 */


/**
 * Returns whether or not the vectors exactly have the same elements in the same position (when compared with ===)
 *
 * @param {vec2} a The first vector.
 * @param {vec2} b The second vector.
 * @returns {Boolean} True if the vectors are equal, false otherwise.
 */
function exactEquals$1(a, b) {
  return a[0] === b[0] && a[1] === b[1];
}

/**
 * Returns whether or not the vectors have approximately the same elements in the same position.
 *
 * @param {vec2} a The first vector.
 * @param {vec2} b The second vector.
 * @returns {Boolean} True if the vectors are equal, false otherwise.
 */


/**
 * Alias for {@link vec2.length}
 * @function
 */


/**
 * Alias for {@link vec2.subtract}
 * @function
 */


/**
 * Alias for {@link vec2.multiply}
 * @function
 */


/**
 * Alias for {@link vec2.divide}
 * @function
 */


/**
 * Alias for {@link vec2.distance}
 * @function
 */


/**
 * Alias for {@link vec2.squaredDistance}
 * @function
 */


/**
 * Alias for {@link vec2.squaredLength}
 * @function
 */


/**
 * Perform some operation over an array of vec2s.
 *
 * @param {Array} a the array of vectors to iterate over
 * @param {Number} stride Number of elements between the start of each vec2. If 0 assumes tightly packed
 * @param {Number} offset Number of elements to skip at the beginning of the array
 * @param {Number} count Number of vec2s to iterate over. If 0 iterates over entire array
 * @param {Function} fn Function to call for each vector in the array
 * @param {Object} [arg] additional argument to pass to fn
 * @returns {Array} a
 * @function
 */
const forEach = (function() {
  let vec = create$1();

  return function(a, stride, offset, count, fn, arg) {
    let i, l;
    if(!stride) {
      stride = 2;
    }

    if(!offset) {
      offset = 0;
    }

    if(count) {
      l = Math.min((count * stride) + offset, a.length);
    } else {
      l = a.length;
    }

    for(i = offset; i < l; i += stride) {
      vec[0] = a[i]; vec[1] = a[i+1];
      fn(vec, vec, arg);
      a[i] = vec[0]; a[i+1] = vec[1];
    }

    return a;
  };
})();

class Vector2 extends Float32Array {
  constructor(x = 0, y = 0) {
    super(2);
    this.set(x, y);
    return this;
  }

  get x() {
    return this[0];
  }

  set x(value) {
    this[0] = value;
  }

  get y() {
    return this[1];
  }

  set y(value) {
    this[1] = value;
  }

  set(x, y) {
    set$1(this, x, y);
    return this;
  }

  copy(vector2) {
    copy$1(this, vector2);
    return this;
  }

  add(vector2) {
    add$1(this, this, vector2);
    return this;
  }

  get size() {
    return length(this);
  }

  get squaredSize() {
    return squaredLength(this);
  }

  subtract(vector2) {
    subtract$1(this, this, vector2);
    return this;
  }

  negate(vector2 = this) {
    negate(this, vector2);
    return this;
  }

  cross(vector2a, vector2b) {
    cross(this, vector2a, vector2b);
    return this;
  }

  scale(value) {
    scale$1(this, this, value);
    return this;
  }

  normalize() {
    normalize(this, this);
  }

  dot(vector2) {
    return dot(this, vector2);
  }

  equals(vector2) {
    return exactEquals$1(this, vector2);
  }

  applyMatrix3(matrix3) {
    transformMat3(this, this, matrix3);
    return this;
  }

  applyMatrix4(matrix4) {
    transformMat4(this, this, matrix4);
    return this;
  }

  lerp(vector2, value) {
    lerp(this, this, vector2, value);
  }

  clone() {
    return new Vector2(this.x, this.y);
  }
}

/* Copyright (c) 2015, Brandon Jones, Colin MacKenzie IV.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE. */

/**
 * 3 Dimensional Vector
 * @module vec3
 */

/**
 * Creates a new, empty vec3
 *
 * @returns {vec3} a new 3D vector
 */
function create$2() {
  let out = new ARRAY_TYPE(3);
  out[0] = 0;
  out[1] = 0;
  out[2] = 0;
  return out;
}

/**
 * Creates a new vec3 initialized with values from an existing vector
 *
 * @param {vec3} a vector to clone
 * @returns {vec3} a new 3D vector
 */


/**
 * Calculates the length of a vec3
 *
 * @param {vec3} a vector to calculate length of
 * @returns {Number} length of a
 */
function length$1(a) {
  let x = a[0];
  let y = a[1];
  let z = a[2];
  return Math.sqrt(x*x + y*y + z*z);
}

/**
 * Creates a new vec3 initialized with the given values
 *
 * @param {Number} x X component
 * @param {Number} y Y component
 * @param {Number} z Z component
 * @returns {vec3} a new 3D vector
 */
function fromValues$2(x, y, z) {
  let out = new ARRAY_TYPE(3);
  out[0] = x;
  out[1] = y;
  out[2] = z;
  return out;
}

/**
 * Copy the values from one vec3 to another
 *
 * @param {vec3} out the receiving vector
 * @param {vec3} a the source vector
 * @returns {vec3} out
 */
function copy$2(out, a) {
  out[0] = a[0];
  out[1] = a[1];
  out[2] = a[2];
  return out;
}

/**
 * Set the components of a vec3 to the given values
 *
 * @param {vec3} out the receiving vector
 * @param {Number} x X component
 * @param {Number} y Y component
 * @param {Number} z Z component
 * @returns {vec3} out
 */
function set$2(out, x, y, z) {
  out[0] = x;
  out[1] = y;
  out[2] = z;
  return out;
}

/**
 * Adds two vec3's
 *
 * @param {vec3} out the receiving vector
 * @param {vec3} a the first operand
 * @param {vec3} b the second operand
 * @returns {vec3} out
 */
function add$2(out, a, b) {
  out[0] = a[0] + b[0];
  out[1] = a[1] + b[1];
  out[2] = a[2] + b[2];
  return out;
}

/**
 * Subtracts vector b from vector a
 *
 * @param {vec3} out the receiving vector
 * @param {vec3} a the first operand
 * @param {vec3} b the second operand
 * @returns {vec3} out
 */
function subtract$2(out, a, b) {
  out[0] = a[0] - b[0];
  out[1] = a[1] - b[1];
  out[2] = a[2] - b[2];
  return out;
}

/**
 * Multiplies two vec3's
 *
 * @param {vec3} out the receiving vector
 * @param {vec3} a the first operand
 * @param {vec3} b the second operand
 * @returns {vec3} out
 */


/**
 * Divides two vec3's
 *
 * @param {vec3} out the receiving vector
 * @param {vec3} a the first operand
 * @param {vec3} b the second operand
 * @returns {vec3} out
 */


/**
 * Math.ceil the components of a vec3
 *
 * @param {vec3} out the receiving vector
 * @param {vec3} a vector to ceil
 * @returns {vec3} out
 */


/**
 * Math.floor the components of a vec3
 *
 * @param {vec3} out the receiving vector
 * @param {vec3} a vector to floor
 * @returns {vec3} out
 */


/**
 * Returns the minimum of two vec3's
 *
 * @param {vec3} out the receiving vector
 * @param {vec3} a the first operand
 * @param {vec3} b the second operand
 * @returns {vec3} out
 */


/**
 * Returns the maximum of two vec3's
 *
 * @param {vec3} out the receiving vector
 * @param {vec3} a the first operand
 * @param {vec3} b the second operand
 * @returns {vec3} out
 */


/**
 * Math.round the components of a vec3
 *
 * @param {vec3} out the receiving vector
 * @param {vec3} a vector to round
 * @returns {vec3} out
 */


/**
 * Scales a vec3 by a scalar number
 *
 * @param {vec3} out the receiving vector
 * @param {vec3} a the vector to scale
 * @param {Number} b amount to scale the vector by
 * @returns {vec3} out
 */
function scale$2(out, a, b) {
  out[0] = a[0] * b;
  out[1] = a[1] * b;
  out[2] = a[2] * b;
  return out;
}

/**
 * Adds two vec3's after scaling the second operand by a scalar value
 *
 * @param {vec3} out the receiving vector
 * @param {vec3} a the first operand
 * @param {vec3} b the second operand
 * @param {Number} scale the amount to scale b by before adding
 * @returns {vec3} out
 */


/**
 * Calculates the euclidian distance between two vec3's
 *
 * @param {vec3} a the first operand
 * @param {vec3} b the second operand
 * @returns {Number} distance between a and b
 */
function distance$1(a, b) {
  let x = b[0] - a[0];
  let y = b[1] - a[1];
  let z = b[2] - a[2];
  return Math.sqrt(x*x + y*y + z*z);
}

/**
 * Calculates the squared euclidian distance between two vec3's
 *
 * @param {vec3} a the first operand
 * @param {vec3} b the second operand
 * @returns {Number} squared distance between a and b
 */


/**
 * Calculates the squared length of a vec3
 *
 * @param {vec3} a vector to calculate squared length of
 * @returns {Number} squared length of a
 */
function squaredLength$1(a) {
  let x = a[0];
  let y = a[1];
  let z = a[2];
  return x*x + y*y + z*z;
}

/**
 * Negates the components of a vec3
 *
 * @param {vec3} out the receiving vector
 * @param {vec3} a vector to negate
 * @returns {vec3} out
 */
function negate$1(out, a) {
  out[0] = -a[0];
  out[1] = -a[1];
  out[2] = -a[2];
  return out;
}

/**
 * Returns the inverse of the components of a vec3
 *
 * @param {vec3} out the receiving vector
 * @param {vec3} a vector to invert
 * @returns {vec3} out
 */


/**
 * Normalize a vec3
 *
 * @param {vec3} out the receiving vector
 * @param {vec3} a vector to normalize
 * @returns {vec3} out
 */
function normalize$1(out, a) {
  let x = a[0];
  let y = a[1];
  let z = a[2];
  let len = x*x + y*y + z*z;
  if (len > 0) {
    //TODO: evaluate use of glm_invsqrt here?
    len = 1 / Math.sqrt(len);
    out[0] = a[0] * len;
    out[1] = a[1] * len;
    out[2] = a[2] * len;
  }
  return out;
}

/**
 * Calculates the dot product of two vec3's
 *
 * @param {vec3} a the first operand
 * @param {vec3} b the second operand
 * @returns {Number} dot product of a and b
 */
function dot$1(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/**
 * Computes the cross product of two vec3's
 *
 * @param {vec3} out the receiving vector
 * @param {vec3} a the first operand
 * @param {vec3} b the second operand
 * @returns {vec3} out
 */
function cross$1(out, a, b) {
  let ax = a[0], ay = a[1], az = a[2];
  let bx = b[0], by = b[1], bz = b[2];

  out[0] = ay * bz - az * by;
  out[1] = az * bx - ax * bz;
  out[2] = ax * by - ay * bx;
  return out;
}

/**
 * Performs a linear interpolation between two vec3's
 *
 * @param {vec3} out the receiving vector
 * @param {vec3} a the first operand
 * @param {vec3} b the second operand
 * @param {Number} t interpolation amount between the two inputs
 * @returns {vec3} out
 */


/**
 * Performs a hermite interpolation with two control points
 *
 * @param {vec3} out the receiving vector
 * @param {vec3} a the first operand
 * @param {vec3} b the second operand
 * @param {vec3} c the third operand
 * @param {vec3} d the fourth operand
 * @param {Number} t interpolation amount between the two inputs
 * @returns {vec3} out
 */


/**
 * Performs a bezier interpolation with two control points
 *
 * @param {vec3} out the receiving vector
 * @param {vec3} a the first operand
 * @param {vec3} b the second operand
 * @param {vec3} c the third operand
 * @param {vec3} d the fourth operand
 * @param {Number} t interpolation amount between the two inputs
 * @returns {vec3} out
 */


/**
 * Generates a random vector with the given scale
 *
 * @param {vec3} out the receiving vector
 * @param {Number} [scale] Length of the resulting vector. If ommitted, a unit vector will be returned
 * @returns {vec3} out
 */


/**
 * Transforms the vec3 with a mat4.
 * 4th vector component is implicitly '1'
 *
 * @param {vec3} out the receiving vector
 * @param {vec3} a the vector to transform
 * @param {mat4} m matrix to transform with
 * @returns {vec3} out
 */
function transformMat4$1(out, a, m) {
  let x = a[0], y = a[1], z = a[2];
  let w = m[3] * x + m[7] * y + m[11] * z + m[15];
  w = w || 1.0;
  out[0] = (m[0] * x + m[4] * y + m[8] * z + m[12]) / w;
  out[1] = (m[1] * x + m[5] * y + m[9] * z + m[13]) / w;
  out[2] = (m[2] * x + m[6] * y + m[10] * z + m[14]) / w;
  return out;
}

/**
 * Transforms the vec3 with a mat3.
 *
 * @param {vec3} out the receiving vector
 * @param {vec3} a the vector to transform
 * @param {mat3} m the 3x3 matrix to transform with
 * @returns {vec3} out
 */


/**
 * Transforms the vec3 with a quat
 *
 * @param {vec3} out the receiving vector
 * @param {vec3} a the vector to transform
 * @param {quat} q quaternion to transform with
 * @returns {vec3} out
 */


/**
 * Rotate a 3D vector around the x-axis
 * @param {vec3} out The receiving vec3
 * @param {vec3} a The vec3 point to rotate
 * @param {vec3} b The origin of the rotation
 * @param {Number} c The angle of rotation
 * @returns {vec3} out
 */


/**
 * Rotate a 3D vector around the y-axis
 * @param {vec3} out The receiving vec3
 * @param {vec3} a The vec3 point to rotate
 * @param {vec3} b The origin of the rotation
 * @param {Number} c The angle of rotation
 * @returns {vec3} out
 */


/**
 * Rotate a 3D vector around the z-axis
 * @param {vec3} out The receiving vec3
 * @param {vec3} a The vec3 point to rotate
 * @param {vec3} b The origin of the rotation
 * @param {Number} c The angle of rotation
 * @returns {vec3} out
 */


/**
 * Get the angle between two 3D vectors
 * @param {vec3} a The first operand
 * @param {vec3} b The second operand
 * @returns {Number} The angle in radians
 */
function angle(a, b) {
  let tempA = fromValues$2(a[0], a[1], a[2]);
  let tempB = fromValues$2(b[0], b[1], b[2]);

  normalize$1(tempA, tempA);
  normalize$1(tempB, tempB);

  let cosine = dot$1(tempA, tempB);

  if(cosine > 1.0) {
    return 0;
  }
  else if(cosine < -1.0) {
    return Math.PI;
  } else {
    return Math.acos(cosine);
  }
}

/**
 * Returns a string representation of a vector
 *
 * @param {vec3} a vector to represent as a string
 * @returns {String} string representation of the vector
 */


/**
 * Returns whether or not the vectors have exactly the same elements in the same position (when compared with ===)
 *
 * @param {vec3} a The first vector.
 * @param {vec3} b The second vector.
 * @returns {Boolean} True if the vectors are equal, false otherwise.
 */
function exactEquals$2(a, b) {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
}

/**
 * Returns whether or not the vectors have approximately the same elements in the same position.
 *
 * @param {vec3} a The first vector.
 * @param {vec3} b The second vector.
 * @returns {Boolean} True if the vectors are equal, false otherwise.
 */


/**
 * Alias for {@link vec3.subtract}
 * @function
 */


/**
 * Alias for {@link vec3.multiply}
 * @function
 */


/**
 * Alias for {@link vec3.divide}
 * @function
 */


/**
 * Alias for {@link vec3.distance}
 * @function
 */


/**
 * Alias for {@link vec3.squaredDistance}
 * @function
 */


/**
 * Alias for {@link vec3.length}
 * @function
 */
const len$1 = length$1;

/**
 * Alias for {@link vec3.squaredLength}
 * @function
 */


/**
 * Perform some operation over an array of vec3s.
 *
 * @param {Array} a the array of vectors to iterate over
 * @param {Number} stride Number of elements between the start of each vec3. If 0 assumes tightly packed
 * @param {Number} offset Number of elements to skip at the beginning of the array
 * @param {Number} count Number of vec3s to iterate over. If 0 iterates over entire array
 * @param {Function} fn Function to call for each vector in the array
 * @param {Object} [arg] additional argument to pass to fn
 * @returns {Array} a
 * @function
 */
const forEach$1 = (function() {
  let vec = create$2();

  return function(a, stride, offset, count, fn, arg) {
    let i, l;
    if(!stride) {
      stride = 3;
    }

    if(!offset) {
      offset = 0;
    }

    if(count) {
      l = Math.min((count * stride) + offset, a.length);
    } else {
      l = a.length;
    }

    for(i = offset; i < l; i += stride) {
      vec[0] = a[i]; vec[1] = a[i+1]; vec[2] = a[i+2];
      fn(vec, vec, arg);
      a[i] = vec[0]; a[i+1] = vec[1]; a[i+2] = vec[2];
    }

    return a;
  };
})();

class Vector3 extends Float32Array {
  constructor(array = [0, 0, 0]) {
    super(array);
    return this;
  }

  get x() {
    return this[0];
  }

  set x(value) {
    this[0] = value;
  }

  get y() {
    return this[1];
  }

  set y(value) {
    this[1] = value;
  }

  get z() {
    return this[2];
  }

  set z(value) {
    this[2] = value;
  }

  set(x, y, z) {
    set$2(this, x, y, z);
    return this;
  }

  copy(vector3) {
    copy$2(this, vector3);
    return this;
  }

  add(vector3) {
    add$2(this, this, vector3);
    return this;
  }

  get size() {
    return length$1(this);
  }

  get squaredSize() {
    return squaredLength$1(this);
  }

  distance(vector3) {
    return distance$1(this, vector3);
  }

  subtract(vector3) {
    subtract$2(this, this, vector3);
    return this;
  }

  negate(vector3 = this) {
    negate$1(this, vector3);
    return this;
  }

  cross(vector3a, vector3b) {
    cross$1(this, vector3a, vector3b);
    return this;
  }

  scale(value) {
    scale$2(this, this, value);
    return this;
  }

  normalize() {
    normalize$1(this, this);
    return this;
  }

  dot(vector3) {
    return dot$1(this, vector3);
  }

  equals(vector3) {
    return exactEquals$2(this, vector3);
  }

  applyMatrix4(matrix4) {
    transformMat4$1(this, this, matrix4);
    return this;
  }

  angle(vector3) {
    return angle(this, vector3);
  }

  clone() {
    return new Vector3(this.x, this.y, this.z);
  }
}

/* Copyright (c) 2015, Brandon Jones, Colin MacKenzie IV.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE. */

/**
 * 4 Dimensional Vector
 * @module vec4
 */

/**
 * Creates a new, empty vec4
 *
 * @returns {vec4} a new 4D vector
 */
function create$3() {
  let out = new ARRAY_TYPE(4);
  out[0] = 0;
  out[1] = 0;
  out[2] = 0;
  out[3] = 0;
  return out;
}

/**
 * Creates a new vec4 initialized with values from an existing vector
 *
 * @param {vec4} a vector to clone
 * @returns {vec4} a new 4D vector
 */


/**
 * Creates a new vec4 initialized with the given values
 *
 * @param {Number} x X component
 * @param {Number} y Y component
 * @param {Number} z Z component
 * @param {Number} w W component
 * @returns {vec4} a new 4D vector
 */


/**
 * Copy the values from one vec4 to another
 *
 * @param {vec4} out the receiving vector
 * @param {vec4} a the source vector
 * @returns {vec4} out
 */
function copy$3(out, a) {
  out[0] = a[0];
  out[1] = a[1];
  out[2] = a[2];
  out[3] = a[3];
  return out;
}

/**
 * Set the components of a vec4 to the given values
 *
 * @param {vec4} out the receiving vector
 * @param {Number} x X component
 * @param {Number} y Y component
 * @param {Number} z Z component
 * @param {Number} w W component
 * @returns {vec4} out
 */
function set$3(out, x, y, z, w) {
  out[0] = x;
  out[1] = y;
  out[2] = z;
  out[3] = w;
  return out;
}

/**
 * Adds two vec4's
 *
 * @param {vec4} out the receiving vector
 * @param {vec4} a the first operand
 * @param {vec4} b the second operand
 * @returns {vec4} out
 */


/**
 * Subtracts vector b from vector a
 *
 * @param {vec4} out the receiving vector
 * @param {vec4} a the first operand
 * @param {vec4} b the second operand
 * @returns {vec4} out
 */


/**
 * Multiplies two vec4's
 *
 * @param {vec4} out the receiving vector
 * @param {vec4} a the first operand
 * @param {vec4} b the second operand
 * @returns {vec4} out
 */


/**
 * Divides two vec4's
 *
 * @param {vec4} out the receiving vector
 * @param {vec4} a the first operand
 * @param {vec4} b the second operand
 * @returns {vec4} out
 */


/**
 * Math.ceil the components of a vec4
 *
 * @param {vec4} out the receiving vector
 * @param {vec4} a vector to ceil
 * @returns {vec4} out
 */


/**
 * Math.floor the components of a vec4
 *
 * @param {vec4} out the receiving vector
 * @param {vec4} a vector to floor
 * @returns {vec4} out
 */


/**
 * Returns the minimum of two vec4's
 *
 * @param {vec4} out the receiving vector
 * @param {vec4} a the first operand
 * @param {vec4} b the second operand
 * @returns {vec4} out
 */


/**
 * Returns the maximum of two vec4's
 *
 * @param {vec4} out the receiving vector
 * @param {vec4} a the first operand
 * @param {vec4} b the second operand
 * @returns {vec4} out
 */


/**
 * Math.round the components of a vec4
 *
 * @param {vec4} out the receiving vector
 * @param {vec4} a vector to round
 * @returns {vec4} out
 */


/**
 * Scales a vec4 by a scalar number
 *
 * @param {vec4} out the receiving vector
 * @param {vec4} a the vector to scale
 * @param {Number} b amount to scale the vector by
 * @returns {vec4} out
 */


/**
 * Adds two vec4's after scaling the second operand by a scalar value
 *
 * @param {vec4} out the receiving vector
 * @param {vec4} a the first operand
 * @param {vec4} b the second operand
 * @param {Number} scale the amount to scale b by before adding
 * @returns {vec4} out
 */


/**
 * Calculates the euclidian distance between two vec4's
 *
 * @param {vec4} a the first operand
 * @param {vec4} b the second operand
 * @returns {Number} distance between a and b
 */


/**
 * Calculates the squared euclidian distance between two vec4's
 *
 * @param {vec4} a the first operand
 * @param {vec4} b the second operand
 * @returns {Number} squared distance between a and b
 */


/**
 * Calculates the length of a vec4
 *
 * @param {vec4} a vector to calculate length of
 * @returns {Number} length of a
 */


/**
 * Calculates the squared length of a vec4
 *
 * @param {vec4} a vector to calculate squared length of
 * @returns {Number} squared length of a
 */


/**
 * Negates the components of a vec4
 *
 * @param {vec4} out the receiving vector
 * @param {vec4} a vector to negate
 * @returns {vec4} out
 */


/**
 * Returns the inverse of the components of a vec4
 *
 * @param {vec4} out the receiving vector
 * @param {vec4} a vector to invert
 * @returns {vec4} out
 */


/**
 * Normalize a vec4
 *
 * @param {vec4} out the receiving vector
 * @param {vec4} a vector to normalize
 * @returns {vec4} out
 */
function normalize$2(out, a) {
  let x = a[0];
  let y = a[1];
  let z = a[2];
  let w = a[3];
  let len = x*x + y*y + z*z + w*w;
  if (len > 0) {
    len = 1 / Math.sqrt(len);
    out[0] = x * len;
    out[1] = y * len;
    out[2] = z * len;
    out[3] = w * len;
  }
  return out;
}

/**
 * Calculates the dot product of two vec4's
 *
 * @param {vec4} a the first operand
 * @param {vec4} b the second operand
 * @returns {Number} dot product of a and b
 */


/**
 * Performs a linear interpolation between two vec4's
 *
 * @param {vec4} out the receiving vector
 * @param {vec4} a the first operand
 * @param {vec4} b the second operand
 * @param {Number} t interpolation amount between the two inputs
 * @returns {vec4} out
 */


/**
 * Generates a random vector with the given scale
 *
 * @param {vec4} out the receiving vector
 * @param {Number} [scale] Length of the resulting vector. If ommitted, a unit vector will be returned
 * @returns {vec4} out
 */


/**
 * Transforms the vec4 with a mat4.
 *
 * @param {vec4} out the receiving vector
 * @param {vec4} a the vector to transform
 * @param {mat4} m matrix to transform with
 * @returns {vec4} out
 */


/**
 * Transforms the vec4 with a quat
 *
 * @param {vec4} out the receiving vector
 * @param {vec4} a the vector to transform
 * @param {quat} q quaternion to transform with
 * @returns {vec4} out
 */


/**
 * Returns a string representation of a vector
 *
 * @param {vec4} a vector to represent as a string
 * @returns {String} string representation of the vector
 */


/**
 * Returns whether or not the vectors have exactly the same elements in the same position (when compared with ===)
 *
 * @param {vec4} a The first vector.
 * @param {vec4} b The second vector.
 * @returns {Boolean} True if the vectors are equal, false otherwise.
 */


/**
 * Returns whether or not the vectors have approximately the same elements in the same position.
 *
 * @param {vec4} a The first vector.
 * @param {vec4} b The second vector.
 * @returns {Boolean} True if the vectors are equal, false otherwise.
 */


/**
 * Alias for {@link vec4.subtract}
 * @function
 */


/**
 * Alias for {@link vec4.multiply}
 * @function
 */


/**
 * Alias for {@link vec4.divide}
 * @function
 */


/**
 * Alias for {@link vec4.distance}
 * @function
 */


/**
 * Alias for {@link vec4.squaredDistance}
 * @function
 */


/**
 * Alias for {@link vec4.length}
 * @function
 */


/**
 * Alias for {@link vec4.squaredLength}
 * @function
 */


/**
 * Perform some operation over an array of vec4s.
 *
 * @param {Array} a the array of vectors to iterate over
 * @param {Number} stride Number of elements between the start of each vec4. If 0 assumes tightly packed
 * @param {Number} offset Number of elements to skip at the beginning of the array
 * @param {Number} count Number of vec4s to iterate over. If 0 iterates over entire array
 * @param {Function} fn Function to call for each vector in the array
 * @param {Object} [arg] additional argument to pass to fn
 * @returns {Array} a
 * @function
 */
const forEach$2 = (function() {
  let vec = create$3();

  return function(a, stride, offset, count, fn, arg) {
    let i, l;
    if(!stride) {
      stride = 4;
    }

    if(!offset) {
      offset = 0;
    }

    if(count) {
      l = Math.min((count * stride) + offset, a.length);
    } else {
      l = a.length;
    }

    for(i = offset; i < l; i += stride) {
      vec[0] = a[i]; vec[1] = a[i+1]; vec[2] = a[i+2]; vec[3] = a[i+3];
      fn(vec, vec, arg);
      a[i] = vec[0]; a[i+1] = vec[1]; a[i+2] = vec[2]; a[i+3] = vec[3];
    }

    return a;
  };
})();

class Vector4 extends Float32Array {
  constructor(array = [0, 0, 0, 0]) {
    super(array);
    return this;
  }

  get x() {
    return this[0];
  }

  set x(value) {
    this[0] = value;
  }

  get y() {
    return this[1];
  }

  set y(value) {
    this[1] = value;
  }

  get z() {
    return this[2];
  }

  set z(value) {
    this[2] = value;
  }

  get w() {
    return this[3];
  }

  set w(value) {
    this[3] = value;
  }

  set(x, y, z, w) {
    set$3(this, x, y, z, w);
    return this;
  }
}

/* Copyright (c) 2015, Brandon Jones, Colin MacKenzie IV.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE. */

/**
 * 3x3 Matrix
 * @module mat3
 */

/**
 * Creates a new identity mat3
 *
 * @returns {mat3} a new 3x3 matrix
 */
function create$4() {
  let out = new ARRAY_TYPE(9);
  out[0] = 1;
  out[1] = 0;
  out[2] = 0;
  out[3] = 0;
  out[4] = 1;
  out[5] = 0;
  out[6] = 0;
  out[7] = 0;
  out[8] = 1;
  return out;
}

/**
 * Copies the upper-left 3x3 values into the given mat3.
 *
 * @param {mat3} out the receiving 3x3 matrix
 * @param {mat4} a   the source 4x4 matrix
 * @returns {mat3} out
 */
function fromMat4(out, a) {
  out[0] = a[0];
  out[1] = a[1];
  out[2] = a[2];
  out[3] = a[4];
  out[4] = a[5];
  out[5] = a[6];
  out[6] = a[8];
  out[7] = a[9];
  out[8] = a[10];
  return out;
}

/**
 * Creates a new mat3 initialized with values from an existing matrix
 *
 * @param {mat3} a matrix to clone
 * @returns {mat3} a new 3x3 matrix
 */


/**
 * Copy the values from one mat3 to another
 *
 * @param {mat3} out the receiving matrix
 * @param {mat3} a the source matrix
 * @returns {mat3} out
 */
function copy$4(out, a) {
  out[0] = a[0];
  out[1] = a[1];
  out[2] = a[2];
  out[3] = a[3];
  out[4] = a[4];
  out[5] = a[5];
  out[6] = a[6];
  out[7] = a[7];
  out[8] = a[8];
  return out;
}

/**
 * Create a new mat3 with the given values
 *
 * @param {Number} m00 Component in column 0, row 0 position (index 0)
 * @param {Number} m01 Component in column 0, row 1 position (index 1)
 * @param {Number} m02 Component in column 0, row 2 position (index 2)
 * @param {Number} m10 Component in column 1, row 0 position (index 3)
 * @param {Number} m11 Component in column 1, row 1 position (index 4)
 * @param {Number} m12 Component in column 1, row 2 position (index 5)
 * @param {Number} m20 Component in column 2, row 0 position (index 6)
 * @param {Number} m21 Component in column 2, row 1 position (index 7)
 * @param {Number} m22 Component in column 2, row 2 position (index 8)
 * @returns {mat3} A new mat3
 */


/**
 * Set the components of a mat3 to the given values
 *
 * @param {mat3} out the receiving matrix
 * @param {Number} m00 Component in column 0, row 0 position (index 0)
 * @param {Number} m01 Component in column 0, row 1 position (index 1)
 * @param {Number} m02 Component in column 0, row 2 position (index 2)
 * @param {Number} m10 Component in column 1, row 0 position (index 3)
 * @param {Number} m11 Component in column 1, row 1 position (index 4)
 * @param {Number} m12 Component in column 1, row 2 position (index 5)
 * @param {Number} m20 Component in column 2, row 0 position (index 6)
 * @param {Number} m21 Component in column 2, row 1 position (index 7)
 * @param {Number} m22 Component in column 2, row 2 position (index 8)
 * @returns {mat3} out
 */
function set$4(out, m00, m01, m02, m10, m11, m12, m20, m21, m22) {
  out[0] = m00;
  out[1] = m01;
  out[2] = m02;
  out[3] = m10;
  out[4] = m11;
  out[5] = m12;
  out[6] = m20;
  out[7] = m21;
  out[8] = m22;
  return out;
}

/**
 * Set a mat3 to the identity matrix
 *
 * @param {mat3} out the receiving matrix
 * @returns {mat3} out
 */
function identity$1(out) {
  out[0] = 1;
  out[1] = 0;
  out[2] = 0;
  out[3] = 0;
  out[4] = 1;
  out[5] = 0;
  out[6] = 0;
  out[7] = 0;
  out[8] = 1;
  return out;
}

/**
 * Transpose the values of a mat3
 *
 * @param {mat3} out the receiving matrix
 * @param {mat3} a the source matrix
 * @returns {mat3} out
 */


/**
 * Inverts a mat3
 *
 * @param {mat3} out the receiving matrix
 * @param {mat3} a the source matrix
 * @returns {mat3} out
 */
function invert$1(out, a) {
  let a00 = a[0], a01 = a[1], a02 = a[2];
  let a10 = a[3], a11 = a[4], a12 = a[5];
  let a20 = a[6], a21 = a[7], a22 = a[8];

  let b01 = a22 * a11 - a12 * a21;
  let b11 = -a22 * a10 + a12 * a20;
  let b21 = a21 * a10 - a11 * a20;

  // Calculate the determinant
  let det = a00 * b01 + a01 * b11 + a02 * b21;

  if (!det) {
    return null;
  }
  det = 1.0 / det;

  out[0] = b01 * det;
  out[1] = (-a22 * a01 + a02 * a21) * det;
  out[2] = (a12 * a01 - a02 * a11) * det;
  out[3] = b11 * det;
  out[4] = (a22 * a00 - a02 * a20) * det;
  out[5] = (-a12 * a00 + a02 * a10) * det;
  out[6] = b21 * det;
  out[7] = (-a21 * a00 + a01 * a20) * det;
  out[8] = (a11 * a00 - a01 * a10) * det;
  return out;
}

/**
 * Calculates the adjugate of a mat3
 *
 * @param {mat3} out the receiving matrix
 * @param {mat3} a the source matrix
 * @returns {mat3} out
 */


/**
 * Calculates the determinant of a mat3
 *
 * @param {mat3} a the source matrix
 * @returns {Number} determinant of a
 */


/**
 * Multiplies two mat3's
 *
 * @param {mat3} out the receiving matrix
 * @param {mat3} a the first operand
 * @param {mat3} b the second operand
 * @returns {mat3} out
 */
function multiply$4(out, a, b) {
  let a00 = a[0], a01 = a[1], a02 = a[2];
  let a10 = a[3], a11 = a[4], a12 = a[5];
  let a20 = a[6], a21 = a[7], a22 = a[8];

  let b00 = b[0], b01 = b[1], b02 = b[2];
  let b10 = b[3], b11 = b[4], b12 = b[5];
  let b20 = b[6], b21 = b[7], b22 = b[8];

  out[0] = b00 * a00 + b01 * a10 + b02 * a20;
  out[1] = b00 * a01 + b01 * a11 + b02 * a21;
  out[2] = b00 * a02 + b01 * a12 + b02 * a22;

  out[3] = b10 * a00 + b11 * a10 + b12 * a20;
  out[4] = b10 * a01 + b11 * a11 + b12 * a21;
  out[5] = b10 * a02 + b11 * a12 + b12 * a22;

  out[6] = b20 * a00 + b21 * a10 + b22 * a20;
  out[7] = b20 * a01 + b21 * a11 + b22 * a21;
  out[8] = b20 * a02 + b21 * a12 + b22 * a22;
  return out;
}

/**
 * Translate a mat3 by the given vector
 *
 * @param {mat3} out the receiving matrix
 * @param {mat3} a the matrix to translate
 * @param {vec2} v vector to translate by
 * @returns {mat3} out
 */
function translate$1(out, a, v) {
  let a00 = a[0], a01 = a[1], a02 = a[2],
    a10 = a[3], a11 = a[4], a12 = a[5],
    a20 = a[6], a21 = a[7], a22 = a[8],
    x = v[0], y = v[1];

  out[0] = a00;
  out[1] = a01;
  out[2] = a02;

  out[3] = a10;
  out[4] = a11;
  out[5] = a12;

  out[6] = x * a00 + y * a10 + a20;
  out[7] = x * a01 + y * a11 + a21;
  out[8] = x * a02 + y * a12 + a22;
  return out;
}

/**
 * Rotates a mat3 by the given angle
 *
 * @param {mat3} out the receiving matrix
 * @param {mat3} a the matrix to rotate
 * @param {Number} rad the angle to rotate the matrix by
 * @returns {mat3} out
 */
function rotate$1(out, a, rad) {
  let a00 = a[0], a01 = a[1], a02 = a[2],
    a10 = a[3], a11 = a[4], a12 = a[5],
    a20 = a[6], a21 = a[7], a22 = a[8],

    s = Math.sin(rad),
    c = Math.cos(rad);

  out[0] = c * a00 + s * a10;
  out[1] = c * a01 + s * a11;
  out[2] = c * a02 + s * a12;

  out[3] = c * a10 - s * a00;
  out[4] = c * a11 - s * a01;
  out[5] = c * a12 - s * a02;

  out[6] = a20;
  out[7] = a21;
  out[8] = a22;
  return out;
}

/**
 * Scales the mat3 by the dimensions in the given vec2
 *
 * @param {mat3} out the receiving matrix
 * @param {mat3} a the matrix to rotate
 * @param {vec2} v the vec2 to scale the matrix by
 * @returns {mat3} out
 **/
function scale$4(out, a, v) {
  let x = v[0], y = v[1];

  out[0] = x * a[0];
  out[1] = x * a[1];
  out[2] = x * a[2];

  out[3] = y * a[3];
  out[4] = y * a[4];
  out[5] = y * a[5];

  out[6] = a[6];
  out[7] = a[7];
  out[8] = a[8];
  return out;
}

/**
 * Creates a matrix from a vector translation
 * This is equivalent to (but much faster than):
 *
 *     mat3.identity(dest);
 *     mat3.translate(dest, dest, vec);
 *
 * @param {mat3} out mat3 receiving operation result
 * @param {vec2} v Translation vector
 * @returns {mat3} out
 */


/**
 * Creates a matrix from a given angle
 * This is equivalent to (but much faster than):
 *
 *     mat3.identity(dest);
 *     mat3.rotate(dest, dest, rad);
 *
 * @param {mat3} out mat3 receiving operation result
 * @param {Number} rad the angle to rotate the matrix by
 * @returns {mat3} out
 */


/**
 * Creates a matrix from a vector scaling
 * This is equivalent to (but much faster than):
 *
 *     mat3.identity(dest);
 *     mat3.scale(dest, dest, vec);
 *
 * @param {mat3} out mat3 receiving operation result
 * @param {vec2} v Scaling vector
 * @returns {mat3} out
 */


/**
 * Copies the values from a mat2d into a mat3
 *
 * @param {mat3} out the receiving matrix
 * @param {mat2d} a the matrix to copy
 * @returns {mat3} out
 **/


/**
* Calculates a 3x3 matrix from the given quaternion
*
* @param {mat3} out mat3 receiving operation result
* @param {quat} q Quaternion to create matrix from
*
* @returns {mat3} out
*/
function fromQuat$1(out, q) {
  let x = q[0], y = q[1], z = q[2], w = q[3];
  let x2 = x + x;
  let y2 = y + y;
  let z2 = z + z;

  let xx = x * x2;
  let yx = y * x2;
  let yy = y * y2;
  let zx = z * x2;
  let zy = z * y2;
  let zz = z * z2;
  let wx = w * x2;
  let wy = w * y2;
  let wz = w * z2;

  out[0] = 1 - yy - zz;
  out[3] = yx - wz;
  out[6] = zx + wy;

  out[1] = yx + wz;
  out[4] = 1 - xx - zz;
  out[7] = zy - wx;

  out[2] = zx - wy;
  out[5] = zy + wx;
  out[8] = 1 - xx - yy;

  return out;
}

/**
* Calculates a 3x3 normal matrix (transpose inverse) from the 4x4 matrix
*
* @param {mat3} out mat3 receiving operation result
* @param {mat4} a Mat4 to derive the normal matrix from
*
* @returns {mat3} out
*/


/**
 * Generates a 2D projection matrix with the given bounds
 *
 * @param {mat3} out mat3 frustum matrix will be written into
 * @param {number} width Width of your gl context
 * @param {number} height Height of gl context
 * @returns {mat3} out
 */


/**
 * Returns a string representation of a mat3
 *
 * @param {mat3} a matrix to represent as a string
 * @returns {String} string representation of the matrix
 */


/**
 * Returns Frobenius norm of a mat3
 *
 * @param {mat3} a the matrix to calculate Frobenius norm of
 * @returns {Number} Frobenius norm
 */


/**
 * Adds two mat3's
 *
 * @param {mat3} out the receiving matrix
 * @param {mat3} a the first operand
 * @param {mat3} b the second operand
 * @returns {mat3} out
 */


/**
 * Subtracts matrix b from matrix a
 *
 * @param {mat3} out the receiving matrix
 * @param {mat3} a the first operand
 * @param {mat3} b the second operand
 * @returns {mat3} out
 */




/**
 * Multiply each element of the matrix by a scalar.
 *
 * @param {mat3} out the receiving matrix
 * @param {mat3} a the matrix to scale
 * @param {Number} b amount to scale the matrix's elements by
 * @returns {mat3} out
 */


/**
 * Adds two mat3's after multiplying each element of the second operand by a scalar value.
 *
 * @param {mat3} out the receiving vector
 * @param {mat3} a the first operand
 * @param {mat3} b the second operand
 * @param {Number} scale the amount to scale b's elements by before adding
 * @returns {mat3} out
 */


/**
 * Returns whether or not the matrices have exactly the same elements in the same position (when compared with ===)
 *
 * @param {mat3} a The first matrix.
 * @param {mat3} b The second matrix.
 * @returns {Boolean} True if the matrices are equal, false otherwise.
 */


/**
 * Returns whether or not the matrices have approximately the same elements in the same position.
 *
 * @param {mat3} a The first matrix.
 * @param {mat3} b The second matrix.
 * @returns {Boolean} True if the matrices are equal, false otherwise.
 */


/**
 * Alias for {@link mat3.multiply}
 * @function
 */


/**
 * Alias for {@link mat3.subtract}
 * @function
 */

class Matrix3 extends Float32Array {
  constructor(array = [1, 0, 0, 0, 1, 0, 0, 0, 1]) {
    super(array);
    return this;
  }

  set(m00, m01, m02, m10, m11, m12, m20, m21, m22) {
    set$4(this, m00, m01, m02, m10, m11, m12, m20, m21, m22);
    return this;
  }

  translate(vector2, matrix3 = this) {
    translate$1(this, matrix3, vector2);
    return this;
  }

  rotate(value, matrix3 = this) {
    rotate$1(this, matrix3, value);
    return this;
  }

  scale(vector2, matrix3 = this) {
    scale$4(this, matrix3, vector2);
    return this;
  }

  multiply(matrix3a, matrix3b) {
    if (matrix3b) {
      multiply$4(this, matrix3a, matrix3b);
    } else {
      multiply$4(this, this, matrix3a);
    }
    return this;
  }

  identity() {
    identity$1(this);
    return this;
  }

  copy(matrix3) {
    copy$4(this, matrix3);
    return this;
  }

  fromMatrix4(matrix4) {
    fromMat4(this, matrix4);
    return this;
  }

  fromQuaternion(quaternion) {
    fromQuat$1(this, quaternion);
    return this;
  }

  fromBasis(vector3a, vector3b, vector3c) {
    this.set(
      vector3a[0],
      vector3a[1],
      vector3a[2],
      vector3b[0],
      vector3b[1],
      vector3b[2],
      vector3c[0],
      vector3c[1],
      vector3c[2]
    );
    return this;
  }

  invert(matrix3 = this) {
    invert$1(this, matrix3);
    return this;
  }
}

class Shader {
  static add(string = "void main() {}", chunks) {
    for (let [key, chunk] of chunks) {
      switch (key) {
        case "start":
          string = string.replace(/(#version .*?)\n([\s\S]*)/, `$1\n${chunk}\n$2`);
          break;
        case "end":
          string = string.replace(/(}\s*$)/, `\n${chunk}\n$1`);
          break;
        case "main":
          string = string.replace(/(\bvoid\b +\bmain\b[\s\S]*?{\s*)/, `$1\n${chunk}\n`);
          break;
        default:
          string = string.replace(key, chunk);
      }
    }

    return string;
  }

  constructor({vertexShader = `#version 300 es
    void main() {
      gl_Position = vec4(0., 0., 0., 1.);
    }
  `, fragmentShader = `#version 300 es
    precision highp float;

    out vec4 fragColor;

    void main() {
      fragColor = vec4(1.);
    }
  `, uniforms = [], vertexShaderChunks = [], fragmentShaderChunks = [], shaders = []} = {}) {
    this.uniforms = new Map();
    this.uniformTypes = new Map();

    this.vertexShader = vertexShader;
    this.fragmentShader = fragmentShader;
    this._vertexShaderChunks = [];
    this._fragmentShaderChunks = [];

    this.add({vertexShaderChunks, fragmentShaderChunks, uniforms});

    for (let shader of shaders) {
      this.add(shader);
    }
  }

  add({vertexShaderChunks = [], fragmentShaderChunks = [], uniforms = []} = {}) {
    this.vertexShader = Shader.add(this.vertexShader, vertexShaderChunks);
    this._vertexShaderChunks.push(...vertexShaderChunks);
    this.fragmentShader = Shader.add(this.fragmentShader, fragmentShaderChunks);
    this._fragmentShaderChunks.push(...fragmentShaderChunks);
    for (let [key, value] of uniforms) {
      this.uniforms.set(key, value);
    }
  }

  set vertexShader(value) {
    this._vertexShader = value;
    this._parseUniforms(this._vertexShader);
  }

  get vertexShader() {
    return this._vertexShader;
  }

  set fragmentShader(value) {
    this._fragmentShader = value;
    this._parseUniforms(this._fragmentShader);
  }

  get fragmentShader() {
    return this._fragmentShader;
  }

  get vertexShaderChunks() {
    return this._vertexShaderChunks;
  }

  get fragmentShaderChunks() {
    return this._fragmentShaderChunks;
  }

  /**
   * Parse shader strings to extract uniforms
   */
  _parseUniforms(string, classes) {
    classes = Object.assign({
      Vector2: class Vector2 extends Float32Array {constructor() {super(2);}},
      Vector3: class Vector3 extends Float32Array {constructor() {super(3);}},
      Vector4: class Vector4 extends Float32Array {constructor() {super(4);}},
      Matrix3: class Matrix3 extends Float32Array {constructor() {super([1, 0, 0, 0, 1, 0, 0, 0, 1]);}},
      Matrix4: class Matrix3 extends Float32Array {constructor() {super([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);}},
      Texture: class Texture {},
      TextureCube: class TextureCube {}
    }, classes);

    let regExp = /^\s*uniform (.[^ ]+) (.[^ ;\[\]]+)\[? *(\d+)? *\]?/gm;

    let match;

    while ((match = regExp.exec(string))) {
      let [, glslType, variableName, lengthStr] = match;
      let length = parseInt(lengthStr);

      if (this.uniforms.has(variableName)) {
        continue;
      }

      let value;
      let typeMatch;

      this.uniformTypes.set(variableName, glslType);

      if (/float|double/.test(glslType)) {
        if (isNaN(length)) {
          value = 0;
        } else {
          value = new Array(length).fill(0);
        }
      } else if (/int|uint/.test(glslType)) {
        if (isNaN(length)) {
          value = 0;
        } else {
          value = new Array(length).fill(0);
        }
      } else if (/sampler2D/.test(glslType)) {
        if (isNaN(length)) {
          value = new classes.Texture();
        } else {
          value = new Array(length).fill().map(value => new classes.Texture());
        }
      } else if (/samplerCube/.test(glslType)) {
        if (isNaN(length)) {
          value = new classes.TextureCube();
        } else {
          value = new Array(length).fill().map(value => new classes.TextureCube());
        }
      } else if( (typeMatch = /(.?)vec(\d)/.exec(glslType)) ) {
        let vectorLength = typeMatch[2];
        if (isNaN(length)) {
          value = new classes[`Vector${vectorLength}`]();
        } else {
          value = new Array(length).fill().map(value => new classes[`Vector${vectorLength}`]());
        }
      } else if( (typeMatch = /mat(\d)/.exec(glslType)) ) {
        let matrixLength = typeMatch[1];
        if (isNaN(length)) {
          value = new classes[`Matrix${matrixLength}`]();
        } else {
          value = new Array(length).fill().map(value => new classes[`Matrix${matrixLength}`]());
        }
      } else {
        value = undefined;
      }

      this.uniforms.set(variableName, value);
    }
  }
}

class GLTexture {
  constructor({
    gl, 
    data = null, 
    width = undefined,
    height = undefined,
    target = (data && data.length) ? gl.TEXTURE_CUBE_MAP : gl.TEXTURE_2D,
    level = 0,
    internalformat = gl.RGBA,
    format = gl.RGBA,
    type = gl.UNSIGNED_BYTE,
    minFilter = gl.NEAREST_MIPMAP_LINEAR, 
    magFilter = gl.LINEAR, 
    wrapS = gl.REPEAT, 
    wrapT = gl.REPEAT
  } = {}) {
    this.gl = gl;
    this._texture = this.gl.createTexture();
    this._width = width;
    this._height = height;
    this._dataWidth = undefined;
    this._dataHeight = undefined;
    this._target = target;
    
    this.level = level;
    this.internalformat = internalformat;
    this.format = format;
    this.type = type;
    this.minFilter = minFilter;
    this.magFilter = magFilter;
    this.wrapS = wrapS;
    this.wrapT = wrapT;
    this.data = data;
  }

  generateMipmap() {
    this.bind();
    this.gl.generateMipmap(this._target);
    this.unbind();
  }

  set data(value) {
    this._data = value;

    if(!this._data && !(this._width && this._height)) {
      return;
    }

    const data = (this._data && this._data.length) ? this._data : [this._data];

    if(data[0]) {
      this._dataWidth = data[0].width || data[0].videoWidth;
      this._dataHeight = data[0].height || data[0].videoHeight;
    }

    const count = this._target === this.gl.TEXTURE_CUBE_MAP ? 6 : 1;
    const target = this._target === this.gl.TEXTURE_CUBE_MAP ? this.gl.TEXTURE_CUBE_MAP_POSITIVE_X : this._target;

    this.bind();
    for (let i = 0; i < data.length; i++) {
      if(this.gl.getParameter(this.gl.VERSION).startsWith("WebGL 1.0") && this._dataWidth) {
        this.gl.texImage2D(target + i, this.level, this.internalformat, this.format, this.type, data[i]);
      } else {
        this.gl.texImage2D(target + i, this.level, this.internalformat, this.width, this.height, 0, this.format, this.type, data[i]);
      }
    }
    this.unbind();
  }

  get data() {
    return this._data;
  }

  set width(value) {
    this._width = value;
    this.data = this.data;
  }

  get width() {
    return this._width || this._dataWidth;
  }

  set height(value) {
    this._height = value;
    this.data = this.data;
  }

  get height() {
    return this._height || this._dataHeight;
  }

  set minFilter(value) {
    if(this._minFilter === value) {
      return;
    }
    this._minFilter = value;
    this.bind();
    this.gl.texParameteri(this._target, this.gl.TEXTURE_MIN_FILTER, this._minFilter);
    this.unbind();
  }

  get minFilter() {
    return this._minFilter;
  }

  set magFilter(value) {
    if(this._magFilter === value) {
      return;
    }
    this._magFilter = value;
    this.bind();
    this.gl.texParameteri(this._target, this.gl.TEXTURE_MAG_FILTER, this._magFilter);
    this.unbind();
  }

  get magFilter() {
    return this._magFilter;
  }

  set wrapS(value) {
    if(this._wrapS === value) {
      return;
    }
    this._wrapS = value;
    this.bind();
    this.gl.texParameteri(this._target, this.gl.TEXTURE_WRAP_S, this._wrapS);
    this.unbind();
  }

  get wrapS() {
    return this._wrapS;
  }

  set wrapT(value) {
    if(this._wrapT === value) {
      return;
    }
    this._wrapT = value;
    this.bind();
    this.gl.texParameteri(this._target, this.gl.TEXTURE_WRAP_T, this._wrapT);
    this.unbind();
  }

  get wrapT() {
    return this._wrapT;
  }

  bind({unit = 0} = {}) {
    this.gl.activeTexture(this.gl[`TEXTURE${unit}`]);
    this.gl.bindTexture(this._target, this._texture);
  }

  unbind() {
    this.gl.bindTexture(this._target, null);
  }
}

class GLProgram extends Shader {
  constructor({
    gl = undefined,
    vertexShader = undefined,
    fragmentShader = undefined,
    uniforms = undefined,
    attributes = undefined,
    transformFeedbackVaryings = undefined,
    vertexShaderChunks = undefined,
    fragmentShaderChunks = undefined,
    shaders = undefined
  } = {}) {
    super({vertexShader, fragmentShader, uniforms, vertexShaderChunks, fragmentShaderChunks, shaders});

    this.gl = gl;
    this._program = gl.createProgram();
    this._attachedShaders = new Map();

    const self = this;

    this._vertexAttribDivisor = function() {};
    const instancedArraysExtension = this.gl.getExtension("ANGLE_instanced_arrays");
    if(instancedArraysExtension) {
      this._vertexAttribDivisor = instancedArraysExtension.vertexAttribDivisorANGLE.bind(instancedArraysExtension);
    } else if(this.gl.vertexAttribDivisor) {
      this._vertexAttribDivisor = this.gl.vertexAttribDivisor.bind(this.gl);
    }

    this._attributesLocations = new Map();
    class Attributes extends Map {
      set (name , {buffer, location = self._attributesLocations.get(name), size, type = gl.FLOAT, normalized = false, stride = 0, offset = 0, divisor = 0} = {}) {
        if(name instanceof Map) {
          for (let [key, value] of name) {
            this.set(key, value);
          }
          return;
        }
        buffer.bind();
        if(location === undefined) {
          location = gl.getAttribLocation(self._program, name);
          if(location === -1) {
            console.warn(`Attribute "${name}" is missing or never used`);
          }
          self._attributesLocations.set(name, location);
        }
        gl.enableVertexAttribArray(location);
        gl.vertexAttribPointer(location, size, type, normalized, stride, offset);
        buffer.unbind();
        self._vertexAttribDivisor(location, divisor);
        super.set(name, {buffer, size, type, normalized, stride, offset});
      }
    }

    this._uniformLocations = new Map();
    class Uniforms extends Map {
      set (name, ...values) {
        let value = values[0];
        if(value === undefined) {
          return;
        }
        
        let location = self._uniformLocations.get(name);
        if(location === undefined) {
          location = gl.getUniformLocation(self._program, name);
          self._uniformLocations.set(name, location);
        }
        
        if(value.length === undefined) {
          if(value instanceof Object) {
            for (let key in value) {
              self.uniforms.set(`${name}.${key}`, value[key]);
            }
            return;
          }
          if(values.length > 1) {
            value = self.uniforms.get(name);
            value.set(...values);
          } else {
            value = values;
          }
        } else if(value[0] instanceof Object) {
          for (let i = 0; i < value.length; i++) {
            if(value[0].length) {
              self.uniforms.set(`${name}[${i}]`, value[i]);
            } else {
              for (let key in value[i]) {
                self.uniforms.set(`${name}[${i}].${key}`, value[i][key]);
              }
            }
          }
          return;
        }
        
        if(location === null) {
          return;
        }

        const type = self.uniformTypes.get(name);

        if(type === "float") {
          gl.uniform1fv(location, value);
        } else if (type === "vec2") {
          gl.uniform2fv(location, value);
        } else if (type === "vec3") {
          gl.uniform3fv(location, value);
        } else if (type === "vec4") {
          gl.uniform4fv(location, value);
        } else if (type === "int" || type === "sampler2D" || type === "samplerCube") {
          gl.uniform1iv(location, value);
        } else if (type === "ivec2") {
          gl.uniform2iv(location, value);
        } else if (type === "ivec3") {
          gl.uniform3iv(location, value);
        } else if (type === "ivec4") {
          gl.uniform4iv(location, value);
        } else if (type === "mat3") {
          gl.uniformMatrix3fv(location, false, value);
        } else if (type === "mat4") {
          gl.uniformMatrix4fv(location, false, value);
        }

        super.set(name, value);
      }
    }

    if(transformFeedbackVaryings) {
      this.gl.transformFeedbackVaryings(this._program, transformFeedbackVaryings, gl.INTERLEAVED_ATTRIBS);
    }

    this.vertexShader = this.vertexShader;
    this.fragmentShader = this.fragmentShader;

    this.use();

    this.attributes = new Attributes();
    
    const rawUniforms = this.uniforms;
    this.uniforms = new Uniforms();
    for (const [key, value] of rawUniforms) {
      this.uniforms.set(key, value);
    }
  }

  set vertexShader(value) {
    super.vertexShader = value;
    if(this.gl) {
      this._updateShader(this.gl.VERTEX_SHADER, this.vertexShader);
    }
  }

  get vertexShader() {
    return super.vertexShader;
  }

  set fragmentShader(value) {
    super.fragmentShader = value;
    if(this.gl) {
      this._updateShader(this.gl.FRAGMENT_SHADER, this.fragmentShader);
    }
  }

  get fragmentShader() {
    return super.fragmentShader;
  }
  
  use() {
    this.gl.useProgram(this._program);
  }

  _updateShader(type, source) {
    if(!source) {
      return;
    }

    if(this.gl.getParameter(this.gl.VERSION).startsWith("WebGL 1.0")) {
      source = source.replace(/#version.*?\n/g, "");
      source = source.replace(/\btexture\b/g, "texture2D");
      if(type === this.gl.VERTEX_SHADER) {
        source = source.replace(/\bin\b/g, "attribute");
        source = source.replace(/\bout\b/g, "varying");
      } else {
        source = source.replace(/\bin\b/g, "varying");
        const results = /out vec4 (.*?);/.exec(source);
        if(results) {
          const fragColorName = results[1];
          source = source.replace(/out.*?;/, "");
          source = source.replace(new RegExp(`\\b${fragColorName}\\b`, "g"), "gl_FragColor");
        }
      }
    }

    const shader = this.gl.createShader(type);
    this.gl.shaderSource(shader, source);
    this.gl.compileShader(shader);

    const shaderInfoLog = this.gl.getShaderInfoLog(shader);
    if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
      const lineNumberResults = /ERROR: 0:(\d+):/.exec(shaderInfoLog);
      if (lineNumberResults) {
        const lineNumber = parseFloat(lineNumberResults[1]);
        const shaderLines = source.split("\n");
        console.error(`${shaderInfoLog}\nat: ${shaderLines[lineNumber - 1].replace(/^\s*/, "")}`);
      } else {
        console.error(shaderInfoLog);
      }
      this.gl.deleteShader(shader);
      return;
    } else if(shaderInfoLog) {
      console.warn(shaderInfoLog);
    }

    const attachedShader = this._attachedShaders.get(type);
    if(attachedShader) {
      this.gl.detachShader(this._program, attachedShader);
      this.gl.deleteShader(attachedShader);
    }

    this.gl.attachShader(this._program, shader);
    this.gl.deleteShader(shader);
    this._attachedShaders.set(type, shader);
    
    if(this._attachedShaders.size === 2) {
      this.gl.linkProgram(this._program);
      const programInfoLog = this.gl.getProgramInfoLog(this._program);
      if (!this.gl.getProgramParameter(this._program, this.gl.LINK_STATUS)) {
        console.error(programInfoLog);
      } else if(programInfoLog) {
        console.warn(programInfoLog);
      }

      // TODO: Check when issue is resolved on Safari and comment out
      
      // for (let [type, attachedShader] of this._attachedShaders) {
      //   this.gl.detachShader(this._program, attachedShader);
      //   this.gl.deleteShader(attachedShader);
      //   this._attachedShaders.delete(type);
      // }

      this._attributesLocations = new Map();
      this._uniformLocations = new Map();
    }
  }

  _parseUniforms(string) {
    super._parseUniforms(string, {
      Vector2,
      Vector3,
      Vector4,
      Matrix3,
      Matrix4,
      GLTexture
    });
  }
}

class GLBuffer {
  constructor({
    gl = undefined,
    data = undefined,
    target = gl.ARRAY_BUFFER,
    usage = gl.STATIC_DRAW
  } = {}) {
    this.gl = gl;
    this.target = target;
    this.usage = usage;

    this._buffer = this.gl.createBuffer();
    
    if(data) {
      this.data = data;
    }
  }

  set data(value) {
    this._data = value;

    this.bind();
    this.gl.bufferData(this.target, this._data, this.usage);
    this.unbind();
  }

  get data() {
    return this._data;
  }

  bind({
    target = this.target,
    index = undefined,
    offset = 0,
    size = undefined
  } = {}) {
    if(index === undefined) {
      this.gl.bindBuffer(target, this._buffer);
    } else if (size === undefined) {
      this.gl.bindBufferBase(target, index, this._buffer);
    } else {
      this.gl.bindBufferRange(target, index, this._buffer, offset, size);
    }
  }

  unbind({
    target = this.target,
    index = undefined,
    offset = 0,
    size = undefined
  } = {}) {
    if(index === undefined) {
      this.gl.bindBuffer(target, null);
    } else if (size === undefined) {
      this.gl.bindBufferBase(target, index, null);
    } else {
      this.gl.bindBufferRange(target, index, null, offset, size);
    }
  }
}

class GLVertexAttribute {
  constructor({
    gl = undefined,
    data = undefined,
    buffer = new GLBuffer({
      gl
    }),
    size = 1,
    offset = 0,
    normalized = false, 
    stride = 0, 
    divisor = 0
  } = {}) {
    this.count = undefined;
    this.type = undefined;
    
    this.gl = gl;
    this.buffer = buffer;
    this.size = size;
    this.offset = offset;
    this.normalized = normalized;
    this.stride = stride;
    this.divisor = divisor;

    if(data) {
      this.data = data;
    }
  }

  set size(value) {
    this._size = value;
    this._update();
  }

  get size() {
    return this._size;
  }

  set data(value) {
    this.buffer.data = value;
    this._update();
  }

  get data() {
    return this.buffer.data;
  }

  set buffer(value) {
    this._buffer = value;
    this._update();
  }

  get buffer() {
    return this._buffer;
  }

  _update() {
    if(!this.data) {
      return;
    }

    // Compute count
    this.count = this.data.length / this.size;

    // Type detection
    if(this.data instanceof Float32Array || this.data instanceof Float64Array) {
      this.type = this.gl.FLOAT;
    } else if(this.data instanceof Uint8Array) {
      this.type = this.gl.UNSIGNED_BYTE;
    } else if(this.data instanceof Uint16Array) {
      this.type = this.gl.UNSIGNED_SHORT;
    } else if (this.data instanceof Uint32Array) {
      this.type = this.gl.UNSIGNED_INT;
    }
  }
}

class GLMesh {
  constructor({
    gl = undefined, 
    attributes = undefined, 
    indiceData = undefined
  } = {}) {
    this.gl = gl;

    this.gl.getExtension("OES_element_index_uint");

    this._drawElementsInstanced = function() {};
    this._drawArraysInstanced = function() {};
    const instancedArraysExtension = this.gl.getExtension("ANGLE_instanced_arrays");
    if(instancedArraysExtension) {
      this._drawElementsInstanced = instancedArraysExtension.drawElementsInstancedANGLE.bind(instancedArraysExtension);
      this._drawArraysInstanced = instancedArraysExtension.drawArraysInstancedANGLE.bind(instancedArraysExtension);
    } else if(this.gl.drawElementsInstanced) {
      this._drawElementsInstanced = this.gl.drawElementsInstanced.bind(this.gl);
      this._drawArraysInstanced = this.gl.drawArraysInstanced.bind(this.gl);
    }

    this.attributes = new Map(attributes);
    
    if(indiceData) {
      this.indices = new GLVertexAttribute({
        gl: this.gl,
        buffer: new GLBuffer({
          gl: this.gl,
          data: indiceData,
          target: this.gl.ELEMENT_ARRAY_BUFFER
        })
      });
    }
  }

  draw ({
    mode = this.gl.TRIANGLES, 
    elements = !!this.indices,
    count = elements ? this.indices.count : this.attributes.get("position").count, 
    offset = this.indices ? this.indices.offset : 0,
    type = elements ? this.indices.type : null,
    first = 0,
    instanceCount = undefined
  } = {}) {
    if(elements) {
      if(instanceCount !== undefined) {
        this._drawElementsInstanced(mode, count, type, offset, instanceCount);
      } else {
        this.gl.drawElements(mode, count, type, offset);
      }
    } else {
      if(instanceCount !== undefined) {
        this._drawArraysInstanced(mode, first, count, instanceCount);
      } else {
        this.gl.drawArrays(mode, first, count);
      }
    }
  }
}

class Camera {
  constructor({ near = 0.01, far = 1000, aspectRatio = 1, fov = Math.PI / 3 } = {}) {
    this._near = near;
    this._far = far;
    this._aspectRatio = aspectRatio;
    this._fov = fov;

    this.transform = new Matrix4();
    this._inverseTransform = new Matrix4();
    this._projection = new Matrix4();
    this._projectionView = new Matrix4();

    this._updateProjection();
  }

  set near(value) {
    this._near = value;
    this._updateProjection();
  }

  get near() {
    return this._near;
  }

  set far(value) {
    this._far = value;
    this._updateProjection();
  }

  get far() {
    return this._far;
  }

  set fov(value) {
    this._fov = value;
    this._updateProjection();
  }

  get fov() {
    return this._fov;
  }

  set aspectRatio(value) {
    this._aspectRatio = value;
    this._updateProjection();
  }

  get aspectRatio() {
    return this._aspectRatio;
  }

  get inverseTransform() {
    return this._inverseTransform.invert(this.transform);
  }

  get projection() {
    return this._projection;
  }

  get projectionView() {
    return this._projectionView.copy(this.projection).multiply(this.inverseTransform);
  }

  _updateProjection() {
    this._projection.fromPerspective(this);
  }
}

Object.defineProperty(Camera.prototype, "near", { enumerable: true });
Object.defineProperty(Camera.prototype, "far", { enumerable: true });
Object.defineProperty(Camera.prototype, "fov", { enumerable: true });
Object.defineProperty(Camera.prototype, "aspectRatio", { enumerable: true });
Object.defineProperty(Camera.prototype, "inverseTransform", { enumerable: true });
Object.defineProperty(Camera.prototype, "projection", { enumerable: true });
Object.defineProperty(Camera.prototype, "projectionView", { enumerable: true });

let pointers = new Map();

class Pointer extends Vector2 {
  static get TOUCH_TYPE() {
    return "touchtype";
  }

  static get MOUSE_TYPE() {
    return "mousetype";
  }

  static get(domElement = document.body) {
    let pointer = pointers.get(domElement);
    if (!pointer) {
      pointer = new Pointer(domElement);
    }
    return pointer;
  }

  get downed() {
    return this._downed;
  }

  constructor(domElement = document.body) {
    super();

    this.domElement = domElement;

    this.type = Pointer.TOUCH_TYPE;

    this.velocity = new Vector2();
    this.dragOffset = new Vector2();

    this.centered = new Vector2();
    this.centeredFlippedY = new Vector2();
    this.normalized = new Vector2();
    this.normalizedFlippedY = new Vector2();
    this.normalizedCentered = new Vector2();
    this.normalizedCenteredFlippedY = new Vector2();

    this._downed = false;

    pointers.set(this.domElement, this);

    this.onDown = new Signal();
    this.onMove = new Signal();
    this.onUp = new Signal();
    this.onClick = new Signal();
    this.onTypeChange = new Signal();

    this._preventMouseTypeChange = false;

    this._onPointerMoveBinded = this._onPointerMove.bind(this);
    this._onPointerDownBinded = this._onPointerDown.bind(this);
    this._onPointerUpBinded = this._onPointerUp.bind(this);

    this._updateBinded = this._update.bind(this);
    this._resizeBinded = this.resize.bind(this);

    this.resize();

    this._position = new Vector2();

    this.enable();
  }

  resize() {
    this._domElementBoundingRect = this.domElement.getBoundingClientRect();
  }

  _onPointerDown(e) {
    if(e.type === "touchstart") {
      this._preventMouseTypeChange = true;
      this._changeType(Pointer.TOUCH_TYPE);
    }
    this._downed = true;
    this.dragOffset.set(0, 0);
    this.copy(this._position);
    this._onPointerEvent(e);
    this._updatePositions();
    this.onDown.dispatch(e);
  }

  _onPointerMove(e) {
    if(e.type === "mousemove") {
      if(this._preventMouseTypeChange) {
        return;
      } else {
        this._changeType(Pointer.MOUSE_TYPE);
      }
    }
    this._onPointerEvent(e);
    this.onMove.dispatch(e);
  }

  _onPointerUp(e) {
    this._downed = false;
    this._onPointerEvent(e);
    this._updatePositions();
    this.onUp.dispatch(e);
    if(this.dragOffset.length < 4) {
      this.onClick.dispatch(e);
    }
    clearTimeout(this._timeout);
    this._timeout = setTimeout(() => {
      this._preventMouseTypeChange = false;
    }, 2000);
  }

  _onPointerEvent(e) {
    if (!!TouchEvent && e instanceof TouchEvent) {
      if(e.type === "touchend") {
        e = e.changedTouches[0];
      } else {
        e = e.touches[0];
      }
    }
    this._position.x = e.clientX - this._domElementBoundingRect.left;
    this._position.y = e.clientY - this._domElementBoundingRect.top;
  }

  _changeType(type) {
    if(this.type === type) {
      return;
    }
    this.type = type;
    this.disable();
    this.enable();
    this.onTypeChange.dispatch(this.type);
  }

  _update() {
    if(this.x || this.y) {
      this.velocity.x = this._position.x - this.x;
      this.velocity.y = this._position.y - this.y;
      if(this.downed) {
        this.dragOffset.add(this.velocity);
      }
    }

    this._updatePositions();
  }

  _updatePositions() {
    this.x = this._position.x;
    this.y = this._position.y;

    if(!this.x && !this.y) {
      return;
    }

    this.centered.x = this.centeredFlippedY.x = this.x - this._domElementBoundingRect.width * .5;
    this.centered.y = this.centeredFlippedY.y = this.y - this._domElementBoundingRect.height * .5;
    this.centeredFlippedY.y *= -1;

    this.normalized.x = this.normalizedFlippedY.x = this.x / this._domElementBoundingRect.width;
    this.normalized.y = this.normalizedFlippedY.y = this.y / this._domElementBoundingRect.height;
    this.normalizedFlippedY.y = 1 - this.normalizedFlippedY.y;

    this.normalizedCentered.x = this.normalizedCenteredFlippedY.x = this.normalized.x * 2 - 1;
    this.normalizedCentered.y = this.normalizedCenteredFlippedY.y = this.normalized.y * 2 - 1;
    this.normalizedCenteredFlippedY.y *= -1;
  }

  enable() {
    this.disable();
    this.resize();
    if(this.type === Pointer.TOUCH_TYPE) {
      this.domElement.addEventListener("touchmove", this._onPointerMoveBinded);
      window.addEventListener("touchend", this._onPointerUpBinded);
    }
    else {
      this.domElement.addEventListener("mousedown", this._onPointerDownBinded);
      window.addEventListener("mouseup", this._onPointerUpBinded);
    }
    this.domElement.addEventListener("touchstart", this._onPointerDownBinded);
    this.domElement.addEventListener("mousemove", this._onPointerMoveBinded);
    window.addEventListener("resize", this._resizeBinded);
    Ticker$1.add(this._updateBinded = this._updateBinded || this._update.bind(this));
  }

  disable() {
    Ticker$1.delete(this._updateBinded);
    this.domElement.removeEventListener("touchstart", this._onPointerDownBinded);
    this.domElement.removeEventListener("mousedown", this._onPointerDownBinded);
    this.domElement.removeEventListener("touchmove", this._onPointerMoveBinded);
    this.domElement.removeEventListener("mousemove", this._onPointerMoveBinded);
    window.removeEventListener("touchend", this._onPointerUpBinded);
    window.removeEventListener("mouseup", this._onPointerUpBinded);
    window.removeEventListener("resize", this._resizeBinded);
  }
}

/* Copyright (c) 2015, Brandon Jones, Colin MacKenzie IV.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE. */

/**
 * Quaternion
 * @module quat
 */

/**
 * Creates a new identity quat
 *
 * @returns {quat} a new quaternion
 */
function create$5() {
  let out = new ARRAY_TYPE(4);
  out[0] = 0;
  out[1] = 0;
  out[2] = 0;
  out[3] = 1;
  return out;
}

/**
 * Set a quat to the identity quaternion
 *
 * @param {quat} out the receiving quaternion
 * @returns {quat} out
 */
function identity$2(out) {
  out[0] = 0;
  out[1] = 0;
  out[2] = 0;
  out[3] = 1;
  return out;
}

/**
 * Sets a quat from the given angle and rotation axis,
 * then returns it.
 *
 * @param {quat} out the receiving quaternion
 * @param {vec3} axis the axis around which to rotate
 * @param {Number} rad the angle in radians
 * @returns {quat} out
 **/
function setAxisAngle(out, axis, rad) {
  rad = rad * 0.5;
  let s = Math.sin(rad);
  out[0] = s * axis[0];
  out[1] = s * axis[1];
  out[2] = s * axis[2];
  out[3] = Math.cos(rad);
  return out;
}

/**
 * Gets the rotation axis and angle for a given
 *  quaternion. If a quaternion is created with
 *  setAxisAngle, this method will return the same
 *  values as providied in the original parameter list
 *  OR functionally equivalent values.
 * Example: The quaternion formed by axis [0, 0, 1] and
 *  angle -90 is the same as the quaternion formed by
 *  [0, 0, 1] and 270. This method favors the latter.
 * @param  {vec3} out_axis  Vector receiving the axis of rotation
 * @param  {quat} q     Quaternion to be decomposed
 * @return {Number}     Angle, in radians, of the rotation
 */


/**
 * Multiplies two quat's
 *
 * @param {quat} out the receiving quaternion
 * @param {quat} a the first operand
 * @param {quat} b the second operand
 * @returns {quat} out
 */
function multiply$5(out, a, b) {
  let ax = a[0], ay = a[1], az = a[2], aw = a[3];
  let bx = b[0], by = b[1], bz = b[2], bw = b[3];

  out[0] = ax * bw + aw * bx + ay * bz - az * by;
  out[1] = ay * bw + aw * by + az * bx - ax * bz;
  out[2] = az * bw + aw * bz + ax * by - ay * bx;
  out[3] = aw * bw - ax * bx - ay * by - az * bz;
  return out;
}

/**
 * Rotates a quaternion by the given angle about the X axis
 *
 * @param {quat} out quat receiving operation result
 * @param {quat} a quat to rotate
 * @param {number} rad angle (in radians) to rotate
 * @returns {quat} out
 */
function rotateX$2(out, a, rad) {
  rad *= 0.5;

  let ax = a[0], ay = a[1], az = a[2], aw = a[3];
  let bx = Math.sin(rad), bw = Math.cos(rad);

  out[0] = ax * bw + aw * bx;
  out[1] = ay * bw + az * bx;
  out[2] = az * bw - ay * bx;
  out[3] = aw * bw - ax * bx;
  return out;
}

/**
 * Rotates a quaternion by the given angle about the Y axis
 *
 * @param {quat} out quat receiving operation result
 * @param {quat} a quat to rotate
 * @param {number} rad angle (in radians) to rotate
 * @returns {quat} out
 */
function rotateY$2(out, a, rad) {
  rad *= 0.5;

  let ax = a[0], ay = a[1], az = a[2], aw = a[3];
  let by = Math.sin(rad), bw = Math.cos(rad);

  out[0] = ax * bw - az * by;
  out[1] = ay * bw + aw * by;
  out[2] = az * bw + ax * by;
  out[3] = aw * bw - ay * by;
  return out;
}

/**
 * Rotates a quaternion by the given angle about the Z axis
 *
 * @param {quat} out quat receiving operation result
 * @param {quat} a quat to rotate
 * @param {number} rad angle (in radians) to rotate
 * @returns {quat} out
 */
function rotateZ$2(out, a, rad) {
  rad *= 0.5;

  let ax = a[0], ay = a[1], az = a[2], aw = a[3];
  let bz = Math.sin(rad), bw = Math.cos(rad);

  out[0] = ax * bw + ay * bz;
  out[1] = ay * bw - ax * bz;
  out[2] = az * bw + aw * bz;
  out[3] = aw * bw - az * bz;
  return out;
}

/**
 * Calculates the W component of a quat from the X, Y, and Z components.
 * Assumes that quaternion is 1 unit in length.
 * Any existing W component will be ignored.
 *
 * @param {quat} out the receiving quaternion
 * @param {quat} a quat to calculate W component of
 * @returns {quat} out
 */


/**
 * Performs a spherical linear interpolation between two quat
 *
 * @param {quat} out the receiving quaternion
 * @param {quat} a the first operand
 * @param {quat} b the second operand
 * @param {Number} t interpolation amount between the two inputs
 * @returns {quat} out
 */
function slerp(out, a, b, t) {
  // benchmarks:
  //    http://jsperf.com/quaternion-slerp-implementations
  let ax = a[0], ay = a[1], az = a[2], aw = a[3];
  let bx = b[0], by = b[1], bz = b[2], bw = b[3];

  let omega, cosom, sinom, scale0, scale1;

  // calc cosine
  cosom = ax * bx + ay * by + az * bz + aw * bw;
  // adjust signs (if necessary)
  if ( cosom < 0.0 ) {
    cosom = -cosom;
    bx = - bx;
    by = - by;
    bz = - bz;
    bw = - bw;
  }
  // calculate coefficients
  if ( (1.0 - cosom) > 0.000001 ) {
    // standard case (slerp)
    omega  = Math.acos(cosom);
    sinom  = Math.sin(omega);
    scale0 = Math.sin((1.0 - t) * omega) / sinom;
    scale1 = Math.sin(t * omega) / sinom;
  } else {
    // "from" and "to" quaternions are very close
    //  ... so we can do a linear interpolation
    scale0 = 1.0 - t;
    scale1 = t;
  }
  // calculate final values
  out[0] = scale0 * ax + scale1 * bx;
  out[1] = scale0 * ay + scale1 * by;
  out[2] = scale0 * az + scale1 * bz;
  out[3] = scale0 * aw + scale1 * bw;

  return out;
}

/**
 * Calculates the inverse of a quat
 *
 * @param {quat} out the receiving quaternion
 * @param {quat} a quat to calculate inverse of
 * @returns {quat} out
 */
function invert$2(out, a) {
  let a0 = a[0], a1 = a[1], a2 = a[2], a3 = a[3];
  let dot = a0*a0 + a1*a1 + a2*a2 + a3*a3;
  let invDot = dot ? 1.0/dot : 0;

  // TODO: Would be faster to return [0,0,0,0] immediately if dot == 0

  out[0] = -a0*invDot;
  out[1] = -a1*invDot;
  out[2] = -a2*invDot;
  out[3] = a3*invDot;
  return out;
}

/**
 * Calculates the conjugate of a quat
 * If the quaternion is normalized, this function is faster than quat.inverse and produces the same result.
 *
 * @param {quat} out the receiving quaternion
 * @param {quat} a quat to calculate conjugate of
 * @returns {quat} out
 */


/**
 * Creates a quaternion from the given 3x3 rotation matrix.
 *
 * NOTE: The resultant quaternion is not normalized, so you should be sure
 * to renormalize the quaternion yourself where necessary.
 *
 * @param {quat} out the receiving quaternion
 * @param {mat3} m rotation matrix
 * @returns {quat} out
 * @function
 */
function fromMat3(out, m) {
  // Algorithm in Ken Shoemake's article in 1987 SIGGRAPH course notes
  // article "Quaternion Calculus and Fast Animation".
  let fTrace = m[0] + m[4] + m[8];
  let fRoot;

  if ( fTrace > 0.0 ) {
    // |w| > 1/2, may as well choose w > 1/2
    fRoot = Math.sqrt(fTrace + 1.0);  // 2w
    out[3] = 0.5 * fRoot;
    fRoot = 0.5/fRoot;  // 1/(4w)
    out[0] = (m[5]-m[7])*fRoot;
    out[1] = (m[6]-m[2])*fRoot;
    out[2] = (m[1]-m[3])*fRoot;
  } else {
    // |w| <= 1/2
    let i = 0;
    if ( m[4] > m[0] )
      i = 1;
    if ( m[8] > m[i*3+i] )
      i = 2;
    let j = (i+1)%3;
    let k = (i+2)%3;

    fRoot = Math.sqrt(m[i*3+i]-m[j*3+j]-m[k*3+k] + 1.0);
    out[i] = 0.5 * fRoot;
    fRoot = 0.5 / fRoot;
    out[3] = (m[j*3+k] - m[k*3+j]) * fRoot;
    out[j] = (m[j*3+i] + m[i*3+j]) * fRoot;
    out[k] = (m[k*3+i] + m[i*3+k]) * fRoot;
  }

  return out;
}

/**
 * Creates a quaternion from the given euler angle x, y, z.
 *
 * @param {quat} out the receiving quaternion
 * @param {x} Angle to rotate around X axis in degrees.
 * @param {y} Angle to rotate around Y axis in degrees.
 * @param {z} Angle to rotate around Z axis in degrees.
 * @returns {quat} out
 * @function
 */


/**
 * Returns a string representation of a quatenion
 *
 * @param {quat} a vector to represent as a string
 * @returns {String} string representation of the vector
 */


/**
 * Creates a new quat initialized with values from an existing quaternion
 *
 * @param {quat} a quaternion to clone
 * @returns {quat} a new quaternion
 * @function
 */


/**
 * Creates a new quat initialized with the given values
 *
 * @param {Number} x X component
 * @param {Number} y Y component
 * @param {Number} z Z component
 * @param {Number} w W component
 * @returns {quat} a new quaternion
 * @function
 */


/**
 * Copy the values from one quat to another
 *
 * @param {quat} out the receiving quaternion
 * @param {quat} a the source quaternion
 * @returns {quat} out
 * @function
 */
const copy$5 = copy$3;

/**
 * Set the components of a quat to the given values
 *
 * @param {quat} out the receiving quaternion
 * @param {Number} x X component
 * @param {Number} y Y component
 * @param {Number} z Z component
 * @param {Number} w W component
 * @returns {quat} out
 * @function
 */
const set$5 = set$3;

/**
 * Adds two quat's
 *
 * @param {quat} out the receiving quaternion
 * @param {quat} a the first operand
 * @param {quat} b the second operand
 * @returns {quat} out
 * @function
 */


/**
 * Alias for {@link quat.multiply}
 * @function
 */


/**
 * Scales a quat by a scalar number
 *
 * @param {quat} out the receiving vector
 * @param {quat} a the vector to scale
 * @param {Number} b amount to scale the vector by
 * @returns {quat} out
 * @function
 */


/**
 * Calculates the dot product of two quat's
 *
 * @param {quat} a the first operand
 * @param {quat} b the second operand
 * @returns {Number} dot product of a and b
 * @function
 */


/**
 * Performs a linear interpolation between two quat's
 *
 * @param {quat} out the receiving quaternion
 * @param {quat} a the first operand
 * @param {quat} b the second operand
 * @param {Number} t interpolation amount between the two inputs
 * @returns {quat} out
 * @function
 */


/**
 * Calculates the length of a quat
 *
 * @param {quat} a vector to calculate length of
 * @returns {Number} length of a
 */


/**
 * Alias for {@link quat.length}
 * @function
 */


/**
 * Calculates the squared length of a quat
 *
 * @param {quat} a vector to calculate squared length of
 * @returns {Number} squared length of a
 * @function
 */


/**
 * Alias for {@link quat.squaredLength}
 * @function
 */


/**
 * Normalize a quat
 *
 * @param {quat} out the receiving quaternion
 * @param {quat} a quaternion to normalize
 * @returns {quat} out
 * @function
 */
const normalize$3 = normalize$2;

/**
 * Returns whether or not the quaternions have exactly the same elements in the same position (when compared with ===)
 *
 * @param {quat} a The first quaternion.
 * @param {quat} b The second quaternion.
 * @returns {Boolean} True if the vectors are equal, false otherwise.
 */


/**
 * Returns whether or not the quaternions have approximately the same elements in the same position.
 *
 * @param {quat} a The first vector.
 * @param {quat} b The second vector.
 * @returns {Boolean} True if the vectors are equal, false otherwise.
 */


/**
 * Sets a quaternion to represent the shortest rotation from one
 * vector to another.
 *
 * Both vectors are assumed to be unit length.
 *
 * @param {quat} out the receiving quaternion.
 * @param {vec3} a the initial vector
 * @param {vec3} b the destination vector
 * @returns {quat} out
 */
const rotationTo = (function() {
  let tmpvec3 = create$2();
  let xUnitVec3 = fromValues$2(1,0,0);
  let yUnitVec3 = fromValues$2(0,1,0);

  return function(out, a, b) {
    let dot = dot$1(a, b);
    if (dot < -0.999999) {
      cross$1(tmpvec3, xUnitVec3, a);
      if (len$1(tmpvec3) < 0.000001)
        cross$1(tmpvec3, yUnitVec3, a);
      normalize$1(tmpvec3, tmpvec3);
      setAxisAngle(out, tmpvec3, Math.PI);
      return out;
    } else if (dot > 0.999999) {
      out[0] = 0;
      out[1] = 0;
      out[2] = 0;
      out[3] = 1;
      return out;
    } else {
      cross$1(tmpvec3, a, b);
      out[0] = tmpvec3[0];
      out[1] = tmpvec3[1];
      out[2] = tmpvec3[2];
      out[3] = 1 + dot;
      return normalize$3(out, out);
    }
  };
})();

/**
 * Performs a spherical linear interpolation with two control points
 *
 * @param {quat} out the receiving quaternion
 * @param {quat} a the first operand
 * @param {quat} b the second operand
 * @param {quat} c the third operand
 * @param {quat} d the fourth operand
 * @param {Number} t interpolation amount
 * @returns {quat} out
 */
const sqlerp = (function () {
  let temp1 = create$5();
  let temp2 = create$5();

  return function (out, a, b, c, d, t) {
    slerp(temp1, a, d, t);
    slerp(temp2, b, c, t);
    slerp(out, temp1, temp2, 2 * t * (1 - t));

    return out;
  };
}());

/**
 * Sets the specified quaternion with values corresponding to the given
 * axes. Each axis is a vec3 and is expected to be unit length and
 * perpendicular to all other specified axes.
 *
 * @param {vec3} view  the vector representing the viewing direction
 * @param {vec3} right the vector representing the local "right" direction
 * @param {vec3} up    the vector representing the local "up" direction
 * @returns {quat} out
 */
const setAxes = (function() {
  let matr = create$4();

  return function(out, view, right, up) {
    matr[0] = right[0];
    matr[3] = right[1];
    matr[6] = right[2];

    matr[1] = up[0];
    matr[4] = up[1];
    matr[7] = up[2];

    matr[2] = -view[0];
    matr[5] = -view[1];
    matr[8] = -view[2];

    return normalize$3(out, fromMat3(out, matr));
  };
})();

class Quaternion extends Float32Array {
  constructor(x = 0, y = 0, z = 0, w = 1) {
    super(4);
    this.set(x, y, z, w);
    return this;
  }

  get x() {
    return this[0];
  }

  set x(value) {
    this[0] = value;
  }

  get y() {
    return this[1];
  }

  set y(value) {
    this[1] = value;
  }

  get z() {
    return this[2];
  }

  set z(value) {
    this[2] = value;
  }

  get w() {
    return this[3];
  }

  set w(value) {
    this[3] = value;
  }

  identity() {
    identity$2(this);
    return this;
  }

  set(x, y, z, w) {
    set$5(this, x, y, z, w);
    return this;
  }

  rotateX(angle) {
    rotateX$2(this, this, angle);
    return this;
  }

  rotateY(angle) {
    rotateY$2(this, this, angle);
    return this;
  }

  rotateZ(angle) {
    rotateZ$2(this, this, angle);
    return this;
  }

  invert(quaternion = this) {
    invert$2(this, quaternion);
    return this;
  }

  copy(quaternion) {
    copy$5(this, quaternion);
    return this;
  }

  normalize(quaternion = this) {
    normalize$3(this, this);
    return this;
  }

  multiply(quaternionA, quaternionB) {
    if (quaternionB) {
      multiply$5(this, quaternionA, quaternionB);
    } else {
      multiply$5(this, this, quaternionA);
    }
    return this;
  }

  fromMatrix3(matrix3) {
    fromMat3(this, matrix3);
    return this;
  }
}

class TrackballController {
  constructor({
    matrix = new Matrix4(), 
    domElement = document.body,
    distance = 0,
    invertRotation = true,
    rotationEaseRatio = .04,
    zoomSpeed = .1,
    zoomEaseRatio = .1,
    minDistance = 0,
    maxDistance = Infinity,
    enabled = true
  } = {}) {
    this.matrix = matrix;

    this._distance = distance;
    this.invertRotation = invertRotation;
    this.rotationEaseRatio = rotationEaseRatio;
    this.maxDistance = maxDistance;
    this.minDistance = minDistance;
    this.zoomSpeed = zoomSpeed;
    this.zoomEaseRatio = zoomEaseRatio;
    
    this._pointer = Pointer.get(domElement);
    this._nextDistance = this._distance;
    
    this._cachedQuaternion = new Quaternion();
    this._cachedMatrix = new Matrix4();
    this._cachedVector3 = new Vector3();
    
    this._velocity = new Vector2();
    this._velocityOrigin = new Vector2();
    
    this._position = new Vector3([this.matrix.x, this.matrix.y, this.matrix.z]);
    this._positionPrevious = this._position.clone();
    this._positionOffset = new Vector3();
    
    domElement.addEventListener("wheel", this.onWheel.bind(this));
    
    this.enabled = true;
    this.update();
    this.enabled = enabled;
  }

  set distance(value) {
    this._distance = this._nextDistance = value;
  }

  get distance() {
    return this._distance;
  }

  onWheel(e) {
    if(!this.enabled) {
      return;
    }
    const scrollOffsetRatio = 1 + Math.abs(e.deltaY * this.zoomSpeed * .01);
    this._nextDistance = e.deltaY > 0 ? this._nextDistance * scrollOffsetRatio : this._nextDistance / scrollOffsetRatio;
    this._nextDistance = Math.max(Math.min(this._nextDistance, this.maxDistance), this.minDistance);
  }

  update() {
    if(!this.enabled) {
      return;
    }

    this._cachedMatrix.identity();
    this._cachedQuaternion.identity();

    this._distance += (this._nextDistance - this._distance) * this.zoomEaseRatio;

    this._position.set(this.matrix.x, this.matrix.y, this.matrix.z).subtract(this._positionOffset);

    this.matrix.x = 0;
    this.matrix.y = 0;
    this.matrix.z = 0;

    if(this._pointer.downed) {
      this._velocity.copy(this._pointer.velocity).scale(.003);
    }

    this._velocity.lerp(this._velocityOrigin, this.rotationEaseRatio);

    this._cachedQuaternion.rotateY(this.invertRotation ? -this._velocity.x : this._velocity.x);
    this._cachedQuaternion.rotateX(this.invertRotation ? -this._velocity.y : this._velocity.y);

    this._cachedMatrix.fromQuaternion(this._cachedQuaternion);

    this.matrix.multiply(this._cachedMatrix);

    this._positionOffset.set(0, 0, 1);
    this._positionOffset.applyMatrix4(this.matrix);
    this._positionOffset.scale(this._distance);

    this._cachedVector3.copy(this._position).add(this._positionOffset);

    this.matrix.x = this._cachedVector3.x;
    this.matrix.y = this._cachedVector3.y;
    this.matrix.z = this._cachedVector3.z;
  }
}

const QUEUES = new Map();

class WebSocket extends window.WebSocket {
  constructor() {
    super(...arguments);

    QUEUES.set(this, []);

    const sendQueue = () => {
      this.removeEventListener("open", sendQueue);
      for (let data of QUEUES.get(this)) {
        this.send(data);
      }
      QUEUES.delete(this);
    };
    this.addEventListener("open", sendQueue);
  }

  send(data) {
    if(this.readyState === WebSocket.CONNECTING) {
      QUEUES.get(this).push(data);
    } else {
      super.send(data);
    }
  }
}

let keysDown = new Set();

let onKeyDown = new Signal();
let onKeyUp = new Signal();

class Keyboard {
  static get LEFT() {
    return 37;
  }
  static get RIGHT() {
    return 39;
  }
  static get UP() {
    return 38;
  }
  static get DOWN() {
    return 40;
  }
  static get SPACE() {
    return 32;
  }
  static get SHIFT() {
    return 16;
  }
  static hasKeyDown(keyCode) {
    return keysDown.has(keyCode);
  }
  static addEventListener(type, listener) {
    if(type === "keydown") {
      onKeyDown.add(listener);
    } else if(type === "keyup") {
      onKeyUp.add(listener);
    }
  }
  static removeEventListener(type, listener) {
    if(type === "keydown") {
      onKeyDown.delete(listener);
    } else if(type === "keyup") {
      onKeyUp.delete(listener);
    }
  }
}

window.addEventListener("keydown", (e) => {
  if(!Keyboard.hasKeyDown(e.keyCode)) {
    onKeyDown.dispatch(e);
  }
  keysDown.add(e.keyCode);
});

window.addEventListener("keyup", (e) => {
  keysDown.delete(e.keyCode);
  onKeyUp.dispatch(e);
});

let style = document.createElement("style");
document.head.appendChild(style);
style.sheet.insertRule(`
  dlib-guiinput {
    display: flex;
    position: relative;
    font-family: monospace;
    font-size: 12px;
    align-items: center;
    height: 20px;
  }
`, 0);
style.sheet.insertRule(`
  dlib-guiinput * {
    outline: none;
  }
`, 0);
style.sheet.insertRule(`
  dlib-guiinput label, dlib-guiinput input, dlib-guiinput select, dlib-gui textarea {
    display: flex;
    font-family: inherit;
    justify-content: center;
    align-items: center;
    width: 100%;
    margin: 0 5px;
  }
`, 0);
style.sheet.insertRule(`
  dlib-guiinput label {
    flex: 1;
    min-width: 25%;
  }
`, 0);
style.sheet.insertRule(`
  dlib-guiinput label span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
`, 0);
style.sheet.insertRule(`
  dlib-guiinput button.clear {
    cursor: pointer;
    font-family: inherit;
    -webkit-appearance: none;
    border: none;
    font-size: 1em;
    padding: 0 5px;
    box-sizing: border-box;
    background: transparent;
    color: inherit;
  }
`, 0);
style.sheet.insertRule(`
  dlib-guiinput input, dlib-guiinput select, dlib-gui textarea {
    flex: 5;
  }
`, 0);
style.sheet.insertRule(`
  dlib-guiinput input.range {
    flex: 2;
  }
`, 0);
style.sheet.insertRule(`
  dlib-guiinput input[type="range"] {
    flex: 3.5;
  }
`, 0);
style.sheet.insertRule(`
  dlib-guiinput input.color {
    flex: 3.5;
  }
`, 0);

const roundToStep = (number, step) => {
  return (Math.round(number * (1 / step)) / (1 / step));
};

class GUIInput extends HTMLElement {
  constructor () {
    super();

    this._object = null;
    this._key = "";
    this._type = "";
    this._label = "";

    this._inputs = [];
    this._options = [];
    this._step = 0.01;
    this._min = 0;
    this._max = Infinity;

    this._initialValue = undefined;

    this._onChangeBinded = this._onChange.bind(this);
    this._onClearBinded = this._onClear.bind(this);
  }

  set value(value) {
    this.object[this.key] = value;
    this.update();
  }

  get value() {
    return this.object[this.key];
  }

  set object(value) {
    this._object = value;
    this._updateHTML();
  }

  get object() {
    return this._object;
  }

  set key(value) {
    this._key = value;
    this._updateHTML();
  }

  get key() {
    return this._key;
  }

  set type(value) {
    this._type = value;
    this._updateHTML();
  }

  get type() {
    return this._type;
  }

  set label(value) {
    this._label = value;
    this._updateHTML();
  }

  get label() {
    return this._label;
  }

  set step(value) {
    this._step = value;
    for (let input of this._inputs) {
      input.step = this._step;
    }
    this.min = this.min;
    this.max = this.max;
  }

  get step() {
    return this._step;
  }

  set min(value) {
    this._min = roundToStep(value, this.step);
    for (let input of this._inputs) {
      input.min = this._min;
    }
  }

  get min() {
    return this._min;
  }

  set max(value) {
    this._max = roundToStep(value, this.step);
    for (let input of this._inputs) {
      input.max = this._max;
    }
  }

  get max() {
    return this._max;
  }

  set options(value) {
    this._options = value;
    if(!this._inputs[0] || this._inputs[0].tagName !== "SELECT") {
      return;
    }
    
    let html = "";
    for (let option of this._options) {
      html += `<option selected="${option === this.value}" value="${option}">${option}</option>`;
    }
    this._inputs[0].innerHTML = html;
  }

  get options() {
    return this._options;
  }

  update() {
    if(this.type === "button") {
      return;
    }
    let changed = false;
    for (let input of this._inputs) {
      let key = input.type === "checkbox" ? "checked" : "value";
      let value = this.value;
      value = input.type === "range" ? Math.min(Math.max(value, this.min), this.max) : value;
      value = input.type !== "checkbox" ? value.toString() : value;
      if(value !== input[key]) {
        input[key] = value;
        changed = true;
      }
    }

    if(changed) {
      this.dispatchEvent(new Event("change"));
    }
  }

  _onChange(e) {
    if(e.target instanceof HTMLInputElement && e.target.type === "checkbox") {
      this.value = e.target.checked;
    } else if(e.target.type === "range" || e.target.type === "number") {
      if(e.target.valueAsNumber === undefined) {
        return;
      }
      this.value = e.target.valueAsNumber;
    } else if(e.target.type === "button") {
      this.value();
    } else if(e.target.type === "color") {
      if(e.type === "change") {
        this.value = e.target.value;
      }
    } else {
      this.value = e.target.value;
    }
  }

  _onClear() {
    this.value = this._initialValue;
  }

  _updateHTML() {
    if(!this.object || !this.key || !this.type) {
      return;
    }

    if(this._initialValue === undefined) {
      this._initialValue = this.value;
    }

    this.removeEventListener("input", this._onChangeBinded);
    this.removeEventListener("change", this._onChangeBinded);
    this.removeEventListener("click", this._onChangeBinded);
    if(this.querySelector(".clear")) {
      this.querySelector(".clear").removeEventListener("click", this._onClearBinded);
    }

    // TODO: Update with ShadowDOM when cross-browser

    this.innerHTML = `
      <label title="${this.label}"><span>${this.label}</span></label>
      ${this.type === "select" ? "<select></select>" : (this.type === "text" ? `<textarea rows="1"></textarea>` : `<input type="${this.type}"/>`)}
      ${this.type === "range" ? "<input class=\"range\" type=\"number\"/>" : ""}
      ${this.type === "color" ? "<input class=\"color\" type=\"text\"/>" : ""}
      <button class="clear">✕</button>
    `;

    this._inputs = Array.from(this.querySelectorAll("input, select, textarea"));

    if(this.type === "range") {
      let nextDecimal = Math.pow(10, Math.abs(parseInt(this.value)).toString().length);
      this.max = this.max !== Infinity ? this.max : (this.value < 0 ? 0 : (Math.abs(this.value) < 1 ? 1 : nextDecimal));
      this.min = this.min || (this.value >= 0 ? 0 : (Math.abs(this.value) < 1 ? -1 : -nextDecimal));
    } else if(this.type === "button") {
      this._inputs[0].value = this.label;
    } else if(this.type === "select") {
      this.options = this.options;
    }

    this.step = this.step;

    this.querySelector(".clear").addEventListener("click", this._onClearBinded);
    if(this.type === "button") {
      this.addEventListener("click", this._onChangeBinded);
    } else {
      this.addEventListener("input", this._onChangeBinded);
      this.addEventListener("change", this._onChangeBinded);
    }

    this.update();
  }
}

window.customElements.define("dlib-guiinput", GUIInput);

let staticGUI;

// STYLES

let style$1 = document.createElement("style");
document.head.appendChild(style$1);
style$1.sheet.insertRule(`
  dlib-gui {
    display: block;
    position: absolute;
    resize: horizontal;
    top: 0;
    left: 0;
    width: 300px;
    max-width: 100%;
    padding: 5px;
    color: white;
    font-family: monospace;
    max-height: 100%;
    box-sizing: border-box;
    overflow: auto;
  }
`, 0);
style$1.sheet.insertRule(`
  dlib-gui dlib-guiinput {
    margin: 5px 0;
  }
`, 0);
style$1.sheet.insertRule(`
  dlib-gui details details {
    margin: 10px;
  }
`, 0);
style$1.sheet.insertRule(`
  dlib-gui details summary {
    cursor: pointer;
  }
`, 0);
style$1.sheet.insertRule(`
  dlib-gui details summary:focus {
    outline: none;
  }
`, 0);

// UTILS

function componentToHex(c) {
  let hex = c.toString(16);
  return hex.length == 1 ? "0" + hex : hex;
}

function rgbToHex(r, g, b) {
  return "#" + componentToHex(Math.floor(r * 255)) + componentToHex(Math.floor(g * 255)) + componentToHex(Math.floor(b * 255));
}

function hexToRgb(hex) {
  var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16) / 255,
    g: parseInt(result[2], 16) / 255,
    b: parseInt(result[3], 16) / 255
  } : null;
}

function colorFromHex(color, hex) {
  if (typeof color === "string") {
    return hex;
  }

  let colorValue = hexToRgb(hex);

  if (color.r !== undefined) {
    Object.assign(color, colorValue);
  } else if (color.x !== undefined) {
    [color.x, color.y, color.z] = [colorValue.r, colorValue.g, colorValue.b];
  } else {
    [color[0], color[1], color[2]] = [colorValue.r, colorValue.g, colorValue.b];
  }

  return color;
}

function colorToHex(color) {
  if (typeof color === "string") {
    return color;
  }
  return rgbToHex(
    color.r !== undefined ? color.r : color.x !== undefined ? color.x : color[0],
    color.g !== undefined ? color.g : color.y !== undefined ? color.y : color[1],
    color.b !== undefined ? color.b : color.z !== undefined ? color.z : color[2]
  );
}

function normalizeString(string) {
  return `${string.toLowerCase().replace(/[^\w-]/g, "")}`;
}

// GUI

const GUI_REG_EXP = /([#&]gui=)((%7B|{).*(%7D|}))([&?]*)/;

let DATA = {};
(function() {
  let matches = GUI_REG_EXP.exec(window.location.hash);
  if (matches) {
    let string = matches[2];
    string = string.replace(/”|%E2%80%9D/g, "%22");
    window.location.hash = window.location.hash.replace(GUI_REG_EXP, `$1${string}$5`);
    DATA = JSON.parse(decodeURI(string));
    console.log("GUI data:", DATA);
  }
})();

class GUI extends HTMLElement {
  static _addStatic() {
    if (staticGUI) {
      return;
    }
    staticGUI = document.createElement("dlib-gui");
    document.body.appendChild(staticGUI);
  }

  static add(...params) {
    GUI._addStatic();
    return staticGUI.add(...params);
  }

  static get element() {
    return staticGUI;
  }

  static get data() {
    return DATA;
  }

  static set visible(value) {
    GUI._addStatic();
    staticGUI.visible = value;
  }

  static get visible() {
    return staticGUI.visible;
  }

  static set open(value) {
    GUI._addStatic();
    staticGUI.open = value;
  }

  static get groups() {
    return staticGUI.groups;
  }

  static get open() {
    return staticGUI.open;
  }

  static get update() {
    return staticGUI.update;
  }

  static set serverUrl(value) {
    GUI._addStatic();
    staticGUI.serverUrl = value;
  }

  constructor({serverUrl} = {}) {
    super();

    this.serverUrl = serverUrl;

    this.groups = new Map();
    this._inputs = new Map();
    this._uids = new Set();

    this._container = document.createElement("details");
    this._container.innerHTML = "<summary>GUI</summary>";

    this.open = true;
  }

  set serverUrl(value) {
    this._serverUrl = value;

    if(this._webSocket) {
      this._webSocket.removeEventListener("message", this._onWebSocketMessage);
      this._webSocket.close();
      this._webSocket = null;
    }
    if(!this._serverUrl) {
      return;
    }
    this._webSocket = new WebSocket(this._serverUrl);
    this._onWebSocketMessage = (e) => {
      let data = JSON.parse(e.data);
      let input = this._inputs.get(data.uid);
      if(input._client) {
        if(input.type === "button") {
          input.value();
        } else {
          input.value = data.value;
        }
      }
    };
    this._webSocket.addEventListener("message", this._onWebSocketMessage);
  }

  get serverUrl() {
    return this._serverUrl;
  }

  set visible(value) {
    this.style.display = value ? "" : "none";
  }

  get visible() {
    return this.style.visibility === "visible";
  }

  update() {
    for (let input of this._inputs.values()) {
      input.update();
    }
  }

  set open(value) {
    this._container.open = value;
  }

  get open() {
    return this._container.open;
  }

  add({object, key, type, label = key, id = label, group = "", reload = false, remote = false, client = remote, onChange = (value) => {}, options, max, min, step} = {}) {
    
    const INITIAL_VALUE = type === "color" ? colorToHex(object[key]) : object[key];
    
    if(INITIAL_VALUE === null || INITIAL_VALUE === undefined) {
      console.error(`GUI: ${id} must be defined.`);
      return;
    }

    let idKey = normalizeString(id);
    let groupKey = normalizeString(group);
    let uid = groupKey ? `${groupKey}/${idKey}` : idKey;

    if(this._uids.has(uid)) {
      console.error(`GUI: An input with id ${id} already exist in the group ${group}`);
      return;
    }

    this._uids.add(uid);

    if(remote && !this.serverUrl) {
      this._serverUrl = `wss://${location.hostname}:80`;
    }

    type = type || (options ? "select" : "");

    if (!type) {
      switch (typeof INITIAL_VALUE) {
        case "boolean":
          type = "checkbox";
          break;
        case "string":
          type = "text";
          break;
        case "function":
          type = "button";
          break;
        default:
          type = typeof INITIAL_VALUE;
      }
    }

    if (!this._container.parentNode) {
      this.appendChild(this._container);
    }
    let container = this._container;
    if(group) {
      container = this.groups.get(group);
      if(!container) {
        container = document.createElement("details");
        container.open = true;
        container.innerHTML = `<summary>${group}</summary>`;
        this.groups.set(group, container);
        this._container.appendChild(container);
      }
    }
    let input = document.createElement("dlib-guiinput");
    input.object = type === "color" ? {
      value: "#000000"
    } : object;
    input.key = type === "color" ? "value" : key;
    input.label = label;
    input.value = INITIAL_VALUE;
    input._client = client;
    if (min) {
      input.min = min;
    }
    if (max) {
      input.max = max;
    }
    if (step) {
      input.step = step;
    }
    if (options) {
      input.options = options;
    }
    input.type = type;
    container.appendChild(input);

    const SAVED_VALUE = groupKey && DATA[groupKey] ? DATA[groupKey][idKey] : DATA[idKey];
    if(SAVED_VALUE !== undefined) {
      input.value = SAVED_VALUE;
      if (type === "color") {
        object[key] = colorFromHex(object[key], SAVED_VALUE);
      }
    }

    const onValueChange = (value) => {
      let containerData = groupKey ? DATA[groupKey] : DATA;
      if (!containerData) {
        containerData = DATA[groupKey] = {};
      }
      if(input.value !== INITIAL_VALUE) {
        containerData[idKey] = input.value;
      } else {
        delete containerData[idKey];
        if(groupKey && !Object.keys(containerData).length) {
          delete DATA[groupKey];
        }
      }

      if (GUI_REG_EXP.test(window.location.hash)) {
        window.location.hash = window.location.hash.replace(
          GUI_REG_EXP, 
          Object.keys(DATA).length ? `$1${encodeURI(JSON.stringify(DATA))}$5` : ""
        );
      } else {
        let prefix = window.location.hash ? "&" : "#";
        window.location.hash += `${prefix}gui=${encodeURI(JSON.stringify(DATA))}`;
      }

      if(remote && this._webSocket) {
        this._webSocket.send(JSON.stringify({uid, value}));
      }

      if (reload) {
        if (Keyboard.hasKeyDown(Keyboard.SHIFT)) {
          Keyboard.addEventListener("keyup", function reloadLocation() {
            Keyboard.removeEventListener("keyup", reloadLocation);
            window.location.reload();
          });
        } else {
          window.location.reload();
        }
      }

      onChange(value);
    };


    // TODO: Clean here

    if (type === "button") {
      input.addEventListener("click", onValueChange);
    } else {
      let animationFrameId = -1;
      const onValueChangeTmp = () => {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = requestAnimationFrame(() => {
          if (type === "color") {
            onValueChange(colorFromHex(object[key], input.value));
          } else {
            onValueChange(input.value);
          }
        });
      };

      if (type !== "text" && type !== "number") {
        input.addEventListener("input", onValueChangeTmp);
      }
      input.addEventListener("change", onValueChangeTmp);
    }

    onChange(object[key]);

    this._inputs.set(uid, input);

    return input;
  }
}

window.customElements.define("dlib-gui", GUI);

const GRAINS = 500000;

class View {
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

const LOAD_PROMISE = Promise.all([
  Loader.load({ value: "src/main/template.html", type: "template" }),
  Loader.load("src/main/index.css")
]);

window.customElements.define("dnit-main", class extends LoopElement {
  connectedCallback() {
    super.connectedCallback();

    LOAD_PROMISE.then(([template]) => {
      let templateClone = document.importNode(template.content, true);
      this.appendChild(templateClone);

      this.canvas = this.querySelector("canvas");
  
      this.view = new View({canvas: this.canvas});
      
      window.addEventListener("resize", this._resizeBinded = this.resize.bind(this));
      this.resize();

      this.play();
    });

  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener("resize", this._resizeBinded);
  }

  resize() {
    let width = this.canvas.offsetWidth;
    let height = this.canvas.offsetHeight;

    // this.canvas.width = width * window.devicePixelRatio;
    // this.canvas.height = height * window.devicePixelRatio;

    this.canvas.width = width;
    this.canvas.height = height;

    this.view.resize(width, height);
  }

  update() {
    this.view.update();
  }
});

}());
//# sourceMappingURL=index.js.map
