module.exports = createLayout;
/* eslint no-unused-vars: off */

function createLayout(graph, positions, settings) {
  // Load positions into dict

  var nodes = {};
  var edges = {};

  var nnodes = Object.keys(positions).length;

  var width = Math.sqrt(nnodes / (1 / settings.width));
  var height = Math.sqrt(nnodes / (1 / settings.width));

  var defaultRect = function() {
    return {
      x1: 100000,
      y1: 100000,
      x2: -100000,
      y2: -100000
    };
  };

  var graphRect = defaultRect();

  var updateGraphRect = function(position, graphRect) {
    if (position.x < graphRect.x1) {
      graphRect.x1 = position.x;
    }
    if (position.x > graphRect.x2) {
      graphRect.x2 = position.x;
    }
    if (position.y < graphRect.y1) {
      graphRect.y1 = position.y;
    }
    if (position.y > graphRect.y2) {
      graphRect.y2 = position.y;
    }
  };

  var ensureLinkInitialized = function(link) {
    edges[link.id] = link;
  };

  var ensureNodeInitialized = function(node) {
    updateGraphRect(nodes[node.id], graphRect);
  };

  var initializePosition = function(node) {
    nodes[node.id] = {
      x: positions[node.id].x * width,
      y: positions[node.id].y * height
    };
  };

  graph.forEachNode(initializePosition);
  graph.forEachNode(ensureNodeInitialized);
  graph.forEachLink(ensureLinkInitialized);

  return {
    setNewPositions: function(newPositions) {
      positions = newPositions;
      graph.forEachNode(initializePosition);
      graphRect = defaultRect();
      graphRect = graph.forEachNode(ensureNodeInitialized);
    },

    getNodePosition: function(nodeId) {
      return nodes[nodeId];
    },

    /**
     * Returns {from, to} position of a link.
     */
    getLinkPosition: function(linkId) {
      var edge = edges[linkId];
      return {
        from: nodes[edge.fromId],
        to: nodes[edge.toId]
      };
    },

    step: function(linkId) {
      return true;
    },

    /**
     * @returns {Object} area required to fit in the graph. Object contains
     * `x1`, `y1` - top left coordinates
     * `x2`, `y2` - bottom right coordinates
     */
    getGraphRect: function() {
      return graphRect;
    },

    isNodePinned: function(node) {
      return false;
    },

    pinNode: function(node, isPinned) {
      return null;
    },

    setNodePosition: function(nodeId, x, y) {
      nodes[nodeId].pos.x = x;
      nodes[nodeId].pos.y = y;
    },

    dispose: function() {}
  };
  /**
   * For a given `nodeId` returns position
   */
}
