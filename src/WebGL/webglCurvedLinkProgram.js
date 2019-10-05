/**
 * @fileOverview Defines a naive form of links for webglGraphics class.
 * This form allows to change color of links.
 **/
var glUtils = require("./webgl.js");
var geomUtils = require("../Utils/geometry.js");

module.exports = webglCurvedLinkProgram;

/**
 * Defines UI for links in webgl renderer.
 */
function webglCurvedLinkProgram(curveResolution, curviness = 0.2) {
  var ATTRIBUTES_PER_VERTEX = 3, // primitive is Line with two points. Each has x,y and color = 3 * 2 attributes.
    SEGMENTS_PER_CURVE = curveResolution,
    ATTRIBUTES_PER_CURVE = (SEGMENTS_PER_CURVE + 1) * ATTRIBUTES_PER_VERTEX,
    BYTES_PER_CURVE =
      (SEGMENTS_PER_CURVE + 1) *
      (2 * Float32Array.BYTES_PER_ELEMENT + Uint32Array.BYTES_PER_ELEMENT), // ((nSegments + 1) nodes * (x,y + color))
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
    indicesBuffer,
    utils,
    locations,
    linksCount = 0,
    frontLinkId, // used to track z-index of links.
    storage = new ArrayBuffer(16 * BYTES_PER_CURVE),
    indicesStorage = new ArrayBuffer(
      16 * Uint16Array.BYTES_PER_ELEMENT * 2 * SEGMENTS_PER_CURVE
    ),
    indices = new Uint16Array(indicesStorage),
    positions = new Float32Array(storage),
    colors = new Uint32Array(storage),
    width,
    height,
    transform,
    sizeDirty,
    tSampling = [...Array(SEGMENTS_PER_CURVE + 1).keys()].map(
      x => x / SEGMENTS_PER_CURVE
    ),
    ensureEnoughStorage = function() {
      // TODO: this is a duplicate of webglNodeProgram code. Extract it to webgl.js
      if ((linksCount + 1) * BYTES_PER_CURVE > storage.byteLength) {
        // Every time we run out of space create new array twice bigger.
        // TODO: it seems buffer size is limited. Consider using multiple arrays for huge graphs
        var extendedStorage = new ArrayBuffer(storage.byteLength * 2),
          extendedPositions = new Float32Array(extendedStorage),
          extendedColors = new Uint32Array(extendedStorage),
          extendedIndicesStorage = new ArrayBuffer(
            indicesStorage.byteLength * 2
          ),
          extendedIndices = new Uint16Array(extendedIndicesStorage);

        extendedColors.set(colors); // should be enough to copy just one view.
        positions = extendedPositions;
        colors = extendedColors;
        storage = extendedStorage;

        extendedIndices.set(indices);
        indices = extendedIndices;
        indicesStorage = extendedIndicesStorage;
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
      indicesBuffer = gl.createBuffer();
    },

    position: function(linkUi, fromPos, toPos) {
      var linkIdx = linkUi.id,
        offset = linkIdx * ATTRIBUTES_PER_CURVE,
        vertexOffset = linkIdx * (SEGMENTS_PER_CURVE + 1),
        indexOffset = linkIdx * (SEGMENTS_PER_CURVE * 2);

      // fill positions with bezier line segments
      var ctrlPos = geomUtils.computeControlPoint(
        fromPos,
        toPos,
        linkUi.level,
        curviness
      );
      // Shouldn't need to recompute bezier... Just scale, translate

      for (var nodeIdx = 0; nodeIdx < SEGMENTS_PER_CURVE + 1; nodeIdx++) {
        var point = geomUtils.sampleBezier(
          fromPos,
          ctrlPos,
          toPos,
          tSampling[nodeIdx]
        );
        positions[offset + nodeIdx * ATTRIBUTES_PER_VERTEX] = point.x;
        positions[offset + nodeIdx * ATTRIBUTES_PER_VERTEX + 1] = point.y;

        colors[offset + nodeIdx * ATTRIBUTES_PER_VERTEX + 2] = linkUi.color;

        if (nodeIdx < SEGMENTS_PER_CURVE) {
          indices[indexOffset + nodeIdx * 2] = vertexOffset + nodeIdx;
          indices[indexOffset + nodeIdx * 2 + 1] = vertexOffset + nodeIdx + 1;
        }
      }
    },

    createLink: function(ui) {
      ensureEnoughStorage();

      linksCount += 1;
      frontLinkId = ui.id;
    },

    // TODO: Fix remove Link for curves
    removeLink: function(ui) {
      if (linksCount > 0) {
        linksCount -= 1;
      }
      // swap removed link with the last link. This will give us O(1) performance for links removal:
      if (ui.id < linksCount && linksCount > 0) {
        // using colors as a view to array buffer is okay here.
        utils.copyArrayPart(
          colors,
          ui.id * ATTRIBUTES_PER_CURVE,
          linksCount * ATTRIBUTES_PER_CURVE,
          ATTRIBUTES_PER_CURVE
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

      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indicesBuffer);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indicesStorage, gl.DYNAMIC_DRAW);

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

      gl.drawElements(
        gl.LINES,
        linksCount * SEGMENTS_PER_CURVE * 2,
        gl.UNSIGNED_SHORT,
        0
      );

      frontLinkId = linksCount - 1;
    },

    // TODO: Fix for curved lines
    bringToFront: function(link) {
      if (frontLinkId > link.id) {
        utils.swapArrayPart(
          positions,
          link.id * ATTRIBUTES_PER_CURVE,
          frontLinkId * ATTRIBUTES_PER_CURVE,
          ATTRIBUTES_PER_CURVE
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
