/**
 * @fileOverview Defines a naive form of nodes for webglGraphics class.
 * This form allows to change color of node. Shape of nodes is rectangular.
 *
 * @author Andrei Kashcha (aka anvaka) / https://github.com/anvaka
 */

var glUtils = require("./webgl.js");
var createCircleTexture = require("./webglCircleTexture.js");

module.exports = webglNodeProgram;

/**
 * Defines simple UI for nodes in webgl renderer. Each node is rendered as square. Color and size can be changed.
 */
function webglNodeProgram(node_type = "circle") {
  var ATTRIBUTES_PER_PRIMITIVE = 5; // Primitive is point, x, y, z, size, color
  // x, y, z, size - floats, color = uint.
  var BYTES_PER_NODE =
    4 * Float32Array.BYTES_PER_ELEMENT + Uint32Array.BYTES_PER_ELEMENT;

  var FSPrefix = [
    "#version 300 es",
    "precision mediump float;",
    "in vec4 color;",
    "out vec4 outColor;"
  ].join("\n");

  var squareFSSnippet = ["void main(void) {", "   outColor = color;", "}"].join(
    "\n"
  );
  var circleFSSnippet = [
    "    float r = 0.0, delta = 0.0, alpha = 1.0;",
    "void main(void) {",
    "   vec2 circCoord = 2.0 * gl_PointCoord - 1.0;",
    "   r = dot(circCoord, circCoord);",
    "   if(r > 1.0) discard;",
    "   outColor = color;",
    "}"
  ].join("\n");
  var antialiasedCircleFSSnippet = [
    "    float r = 0.0, delta = 0.0, alpha = 1.0;",
    "void main(void) {",
    "   vec2 circCoord = 2.0 * gl_PointCoord - 1.0;",
    "   r = dot(circCoord, circCoord);",
    "   delta = fwidth(r);",
    "   alpha = 1.0 - smoothstep(1.0 - delta, 1.0 + delta, r);",
    "   if(r == 1.0) discard;",
    "   outColor = color * alpha;",
    "}"
  ].join("\n");
  var textureFSSnippet = [
    "uniform sampler2D u_texture;",
    "void main(void) {",
    "      vec4 tColor = texture( u_texture, gl_PointCoord );",
    "  outColor = vec4(color.rgb, tColor.a);",
    "}"
  ].join("\n");

  if (node_type === "antialiasedCircle") {
    var nodesFS = [FSPrefix, antialiasedCircleFSSnippet].join("\n");
  } else if (node_type === "circle") {
    var nodesFS = [FSPrefix, circleFSSnippet].join("\n");
  } else if (node_type === "square") {
    var nodesFS = [FSPrefix, squareFSSnippet].join("\n");
  } else if (node_type === "texture") {
    var nodesFS = [FSPrefix, textureFSSnippet].join("\n");
  }

  var nodesVS = [
    "#version 300 es",
    "in vec3 a_vertexPos;",
    "in float a_size;",
    "in vec4 a_color;",

    "uniform vec2 u_screenSize;",
    "uniform mat4 u_transform;",

    "out vec4 color;",

    "void main(void) {",
    "   gl_Position = u_transform * vec4(a_vertexPos.xy/u_screenSize, -a_vertexPos.z, 1);",
    "   gl_PointSize = a_size * u_transform[0][0];",
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

    render: render
  };

  function ensureEnoughStorage() {
    if ((nodesCount + 1) * BYTES_PER_NODE >= storage.byteLength) {
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
      "a_size",
      "u_screenSize",
      "u_transform"
    ]);

    buffer = gl.createBuffer();
    circleTexture = createCircleTexture(gl);
  }

  function position(nodeUI, pos) {
    var idx = nodeUI.id;

    positions[idx * ATTRIBUTES_PER_PRIMITIVE] = pos.x;
    positions[idx * ATTRIBUTES_PER_PRIMITIVE + 1] = -pos.y;
    positions[idx * ATTRIBUTES_PER_PRIMITIVE + 2] = nodeUI.depth;
    positions[idx * ATTRIBUTES_PER_PRIMITIVE + 3] = nodeUI.size;

    colors[idx * ATTRIBUTES_PER_PRIMITIVE + 4] = nodeUI.color;
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
    gl.enableVertexAttribArray(locations.size);

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
      ATTRIBUTES_PER_PRIMITIVE * Float32Array.BYTES_PER_ELEMENT,
      0
    );
    gl.vertexAttribPointer(
      locations.size,
      1,
      gl.FLOAT,
      false,
      ATTRIBUTES_PER_PRIMITIVE * Float32Array.BYTES_PER_ELEMENT,
      3 * 4
    );
    gl.vertexAttribPointer(
      locations.color,
      4,
      gl.UNSIGNED_BYTE,
      true,
      ATTRIBUTES_PER_PRIMITIVE * Float32Array.BYTES_PER_ELEMENT,
      4 * 4
    );

    gl.drawArrays(gl.POINTS, 0, nodesCount);
  }
}
