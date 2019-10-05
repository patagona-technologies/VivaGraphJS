/**
 * @fileOverview Defines a naive form of links for webglGraphics class.
 * This form allows to change color of links.
 **/
var glUtils = require("./webgl.js");
var geomUtils = require("../Utils/geometry.js");

module.exports = webglArrowProgram;

/**
 * Defines UI for links in webgl renderer.
 */
function webglArrowProgram(curveResolution, curviness, arrowSize, pitch) {
  var ATTRIBUTES_PER_VERTEX = 3, // primitive is Line with two points. Each has x,y and color = 3 * 2 attributes.
    ATTRIBUTES_PER_ARROW = ATTRIBUTES_PER_VERTEX * 3, // 3 Vertices make an arrow head
    BYTES_PER_ARROW =
      3 * (2 * Float32Array.BYTES_PER_ELEMENT + Uint32Array.BYTES_PER_ELEMENT), // ((3 vertices) nodes * (x,y + color))
    linksFS = [
      "precision mediump float;",
      "varying vec4 color;",
      "void main(void) {",
      "   gl_FragColor = color;",
      "}"
    ].join("\n"),
    linksVS = [
      "attribute vec2 a_vertexPos;",
      "attribute vec4 a_color;",

      "uniform vec2 u_screenSize;",
      "uniform mat4 u_transform;",

      "varying vec4 color;",

      "void main(void) {",
      "   gl_Position = u_transform * vec4(a_vertexPos/u_screenSize, 0.0, 1.0);",
      "   color = a_color.abgr;",
      "}"
    ].join("\n"),
    program,
    gl,
    buffer,
    utils,
    locations,
    arrowCount = 0,
    frontArrowId, // used to track z-index of links.
    storage = new ArrayBuffer(16 * BYTES_PER_ARROW),
    positions = new Float32Array(storage),
    colors = new Uint32Array(storage),
    width,
    height,
    transform,
    sizeDirty,
    ensureEnoughStorage = function() {
      // TODO: this is a duplicate of webglNodeProgram code. Extract it to webgl.js
      if (arrowCount * BYTES_PER_ARROW > storage.byteLength) {
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

      gl.enableVertexAttribArray(locations.vertexPos);
      gl.enableVertexAttribArray(locations.color);

      buffer = gl.createBuffer();
    },

    position: function(linkUi, fromPos, toPos, nodeSize) {
      var linkIdx = linkUi.arrowId,
        offset = linkIdx * ATTRIBUTES_PER_ARROW;

      if (linkUi.level > 0) {
        var ctrlPos = geomUtils.computeControlPoint(
          fromPos,
          toPos,
          linkUi.level,
          curviness
        );
        var bezierPoint = geomUtils.sampleBezier(
          fromPos,
          ctrlPos,
          toPos,
          (curveResolution - 1) / curveResolution
        );
        var dir = geomUtils.normalized_direction(bezierPoint, toPos);
      } else {
        var dir = geomUtils.normalized_direction(fromPos, toPos);
      }
      var perpMag = arrowSize * Math.tan(pitch);

      var centerVert = {
        x: toPos.x - (dir.x * nodeSize) / 2,
        y: toPos.y - (dir.y * nodeSize) / 2
      };

      var rightVert = {
        x: centerVert.x - dir.x * arrowSize - dir.y * perpMag,
        y: centerVert.y - dir.y * arrowSize + dir.x * perpMag
      };

      var leftVert = {
        x: centerVert.x - dir.x * arrowSize + dir.y * perpMag,
        y: centerVert.y - dir.y * arrowSize - dir.x * perpMag
      };

      // Center vertex
      positions[offset] = centerVert.x;
      positions[offset + 1] = centerVert.y;
      colors[offset + 2] = linkUi.color;

      // Right vertex
      positions[offset + 3] = rightVert.x;
      positions[offset + 4] = rightVert.y;

      colors[offset + 5] = linkUi.color;

      // Left vertex
      positions[offset + 6] = leftVert.x;
      positions[offset + 7] = leftVert.y;

      colors[offset + 8] = linkUi.color;
    },

    createArrow: function(ui) {
      ensureEnoughStorage();

      arrowCount += 1;
      frontArrowId = ui.arrowId;
    },

    // TODO: Fix remove Arrow for curves
    removeArrow: function(ui) {
      if (arrowCount > 0) {
        arrowCount -= 1;
      }
      // swap removed link with the last link. This will give us O(1) performance for links removal:
      if (ui.arrowId < arrowCount && arrowCount > 0) {
        // using colors as a view to array buffer is okay here.
        utils.copyArrayPart(
          colors,
          ui.arrowId * ATTRIBUTES_PER_ARROW,
          arrowCount * ATTRIBUTES_PER_ARROW,
          ATTRIBUTES_PER_ARROW
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
        2,
        gl.FLOAT,
        false,
        3 * Float32Array.BYTES_PER_ELEMENT,
        0
      );
      gl.vertexAttribPointer(
        locations.color,
        4,
        gl.UNSIGNED_BYTE,
        true,
        3 * Float32Array.BYTES_PER_ELEMENT,
        2 * 4
      );
      gl.drawArrays(gl.TRIANGLES, 0, arrowCount * 3);

      frontArrowId = arrowCount - 1;
    },

    // TODO: Fix for curved lines
    bringToFront: function(link) {
      if (frontArrowId > link.arrowId) {
        utils.swapArrayPart(
          positions,
          link.arrowId * ATTRIBUTES_PER_ARROW,
          frontArrowId * ATTRIBUTES_PER_ARROW,
          ATTRIBUTES_PER_ARROW
        );
      }

      if (frontArrowId > 0) {
        frontArrowId -= 1;
      }
    },

    getFrontArrowId: function() {
      return frontArrowId;
    }
  };
}
