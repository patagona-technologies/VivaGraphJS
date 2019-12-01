/**
 * @fileOverview Defines a naive form of links for webglGraphics class.
 * This form allows to change color of links.
 **/

var glUtils = require("./webgl.js");
var geomUtils = require("../Utils/geometry.js");
module.exports = webglLinkProgram;

/**
 * Defines UI for links in webgl renderer.
 */
function webglLinkProgram() {
  var ATTRIBUTES_PER_PRIMITIVE = 8, // primitive is Line with two points. Each has x,y,z and color = 3 * 2 attributes.
    BYTES_PER_LINK =
      2 * (3 * Float32Array.BYTES_PER_ELEMENT + Uint32Array.BYTES_PER_ELEMENT), // two nodes * (x, y, z + color)
    linksFS = [
      "#version 300 es",
      "precision mediump float;",
      "in vec4 color;",
      "out vec4 outColor;",
      "void main(void) {",
      "   outColor = color;",
      "}"
    ].join("\n"),
    linksVS = [
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
    ].join("\n"),
    program,
    gl,
    buffer,
    utils,
    locations,
    linksCount = 0,
    frontLinkId, // used to track z-index of links.
    storage = new ArrayBuffer(16 * BYTES_PER_LINK),
    positions = new Float32Array(storage),
    colors = new Uint32Array(storage),
    width,
    height,
    transform,
    sizeDirty,
    ensureEnoughStorage = function() {
      // TODO: this is a duplicate of webglNodeProgram code. Extract it to webgl.js
      if ((linksCount + 1) * BYTES_PER_LINK > storage.byteLength) {
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
    };

  return {
    load: function(glContext) {
      gl = glContext;
      utils = glUtils(glContext);

      program = utils.createProgram(linksVS, linksFS);
      gl.useProgram(program);

      locations = utils.getLocations(program, [
        "a_vertexPos",
        "a_color",
        "u_screenSize",
        "u_transform"
      ]);

      buffer = gl.createBuffer();
    },

    position: function(linkUi, fromPos, toPos, nodeSize) {
      var linkIdx = linkUi.id,
        offset = linkIdx * ATTRIBUTES_PER_PRIMITIVE;

      var dir = geomUtils.normalized_direction(fromPos, toPos);

      positions[offset] = fromPos.x;
      positions[offset + 1] = fromPos.y;
      positions[offset + 2] = linkUi.depth;
      colors[offset + 3] = linkUi.color;

      positions[offset + 4] = toPos.x - (dir.x * nodeSize) / 2;
      positions[offset + 5] = toPos.y - (dir.y * nodeSize) / 2;
      positions[offset + 6] = linkUi.depth;
      colors[offset + 7] = linkUi.color;
    },

    createLink: function(ui) {
      ensureEnoughStorage();

      linksCount += 1;
      frontLinkId = ui.id;
    },

    removeLink: function(ui) {
      if (linksCount > 0) {
        linksCount -= 1;
      }
      // swap removed link with the last link. This will give us O(1) performance for links removal:
      if (ui.id < linksCount && linksCount > 0) {
        // using colors as a view to array buffer is okay here.
        utils.copyArrayPart(
          colors,
          ui.id * ATTRIBUTES_PER_PRIMITIVE,
          linksCount * ATTRIBUTES_PER_PRIMITIVE,
          ATTRIBUTES_PER_PRIMITIVE
        );
      }
    },

    updateTransform: function(newTransform) {
      sizeDirty = true;
      transform = newTransform;
    },

    updateSize: function(w, h) {
      width = w;
      height = h;
      sizeDirty = true;
    },

    render: function() {
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

      gl.drawArrays(gl.LINES, 0, linksCount * 2);

      frontLinkId = linksCount - 1;
    },

    bringToFront: function(link) {
      if (frontLinkId > link.id) {
        utils.swapArrayPart(
          positions,
          link.id * ATTRIBUTES_PER_PRIMITIVE,
          frontLinkId * ATTRIBUTES_PER_PRIMITIVE,
          ATTRIBUTES_PER_PRIMITIVE
        );
      }
      if (frontLinkId > 0) {
        frontLinkId -= 1;
      }
    },

    getFrontLinkId: function() {
      return frontLinkId;
    }
  };
}
