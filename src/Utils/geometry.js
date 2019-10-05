module.exports = {
  sampleBezier(P0, P1, P2, t) {
    var dt = 1.0 - t;
    var dtSq = dt * dt;
    var tSq = t * t;

    var x = dtSq * P0.x + 2.0 * dt * t * P1.x + tSq * P2.x;
    var y = dtSq * P0.y + 2.0 * dt * t * P1.y + tSq * P2.y;

    return { x: x, y: y };
  },

  computeControlPoint(start, end, level, curviness) {
    var dir = {};
    var mid = {};

    dir.x = end.x - start.x;
    dir.y = end.y - start.y;

    var mag = this.magnitude(dir);
    // var mag = Math.sqrt(dir.x * dir.x, dir.y * dir.y);

    dir.x = dir.x / mag;
    dir.y = dir.y / mag;

    mid.x = (start.x + end.x) / 2;
    mid.y = (start.y + end.y) / 2;

    var multiplier = Math.ceil(level / 2);
    /* offset is proportional to magnitude and
      every additional "shell" is one further out */
    var offset = mag * curviness * multiplier;

    // Control point should alternate sides of link
    if (level % 2 == 1) {
      offset *= -1;
    }

    var control = {
      x: mid.x - dir.y * offset,
      y: mid.y + dir.x * offset
    };

    return control;
  },
  magnitude(vec) {
    return Math.sqrt(vec.x * vec.x + vec.y * vec.y);
  },

  // Compute normalized direction vector from p1 to p2
  normalized_direction(from, to) {
    var dir = { x: 0, y: 0 };
    dir.x = to.x - from.x;
    dir.y = to.y - from.y;

    var mag = this.magnitude(dir);

    dir.x = dir.x / mag;
    dir.y = dir.y / mag;

    return dir;
  }
};
