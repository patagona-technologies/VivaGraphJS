module.exports = createCircleTexture;

function createCircleTexture(gl) {
  var texBuffer = gl.createTexture();
  if (!texBuffer) throw new Error("Failed to create circle texture");
  gl.bindTexture(gl.TEXTURE_2D, texBuffer);

  var size = 256;
  var image = circle(size);

  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    size,
    size,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    image
  );
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  // gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(
    gl.TEXTURE_2D,
    gl.TEXTURE_MIN_FILTER,
    gl.LINEAR_MIPMAP_LINEAR
  );
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.generateMipmap(gl.TEXTURE_2D);

  return texBuffer;

  function circle(size) {
    var result = new Uint8Array(size * size * 4);
    // var r = (size - 8) / 2;
    var r = size / 2;

    for (var row = 0; row < size; ++row) {
      var offset = row * size;
      for (var col = 0; col < size; ++col) {
        var rgbaCoord = (offset + col) * 4;
        var cy = row - r + 0.5;
        var cx = col - r + 0.5;
        var distToCenter = Math.sqrt(cx * cx + cy * cy);
        if (distToCenter < r) {
          var ratio = 1 - distToCenter / r;
          result[rgbaCoord + 3] = 0xff;
          // result[rgbaCoord + 3] = ratio > 0.3 ? 0xff : 0xff * ratio;
        } else {
          result[rgbaCoord + 3] = 0x00;
        }
      }
    }
    return result;
  }
}
