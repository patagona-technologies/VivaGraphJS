/**
 * @fileOverview Defines a graph renderer that uses WebGL based drawings.
 *
 * @author Andrei Kashcha (aka anvaka) / https://github.com/anvaka
 */

module.exports = webglGraphics;

var webglInputManager = require("../Input/webglInputManager.js");
var webglLinkProgram = require("../WebGL/webglLinkProgram.js");
var webglCurvedLinkProgram = require("../WebGL/webglCurvedLinkProgram.js");
var webglNodeProgram = require("../WebGL/webglNodeProgram.js");
var webglArrowProgram = require("../WebGL/webglArrowProgram.js");
var webglSquare = require("../WebGL/webglSquare.js");
var webglLine = require("../WebGL/webglLine.js");
var eventify = require("ngraph.events");
var merge = require("ngraph.merge");

/**
 * Performs webgl-based graph rendering. This module does not perform
 * layout, but only visualizes nodes and edges of the graph.
 *
 * @param options - to customize graphics  behavior. Currently supported parameter
 *  enableBlending - true by default, allows to use transparency in node/links colors.
 *  preserveDrawingBuffer - false by default, tells webgl to preserve drawing buffer.
 *                    See https://www.khronos.org/registry/webgl/specs/1.0/#5.2
 */

