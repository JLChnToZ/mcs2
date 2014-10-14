(function() {
  var clc = require("cli-color");
  var xtColors = [0, 19, 34, 37, 124, 127, 214, 145,
    59, 63, 83, 87, 203, 207, 227, 15];
  
  var mccolor = function(options) {
    var escaper = "\u00A7",
      outputNonEscapedChar = true,
      outputEscaper = false,
      cleanUp = false,
      content = "";
    if(typeof options == "string") {
      content = options;
    } else if(typeof options == "object") {
      content = options.content || content;
      escaper = options.escaper || escaper;
      outputNonEscapedChar = "outputNonEscapedChar" in options ? options.outputNonEscapedChar : outputNonEscapedChar;
      outputEscaper = "outputEscaper" in options ? options.outputEscaper : outputEscaper;
    }
    var bold, italic, underline, strike, obf, escaped, styleChanged,
    color = 15, style = clc.xterm(xtColors[color]), buf = [], ret = "";
    var pop = function(s) {
      if(buf[buf.length - 1] == escaper && styleChanged)
        buf.splice(-1, 1);
      if(buf.length > 0) {
        ret += style(buf.join(""));
        buf = [];
      }
      style = clc.xterm(xtColors[color]);
      if(bold) style = style.bold;
      if(italic) style = style.italic;
      if(underline) style = style.underline;
      if(strike) style = style.strike;
    };
    for(var i = 0; i < content.length; i++) {
      var c = content[i];
      var pushing = true;
      if(c == escaper) {
        escaped = true;
      } else if(escaped) {
        styleChanged = true;
        pushing = false;
        var upper = c.toUpperCase();
        switch(upper) {
          case "0": case "1": case "2": case "3":
          case "4": case "5": case "6": case "7":
          case "8": case "9": case "A": case "B":
          case "C": case "D": case "E": case "F":
            color = parseInt(upper, 16);
          break;
          case "K": obf = true; break;
          case "L": bold = true; break;
          case "M": strike = true; break;
          case "N": underline = true; break;
          case "O": italic = true; break;
          case "R": break;
          default:
            styleChanged = false;
            if(outputEscaper) buf.push(escaper);
            if(outputNonEscapedChar) buf.push(c);
            break;
        }
        if("0123456789ABCDEFR".indexOf(upper) != -1)
          bold = underline = strike = italic = obf = false;
        escaped = false;
      }
      if(styleChanged) {
        pop();
        styleChanged = false;
      }
      if(pushing)
        buf.push(c);
    }
    pop();
    return ret;
  };
  
  module.exports = mccolor;
})();