(function(exports) {
  var ping = require("./pingger").ping;
  var replaces = require("./replacer").replace;
  var crypto = require("crypto");
  var jsonfile = require("jsonfile");
  var http = require("http");
  var https = require("https");
  var seq = require("seq");
  var mccolor = require("./mccolor.console");
  
  var serverstatus = [];
  
  var fetchServerList = function(callback) {
    seq()
    .seq(jsonfile.readFile, "./sourcelist.json", seq)
    .flatten()
    .parEach(function(itm, index) {
      var that = this;
      var req = (function(i) { return /^https/i.test(i) ? https : http; })(itm.jsonPath)
      .get(itm.jsonPath, function(res) {
        var chunks = "";
        console.log("Fetched list from " + itm.jsonPath);
        res.setEncoding("utf8");
        res.on("data", function(chunk) {
          chunks += chunk;
        });
        res.on("end", function() {
          srvlist = JSON.parse(chunks);
          for(var i = 0; i < srvlist.length; i++) {
            var servIPPort = replaces(itm.ip, srvlist[i]);
            servIPPort = servIPPort.split(":");
            var servIP = servIPPort[0];
            var servPort = servIPPort.length > 1 ? parseInt(servIPPort[1]) : 25565;
            if(!servPort) servPort = 25565;
            var md5 = crypto.createHash("md5").update(servIP.toLowerCase().trim()+servPort).digest("hex");
            var originalThread = replaces(itm.thread, srvlist[i]);
            var f = serverstatus.filter(function(o) {
              return o.hash == md5;
            });
            if(f.length > 0) {
              f = f[0];
              f.host = servIP;
              f.port = servPort;
              f.url = originalThread;
              f.hash = md5;
            } else {
              f = {
                host: servIP,
                port: servPort,
                hash: md5,
                url: originalThread,
                lastUpdate: 0,
                inactive: 1,
                status: {}
              };
              serverstatus.push(f);
            }
          }
          that();
        });
      });
      req.on('error', function(e) {
        console.log('problem with request: ' + e.message);
        that();
      });
    })
    .seq(callback);
  };
  
  var cronFetchServerList = function(timeout) {
    return setTimeout(function() {
      return fetchServerList(function() {
        return cronFetchServerList(timeout);
      });
    }, timeout);
  };

  var serverCallback = function(itm, response, callback) {
    console.log("Response from " + itm.host + ":" + itm.port);
    if(response) {
      itm.status = response;
      itm.inactive = 0;
      itm.lastUpdate = new Date().getTime();
      console.log(mccolor(response.motd) + ": " + response.currentPlayers + "/" + response.maxPlayers);
    } else {
      itm.status = {};
      itm.inactive++;
      console.log("[INACTIVE]");
    }
    callback(null, itm);
  };
  
  var pingServer = function(itm, mode, callback) {
    return ping(mode, itm.host, itm.port, function(e, d) {
      if(!e && d) {
        if(d.icon) 
          d.icon = d.icon.replace(/\s|\r|\n/g, "");
        if(!d.icon || d.icon.length <= 0) {
          if(/bungeecord/i.test(d.version))
            d.icon = "/images/bungeecord.png";
          else if(/spigot/i.test(d.version))
            d.icon = "/images/spigot.png";
          else if(/bukkit/i.test(d.version))
            d.icon = "/images/bukkit.png";
          else
            d.icon = "/images/mc.png";
        }
      }
      return callback(e, d);
    });
  };
  
  var cronPingServer = function(serverstatus, timeout, mode, cb) {
    var startTime = new Date().getTime();
    seq()
    .seq(function() {
      this(null, serverstatus);
    })
    .flatten()
    .seqEach(function(itm, index) {
      switch(mode) {
        case 1:
          if(itm.inactive > 1) { setTimeout(this, 0); return; }
          break;
        case 2:
          if(itm.inactive < 2) { setTimeout(this, 0); return; }
          break;
      }
      console.log("Request to " + itm.host + ":" + itm.port);
      var _callback = this, called = false;
      var callback = function(err, itm) {
        if(called) return;
        called = true;
        cb(err, itm);
        _callback();
      };
      pingServer(itm, 3, function(err, result) {
        if(err)
          pingServer(itm, 2, function(err2, result2) {
            serverCallback(itm, err2 ? null : result2, callback);
          });
        else
          serverCallback(itm, result, callback);
      });
    }).seq(function() {
      var interval = Math.max(timeout - (new Date().getTime()) + startTime, 1000);
      console.log("Sleep for " + (interval / 1000) + " seconds, max " + (timeout / 1000) + " seconds.");
      setTimeout(function() {
        return cronPingServer(serverstatus, timeout, mode, cb)
      }, interval);
    });
  };
  
  exports.run = function(io) {
    jsonfile.readFile("./cache.json", function(err, result) {
      if(!err)
        serverstatus = result;
      else console.log("Error while reading cache: ", err.toString());
      fetchServerList(function() {
        cronFetchServerList(60 * 60 * 1000);
        cronPingServer(serverstatus, 5 * 60 * 1000, 1, function(err, itm) {
          io.emit("STATUS_UPDATE", itm);
          jsonfile.writeFile("./cache.json", serverstatus, function(e) {
            if(e) console.log(e.toString());
          });
        });
        cronPingServer(serverstatus, 15 * 60 * 1000, 2, function(err, itm) {
          io.emit("STATUS_UPDATE", itm);
          jsonfile.writeFile("./cache.json", serverstatus, function(e) {
            if(e) console.log(e.toString());
          });
        });
      });
    });
  };
  
  exports.serverstatus = function() { return serverstatus; };
})(module.exports);