function webglGraphics(options) {
  options = merge(options, {
    enableBlending: true,
    preserveDrawingBuffer: false,
    clearColor: false,
    clearColorValue: {
      r: 1,
      g: 1,
      b: 1,
      a: 1
    },
    depthBuffer: true,
    curveResolution: 10,
    curviness: 0.1,
    arrowSize: 20,
    arrowPitch: Math.PI / 8
  });

  var container,
    graphicsRoot,
    gl,
    width,
    height,
    nodesCount = 0,
    straightLinksCount = 0,
    curvedLinksCount = 0,
    arrowCount = 0,
    transform = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
    userPlaceNodeCallback,
    userPlaceLinkCallback,
    nodes = [],
    straightLinks = [],
    curvedLinks = [],
    arrows = [],
    initCallback,
    allNodes = {},
    allLinks = {},
    straightLinkProgram = webglLinkProgram(),
    curvedLinkProgram = webglCurvedLinkProgram(
      options.curveResolution,
      options.curviness
    ),
    arrowProgram = webglArrowProgram(
      options.curveResolution,
      options.curviness,
      options.arrowSize,
      options.arrowPitch
    ),
    nodeProgram = webglNodeProgram(),
    /*jshint unused: false */
    nodeUIBuilder = function(node) {
      return webglSquare(); // Just make a square, using provided gl context (a nodeProgram);
    },
    linkUIBuilder = function(link) {
      return webglLine(0xb3b3b3ff);
    },
    /*jshint unused: true */
    updateTransformUniform = function() {
      straightLinkProgram.updateTransform(transform);
      nodeProgram.updateTransform(transform);
      curvedLinkProgram.updateTransform(transform);
      arrowProgram.updateTransform(transform);
    },
    resetScaleInternal = function() {
      transform = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    },
    updateSize = function() {
      if (container && graphicsRoot) {
        width = graphicsRoot.width = Math.max(container.offsetWidth, 1);
        height = graphicsRoot.height = Math.max(container.offsetHeight, 1);
        if (gl) {
          gl.viewport(0, 0, width, height);
        }
        if (straightLinkProgram) {
          straightLinkProgram.updateSize(width / 2, height / 2);
        }
        if (curvedLinkProgram) {
          curvedLinkProgram.updateSize(width / 2, height / 2);
        }
        if (arrowProgram) {
          arrowProgram.updateSize(width / 2, height / 2);
        }
        if (nodeProgram) {
          nodeProgram.updateSize(width / 2, height / 2);
        }
      }
    },
    fireRescaled = function(graphics) {
      graphics.fire("rescaled");
    },
    flipLinkCoordinates = function(position) {
      var toPos = { x: 0, y: 0 };
      var fromPos = { x: 0, y: 0 };

      var pos = position.from;
      fromPos.x = pos.x;
      fromPos.y = -pos.y;
      pos = position.to;
      toPos.x = pos.x;
      toPos.y = -pos.y;

      return { fromPos: fromPos, toPos: toPos };
    },
    removeLinkFromList = function(links, linksCount, linkIdToRemove) {
      if (linksCount > 0) {
        linksCount -= 1;
      }

      if (linkIdToRemove < linksCount) {
        if (linksCount === 0 || linksCount === linkIdToRemove) {
          return linksCount; // no more links or removed link is the last one.
        }

        var lastLinkUI = links[linksCount];
        links[linkIdToRemove] = lastLinkUI;
        lastLinkUI.id = linkIdToRemove;
      }
      return linksCount;
    },
    swapElementsAndId = function(array, id1, id2) {
      var temp = array[id1];
      array[id1] = array[id2];
      array[id1].id = id1;
      array[id2] = temp;
      array[id2].id = id2;
    };

  graphicsRoot = window.document.createElement("canvas");

  var graphics = {
    getLinkUI: function(linkId) {
      return allLinks[linkId];
    },

    getNodeUI: function(nodeId) {
      return allNodes[nodeId];
    },

    /**
     * Sets the callback that creates node representation.
     *
     * @param builderCallback a callback function that accepts graph node
     * as a parameter and must return an element representing this node.
     *
     * @returns If builderCallbackOrNode is a valid callback function, instance of this is returned;
     * Otherwise undefined value is returned
     */
    node: function(builderCallback) {
      if (typeof builderCallback !== "function") {
        return null; // todo: throw? This is not compatible with old versions
      }

      nodeUIBuilder = builderCallback;

      return this;
    },

    /**
     * Sets the callback that creates link representation
     *
     * @param builderCallback a callback function that accepts graph link
     * as a parameter and must return an element representing this link.
     *
     * @returns If builderCallback is a valid callback function, instance of this is returned;
     * Otherwise undefined value is returned.
     */
    link: function(builderCallback) {
      if (typeof builderCallback !== "function") {
        return null; // todo: throw? This is not compatible with old versions
      }

      linkUIBuilder = builderCallback;
      return this;
    },

    /**
     * Allows to override default position setter for the node with a new
     * function. newPlaceCallback(nodeUI, position) is function which
     * is used by updateNodePosition().
     */
    placeNode: function(newPlaceCallback) {
      userPlaceNodeCallback = newPlaceCallback;
      return this;
    },

    placeLink: function(newPlaceLinkCallback) {
      userPlaceLinkCallback = newPlaceLinkCallback;
      return this;
    },

    /**
     * Custom input manager listens to mouse events to process nodes drag-n-drop inside WebGL canvas
     */
    inputManager: webglInputManager,

    /**
     * Called every time before renderer starts rendering.
     */
    beginRender: function() {
      // this function could be replaced by this.init,
      // based on user options.
    },

    /**
     * Called every time when renderer finishes one step of rendering.
     */
    endRender: function() {
      if (arrowCount > 0) {
        arrowProgram.render();
      }

      if (curvedLinksCount > 0) {
        curvedLinkProgram.render();
      }

      if (straightLinksCount > 0) {
        straightLinkProgram.render();
      }

      if (nodesCount > 0) {
        nodeProgram.render();
      }
    },

    bringLinkToFront: function(linkUI) {
      if (linkUI.level > 0) {
        var frontLinkId = curvedLinkProgram.getFrontLinkId();
        curvedLinkProgram.bringToFront(linkUI);
      } else {
        var frontLinkId = straightLinkProgram.getFrontLinkId();
        straightLinkProgram.bringToFront(linkUI);
      }
      var srcLinkId;

      if (frontLinkId > linkUI.id) {
        srcLinkId = linkUI.id;

        if (linkUI.level > 0) {
          swapElementsAndId(curvedLinks, frontLinkId, srcLinkId);
        } else {
          swapElementsAndId(straightLinks, frontLinkId, srcLinkId);
        }
      }
    },

    /**
     * Sets translate operation that should be applied to all nodes and links.
     */
    graphCenterChanged: function(x, y) {
      transform[12] = (2 * x) / width - 1;
      transform[13] = 1 - (2 * y) / height;
      updateTransformUniform();
    },

    /**
     * Called by Viva.Graph.View.renderer to let concrete graphic output
     * provider prepare to render given link of the graph
     *
     * @param link - model of a link
     */
    addLink: function(link, boundPosition) {
      var ui = linkUIBuilder(link);

      /* 
         Link level = 0 is a straight line
         Link level > 0 is a curved line
      */
      if (ui.level > 0) {
        var uiid = curvedLinksCount++;
      } else {
        var uiid = straightLinksCount++;
      }

      ui.id = uiid;
      ui.pos = boundPosition;

      if (ui.arrow) {
        ui.toNodeId = link.toId;
        var arrowId = arrowCount++;
        ui.arrowId = arrowId;
        arrowProgram.createArrow(ui);
        arrows[arrowId] = ui;
      } else {
        ui.arrowId = null;
      }

      if (ui.level > 0) {
        curvedLinkProgram.createLink(ui);
        curvedLinks[uiid] = ui;
      } else {
        straightLinkProgram.createLink(ui);
        straightLinks[uiid] = ui;
      }
      allLinks[link.id] = ui;

      return ui;
    },

    /**
     * Called by Viva.Graph.View.renderer to let concrete graphic output
     * provider prepare to render given node of the graph.
     *
     * @param nodeUI visual representation of the node created by node() execution.
     **/
    addNode: function(node, boundPosition) {
      var uiid = nodesCount++,
        ui = nodeUIBuilder(node);

      ui.id = uiid;
      ui.position = boundPosition;
      ui.node = node;

      nodeProgram.createNode(ui);

      nodes[uiid] = ui;
      allNodes[node.id] = ui;

      return ui;
    },

    translateRel: function(dx, dy) {
      transform[12] += (2 * transform[0] * dx) / width / transform[0];
      transform[13] -= (2 * transform[5] * dy) / height / transform[5];
      updateTransformUniform();
    },

    scale: function(scaleFactor, scrollPoint) {
      // Transform scroll point to clip-space coordinates:
      var cx = (2 * scrollPoint.x) / width - 1,
        cy = 1 - (2 * scrollPoint.y) / height;

      cx -= transform[12];
      cy -= transform[13];

      transform[12] += cx * (1 - scaleFactor);
      transform[13] += cy * (1 - scaleFactor);

      transform[0] *= scaleFactor;
      transform[5] *= scaleFactor;

      updateTransformUniform();
      fireRescaled(this);

      return transform[0];
    },

    resetScale: function() {
      resetScaleInternal();

      if (gl) {
        updateSize();
        // TODO: what is this?
        // gl.useProgram(linksProgram);
        // gl.uniform2f(linksProgram.screenSize, width, height);
        updateTransformUniform();
      }
      return this;
    },

    /**
     * Resizes the graphic without resetting the scale.
     * Useful with viva graph in a dynamic container
     */
    updateSize: updateSize,

    /**
     * Called by Viva.Graph.View.renderer to let concrete graphic output
     * provider prepare to render.
     */
    init: function(c) {
      var contextParameters = {};

      if (options.preserveDrawingBuffer) {
        contextParameters.preserveDrawingBuffer = true;
      }
      container = c;

      updateSize();
      resetScaleInternal();
      container.appendChild(graphicsRoot);

      // gl = graphicsRoot.getContext("experimental-webgl", contextParameters);
      gl = graphicsRoot.getContext("webgl2", contextParameters);
      if (!gl) {
        var msg =
          "Could not initialize WebGL. Seems like the browser doesn't support it.";
        window.alert(msg);
        throw msg;
      }

      if (options.enableBlending) {
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.enable(gl.BLEND);
      }
      if (options.clearColor) {
        var color = options.clearColorValue;
        gl.clearColor(color.r, color.g, color.b, color.a);
        // TODO: not the best way, really. Should come up with something better
        // what if we need more updates inside beginRender, like depth buffer?
      }
      if (options.depthBuffer) {
        gl.enable(gl.DEPTH_TEST);
      }

      this.beginRender = function() {
        if (options.clearColor) {
          gl.clear(gl.COLOR_BUFFER_BIT);
        }
        if (options.depthBuffer) {
          gl.clear(gl.DEPTH_BUFFER_BIT);
        }
      };

      straightLinkProgram.load(gl);
      straightLinkProgram.updateSize(width / 2, height / 2);

      curvedLinkProgram.load(gl);
      curvedLinkProgram.updateSize(width / 2, height / 2);

      nodeProgram.load(gl);
      nodeProgram.updateSize(width / 2, height / 2);

      arrowProgram.load(gl);
      arrowProgram.updateSize(width / 2, height / 2);

      updateTransformUniform();

      // Notify the world if someone waited for update. TODO: should send an event
      if (typeof initCallback === "function") {
        initCallback(graphicsRoot);
      }
    },

    /**
     * Called by Viva.Graph.View.renderer to let concrete graphic output
     * provider release occupied resources.
     */
    release: function(container) {
      if (graphicsRoot && container) {
        container.removeChild(graphicsRoot);
        // TODO: anything else?
      }
    },

    /**
     * Checks whether webgl is supported by this browser.
     */
    isSupported: function() {
      var c = window.document.createElement("canvas"),
        gl = c && c.getContext && c.getContext("experimental-webgl");
      return gl;
    },

    /**
     * Called by Viva.Graph.View.renderer to let concrete graphic output
     * provider remove link from rendering surface.
     *
     * @param linkUI visual representation of the link created by link() execution.
     **/
    releaseLink: function(link) {
      var linkUI = allLinks[link.id];
      delete allLinks[link.id];

      var linkIdToRemove = linkUI.id;
      if (linkUI.arrow) {
        var arrowIdToRemove = linkUI.arrowId;
        arrowProgram.removeArrow(linkUI);

        if (arrowCount > 0) {
          arrowCount -= 1;
          if (arrowIdToRemove < arrowCount) {
            if (arrowCount !== linkIdToRemove) {
              var lastArrowUI = arrows[arrowCount];
              arrows[arrowIdToRemove] = lastArrowUI;
              lastArrowUI.arrowId = arrowIdToRemove;
            }
          }
        }
      }
      if (linkUI.level > 0) {
        curvedLinkProgram.removeLink(linkUI);
        curvedLinksCount = removeLinkFromList(
          curvedLinks,
          curvedLinksCount,
          linkIdToRemove
        );
      } else {
        straightLinkProgram.removeLink(linkUI);
        straightLinksCount = removeLinkFromList(
          straightLinks,
          straightLinksCount,
          linkIdToRemove
        );
      }
    },

    /**
     * Called by Viva.Graph.View.renderer to let concrete graphic output
     * provider remove node from rendering surface.
     *
     * @param nodeUI visual representation of the node created by node() execution.
     **/
    releaseNode: function(node) {
      if (nodesCount > 0) {
        nodesCount -= 1;
      }
      var nodeUI = allNodes[node.id];
      delete allNodes[node.id];

      nodeProgram.removeNode(nodeUI);

      var nodeIdToRemove = nodeUI.id;
      if (nodeIdToRemove < nodesCount) {
        if (nodesCount === 0 || nodesCount === nodeIdToRemove) {
          return; // no more nodes or removed node is the last in the list.
        }

        var lastNodeUI = nodes[nodesCount];

        nodes[nodeIdToRemove] = lastNodeUI;
        lastNodeUI.id = nodeIdToRemove;

        // Since concrete shaders may cache properties in the UI element
        // we are letting them to make this swap (e.g. image node shader
        // uses this approach to update node's offset in the atlas)
        nodeProgram.replaceProperties(nodeUI, lastNodeUI);
      }
    },

    renderNodes: function() {
      var pos = { x: 0, y: 0 };
      // WebGL coordinate system is different. Would be better
      // to have this transform in the shader code, but it would
      // require every shader to be updated..
      for (var i = 0; i < nodesCount; ++i) {
        var ui = nodes[i];
        pos.x = ui.position.x;
        pos.y = ui.position.y;
        if (userPlaceNodeCallback) {
          userPlaceNodeCallback(ui, pos);
        }

        nodeProgram.position(ui, pos);
      }
    },

    renderLinks: function() {
      if (this.omitLinksRendering) {
        return;
      }

      // Draw Straight Links
      for (var i = 0; i < straightLinksCount; ++i) {
        var ui = straightLinks[i];
        var pos = flipLinkCoordinates(ui.pos);
        if (userPlaceLinkCallback) {
          userPlaceLinkCallback(ui, pos.fromPos, pos.toPos);
        }
        if (ui.arrow) {
          arrowProgram.position(
            ui,
            pos.fromPos,
            pos.toPos,
            allNodes[ui.toNodeId].size
          );
        }
        straightLinkProgram.position(
          ui,
          pos.fromPos,
          pos.toPos,
          allNodes[ui.toNodeId].size
        );
      }

      // Draw Curved Links
      for (var i = 0; i < curvedLinksCount; ++i) {
        var ui = curvedLinks[i];
        var pos = flipLinkCoordinates(ui.pos);
        if (userPlaceLinkCallback) {
          userPlaceLinkCallback(ui, pos.fromPos, pos.toPos);
        }
        if (ui.arrow) {
          arrowProgram.position(
            ui,
            pos.fromPos,
            pos.toPos,
            allNodes[ui.toNodeId].size
          );
        }
        curvedLinkProgram.position(
          ui,
          pos.fromPos,
          pos.toPos,
          allNodes[ui.toNodeId].size
        );
      }
    },

    /**
     * Returns root element which hosts graphics.
     */
    getGraphicsRoot: function(callbackWhenReady) {
      // todo: should fire an event, instead of having this context.
      if (typeof callbackWhenReady === "function") {
        if (graphicsRoot) {
          callbackWhenReady(graphicsRoot);
        } else {
          initCallback = callbackWhenReady;
        }
      }
      return graphicsRoot;
    },

    /**
     * Updates default shader which renders nodes
     *
     * @param newProgram to use for nodes.
     */
    setNodeProgram: function(newProgram) {
      if (!gl && newProgram) {
        // Nothing created yet. Just set shader to the new one
        // and let initialization logic take care about the rest.
        nodeProgram = newProgram;
      } else if (newProgram) {
        throw "Not implemented. Cannot swap shader on the fly... Yet.";
        // TODO: unload old shader and reinit.
      }
    },

    /**
     * Updates default shader which renders links
     *
     * @param newProgram to use for links.
     */
    setLinkProgram: function(newProgram) {
      if (!gl && newProgram) {
        // Nothing created yet. Just set shader to the new one
        // and let initialization logic take care about the rest.
        straightLinkProgram = newProgram;
      } else if (newProgram) {
        throw "Not implemented. Cannot swap shader on the fly... Yet.";
        // TODO: unload old shader and reinit.
      }
    },

    /**
     * Transforms client coordinates into layout coordinates. Client coordinates
     * are DOM coordinates relative to the rendering container. Layout
     * coordinates are those assigned by by layout algorithm to each node.
     *
     * @param {Object} p - a point object with `x` and `y` attributes.
     * This method mutates p.
     */
    transformClientToGraphCoordinates: function(p) {
      // TODO: could be a problem when container has margins?
      // normalize
      p.x = (2 * p.x) / width - 1;
      p.y = 1 - (2 * p.y) / height;

      // apply transform
      p.x = (p.x - transform[12]) / transform[0];
      p.y = (p.y - transform[13]) / transform[5];

      // transform to graph coordinates
      p.x = p.x * (width / 2);
      p.y = p.y * (-height / 2);

      return p;
    },

    /**
     * Transforms WebGL coordinates into client coordinates. Reverse of
     * `transformClientToGraphCoordinates()`
     *
     * @param {Object} p - a point object with `x` and `y` attributes, which
     * represents a layout coordinate. This method mutates p.
     */
    transformGraphToClientCoordinates: function(p) {
      // TODO: could be a problem when container has margins?
      // transform from graph coordinates
      p.x = p.x / (width / 2);
      p.y = p.y / (-height / 2);

      // apply transform
      p.x = p.x * transform[0] + transform[12];
      p.y = p.y * transform[5] + transform[13];

      // denormalize
      p.x = ((p.x + 1) * width) / 2;
      p.y = ((1 - p.y) * height) / 2;

      return p;
    },

    getNodeAtClientPos: function(clientPos, preciseCheck) {
      if (typeof preciseCheck !== "function") {
        // we don't know anything about your node structure here :(
        // potentially this could be delegated to node program, but for
        // right now, we are giving up if you don't pass boundary check
        // callback. It answers to a question is nodeUI covers  (x, y)
        return null;
      }
      // first transform to graph coordinates:
      this.transformClientToGraphCoordinates(clientPos);
      // now using precise check iterate over each node and find one within box:
      // TODO: This is poor O(N) performance.
      for (var i = 0; i < nodesCount; ++i) {
        if (preciseCheck(nodes[i], clientPos.x, clientPos.y)) {
          return nodes[i].node;
        }
      }
      return null;
    }
  };

  // Let graphics fire events before we return it to the caller.
  eventify(graphics);

  return graphics;
}
