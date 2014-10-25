(function(root) {
  var dataRegex = /^data:(.+\/.+);base64,(.*)$/i;
  var spaceRegex = /\s|\r|\n/g;
  
  root.exports = function(dataURL) {
    var matches = dataURL.replace(spaceRegex, "").match(dataRegex);
    if(!matches) return null;
    return {
      type: matches[1],
      buffer: new Buffer(matches[2], "base64")
    };
  };
})(module);