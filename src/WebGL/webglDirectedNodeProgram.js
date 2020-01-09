/**
 * @fileOverview Defines a naive form of nodes for webglGraphics class.
 * This form allows to change color of node. Shape of nodes is rectangular.
 *
 * @author Andrei Kashcha (aka anvaka) / https://github.com/anvaka
 */

var glUtils = require("./webgl.js");
var createCircleTexture = require("./webglCircleTexture.js");

module.exports = webglDirectedNodeProgram;

/**
 * Defines simple UI for nodes in webgl renderer. Each node is rendered as Triangle with a direction and magnitude.
 */
function webglDirectedNodeProgram() {
  var ATTRIBUTES_PER_VERTEX = 4; // primitive is Line with two points. Each has x,y,z and color = 3 * 2 attributes.
  var ATTRIBUTES_PER_PRIMITIVE = ATTRIBUTES_PER_VERTEX * 3; // 3 Vertices make an arrow head
  var BYTES_PER_NODE =
    3 * (3 * Float32Array.BYTES_PER_ELEMENT + Uint32Array.BYTES_PER_ELEMENT); // ((3 vertices) nodes * (x,y + color))

  var nodesFS = [
    "#version 300 es",
    "precision mediump float;",
    "in vec4 color;",
    "out vec4 outColor;",
    "void main(void) {",
    "   outColor = color;",
    "}"
  ].join("\n");
  var nodesVS = [
    "#version 300 es",
    "in vec3 a_vertexPos;",
    "in vec4 a_color;",

    "uniform vec2 u_screenSize;",
    "uniform mat4 u_transform;",

    "out vec4 color;",

    "void main(void) {",
    "   gl_Position = u_transform * vec4(a_vertexPos.xy/u_screenSize, -a_vertexPos.z, 1.0);",
    "   color = a_color.abgr;",
    "}"
  ].join("\n");

  var program;
  var gl;
  var buffer;
  var locations;
  var utils;
  var storage = new ArrayBuffer(16 * BYTES_PER_NODE);
  var positions = new Float32Array(storage);
  var colors = new Uint32Array(storage);
  var nodesCount = 0;
  var width;
  var height;
  var transform;
  var sizeDirty;
  var circleTexture;

  return {
    load: load,

    /**
     * Updates position of node in the buffer of nodes.
     *
     * @param idx - index of current node.
     * @param pos - new position of the node.
     */
    position: position,

    updateTransform: updateTransform,

    updateSize: updateSize,

    removeNode: removeNode,

    createNode: createNode,

    replaceProperties: replaceProperties,

    render: render,

    resetStorage: resetStorage
  };

  function resetStorage() {
    storage = new ArrayBuffer(16 * BYTES_PER_NODE);
    positions = new Float32Array(storage);
    colors = new Uint32Array(storage);
  }
  function ensureEnoughStorage() {
    // TODO: this is a duplicate of webglNodeProgram code. Extract it to webgl.js
    if (nodesCount * BYTES_PER_NODE > storage.byteLength) {
      // Every time we run out of space create new array twice bigger.
      // TODO: it seems buffer size is limited. Consider using multiple arrays for huge graphs
      var extendedStorage = new ArrayBuffer(storage.byteLength * 2),
        extendedPositions = new Float32Array(extendedStorage),
        extendedColors = new Uint32Array(extendedStorage);

      extendedColors.set(colors); // should be enough to copy just one view.
      positions = extendedPositions;
      colors = extendedColors;
      storage = extendedStorage;
    }
  }

  function load(glContext) {
    gl = glContext;
    utils = glUtils(glContext);

    program = utils.createProgram(nodesVS, nodesFS);
    gl.useProgram(program);
    locations = utils.getLocations(program, [
      "a_vertexPos",
      "a_color",
      "u_screenSize",
      "u_transform"
    ]);

    buffer = gl.createBuffer();
  }

  function position(nodeUI, pos) {
    var idx = nodeUI.id;

    var direction = nodeUI.gradient.direction;
    size = nodeUI.size;
    let parallel = {
      x: direction.x * (size / 2),
      y: direction.y * (size / 2)
    };

    var perpendicular = {
      x: (direction.y * size) / 4,
      y: (-direction.x * size) / 4
    };

    var magnitude = nodeUI.gradient.magnitude;

    var offset = idx * ATTRIBUTES_PER_PRIMITIVE;

    var centerVert = {
      x: pos.x + parallel.x,
      y: pos.y + parallel.y
    };

    var rightVert = {
      x: pos.x - parallel.x + perpendicular.x,
      y: pos.y - parallel.y + perpendicular.y
    };

    var leftVert = {
      x: pos.x - parallel.x - perpendicular.x,
      y: pos.y - parallel.y - perpendicular.y
    };

    // Center vertex
    positions[offset] = centerVert.x;
    positions[offset + 1] = -centerVert.y;
    positions[offset + 2] = nodeUI.depth;
    colors[offset + 3] = nodeUI.color;

    // Right vertex
    positions[offset + 4] = rightVert.x;
    positions[offset + 5] = -rightVert.y;
    positions[offset + 6] = nodeUI.depth;
    colors[offset + 7] = nodeUI.color;

    // Left vertex
    positions[offset + 8] = leftVert.x;
    positions[offset + 9] = -leftVert.y;
    positions[offset + 10] = nodeUI.depth;
    colors[offset + 11] = nodeUI.color;
  }

  function updateTransform(newTransform) {
    sizeDirty = true;
    transform = newTransform;
  }

  function updateSize(w, h) {
    width = w;
    height = h;
    sizeDirty = true;
  }

  function removeNode(node) {
    if (nodesCount > 0) {
      nodesCount -= 1;
    }

    if (node.id < nodesCount && nodesCount > 0) {
      // we can use colors as a 'view' into array array buffer.
      utils.copyArrayPart(
        colors,
        node.id * ATTRIBUTES_PER_PRIMITIVE,
        nodesCount * ATTRIBUTES_PER_PRIMITIVE,
        ATTRIBUTES_PER_PRIMITIVE
      );
    }
  }

  function createNode() {
    ensureEnoughStorage();
    nodesCount += 1;
  }

  function replaceProperties(/* replacedNode, newNode */) {}
  function render() {
    gl.enableVertexAttribArray(locations.vertexPos);
    gl.enableVertexAttribArray(locations.color);

    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, storage, gl.DYNAMIC_DRAW);

    if (sizeDirty) {
      sizeDirty = false;
      gl.uniformMatrix4fv(locations.transform, false, transform);
      gl.uniform2f(locations.screenSize, width, height);
    }

    gl.vertexAttribPointer(
      locations.vertexPos,
      3,
      gl.FLOAT,
      false,
      4 * Float32Array.BYTES_PER_ELEMENT,
      0
    );
    gl.vertexAttribPointer(
      locations.color,
      4,
      gl.UNSIGNED_BYTE,
      true,
      4 * Float32Array.BYTES_PER_ELEMENT,
      3 * 4
    );
    gl.drawArrays(gl.TRIANGLES, 0, nodesCount * 3);

    frontArrowId = nodesCount - 1;
  }
}
