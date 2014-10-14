// Minecraft Color Formatting JQuery Plugin
// (c) JLChnToZ 2014
(function($) {
  var $create, MCColors, rndstr;
  MCColors = [0, 10, 160, 170, 2560, 2570, 4000, 2730, 1365, 1375, 1525, 1535, 3925, 3935, 4085, 4095];
  rndstr = function(len, chars) {
    var i, ret, rnd, _i, _j, _results;
    if (chars == null) {
      chars = String.fromCharCode.apply(null, (function() {
        _results = [];
        for (_i = 33; _i <= 126; _i++){ _results.push(_i); }
        return _results;
      }).apply(this));
    }
    ret = "";
    for (i = _j = 0; 0 <= len ? _j < len : _j > len; i = 0 <= len ? ++_j : --_j) {
      rnd = Math.floor(Math.random() * chars.length);
      ret += chars.substring(rnd, rnd + 1);
    }
    return ret;
  };
  $create = function(elm) {
    return $(document.createElement(elm));
  };
  $.event.special.destroyed = {
    remove: function(o) {
      return typeof o.handler === "function" ? o.handler() : void 0;
    }
  };
  $.fn.minecraftFormat = function(options) {
    var cleanUp, content, escaper, outputEscaper, outputNonEscapedChar, _ref, _ref1, _ref2;
    escaper = "\u00A7";
    outputNonEscapedChar = true;
    outputEscaper = false;
    cleanUp = false;
    if (typeof options === "string") {
      content = options;
    } else if (typeof options === "object") {
      content = options.content;
      escaper = (_ref = options.escaper) != null ? _ref : escaper;
      outputNonEscapedChar = (_ref1 = options.outputNonEscapedChar) != null ? _ref1 : outputNonEscapedChar;
      outputEscaper = (_ref2 = options.outputEscaper) != null ? _ref2 : outputEscaper;
    }
    return $(this).each(function() {
      var dummy, findTextNodes, textNodes;
      if (content != null) {
        $(this).empty();
      }
      textNodes = [];
      findTextNodes = function(node) {
        if (node) {
          node = node.firstChild;
          while (node != null) {
            switch (node.nodeType) {
              case 1:
                findTextNodes(node);
                break;
              case 3:
                textNodes.push(node);
            }
            node = node.nextSibling;
          }
        }
        return node;
      };
      findTextNodes(this);
      if (textNodes.length === 0) {
        dummy = document.createTextNode("");
        textNodes.push(dummy);
        $(this).append(dummy);
      }
      return $.each(textNodes, function() {
        var $this, bold, buffer, char, color, escaped, italic, logOutput, lower, obfuscate, obfuscated, pushing, src, strike, styleChanged, styleContainer, underline, _create, _i, _len, _pop;
        if ($(this).parent().data("mcformatted")) {
          return true;
        }
        logOutput = [""];
        $this = $create("span");
        bold = italic = underline = strike = false;
        obfuscate = obfuscated = escaped = styleChanged = false;
        color = 15;
        buffer = [];
        _create = function() {
          var deco, style;
          style = {};
          deco = [];
          style.color = "#" + ("000" + (MCColors[color].toString(16))).substr(-3);
          if (bold) {
            style.fontWeight = "bold";
          }
          if (italic) {
            style.fontStyle = "italic";
          }
          if (underline) {
            deco.push("underline");
          }
          if (strike) {
            deco.push("line-through");
          }
          if (deco.length > 0) {
            style.textDecoration = deco.join(" ");
          }
          return $create("span").css(style).data("mcformatted", true);
        };
        _pop = function() {
          var buf, interval, obfuscatedContainer;
          if (buffer[buffer.length - 1] === escaper && styleChanged) {
            buffer.splice(buffer.length - 1, 1);
          }
          if (buffer.length > 0) {
            buf = buffer.join("");
            logOutput[0] += "%c" + buf;
            logOutput.push("background:#000;" + styleContainer.attr("style"));
            $this.append(styleContainer.text(buf));
            if (obfuscated) {
              obfuscatedContainer = styleContainer.data("text-length", styleContainer.text().length);
              interval = setInterval(function() {
                obfuscatedContainer.text(rndstr(obfuscatedContainer.data("text-length")));
              }, 25);
              obfuscatedContainer.bind("destroyed", function() {
                return clearInterval(interval);
              });
            }
            buffer = [];
          }
          obfuscated = obfuscate;
        };
        styleContainer = _create();
        src = content != null ? content : this.nodeValue;
        $this.empty();
        for (_i = 0, _len = src.length; _i < _len; _i++) {
          char = src[_i];
          pushing = true;
          if (char === escaper) {
            escaped = true;
          } else if (escaped) {
            styleChanged = true;
            pushing = false;
            lower = char.toLowerCase();
            switch (lower) {
              case "0":
              case "1":
              case "2":
              case "3":
              case "4":
              case "5":
              case "6":
              case "7":
              case "8":
              case "9":
              case "a":
              case "b":
              case "c":
              case "d":
              case "e":
              case "f":
                color = parseInt(char, 16);
                break;
              case "k":
                obfuscate = true;
                break;
              case "l":
                bold = true;
                break;
              case "m":
                strike = true;
                break;
              case "n":
                underline = true;
                break;
              case "o":
                italic = true;
                break;
              case "r":
                break;
              default:
                styleChanged = false;
                if (outputEscaper) {
                  buffer.push(escaper);
                }
                if (outputNonEscapedChar) {
                  buffer.push(char);
                }
            }
            if ("0123456789abcdefr".indexOf(lower) !== -1) {
              bold = underline = strike = italic = obfuscate = false;
            }
            escaped = false;
          }
          if (styleChanged) {
            _pop();
            styleContainer = _create();
            styleChanged = false;
          }
          if (pushing) {
            buffer.push(char);
          }
        }
        _pop();
        if (logOutput[0].length > 0) {
          console.log.apply(console, logOutput);
        }
        return $(this).after($this.children()).parent()[0].removeChild(this);
      });
    });
  };
})(jQuery);
