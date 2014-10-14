(function(exports) {
  var escapeRegexp = function(s) {
    return s.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
  };
  exports.replace = function(original, modlist) {
    if(typeof original != "string") return original;
    for(var key in modlist) {
      if(typeof modlist[key] != "string") modlist[key] = modlist[key].toString();
      var r = new RegExp("\\{" + escapeRegexp(key) + "\\}", "gi");
      original = original.replace(r, modlist[key]);
    }
    return original;
  };
})(module.exports);