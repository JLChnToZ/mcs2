(function(exports) {
  var ping = require("./pingger").ping;
  var replaces = require("./replacer").replace;
  var crypto = require("crypto");
  var jsonfile = require("jsonfile");
  var http = require("http");
  var https = require("https");
  var seq = require("seq");
  var _ = require("underscore-plus");
  var mccolor = require("./mccolor.console");
  
  var serverstatus = [];
  var vendors = {};
  var inactiveAttempt = 2;
  
  var fetchServerList = function(srcList, callback) {
    seq()
    .seq(function() {
      this(null, srcList);
    })
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
          try {
            srvlist = JSON.parse(chunks);
            for(var i = 0; i < srvlist.length; i++) {
              var servIPPort = replaces(itm.ip, srvlist[i]).split(":");
              var record = {
                host: servIPPort[0],
                port:  servIPPort.length > 1 ? parseInt(servIPPort[1]) : 25565,
                url: replaces(itm.thread, srvlist[i]),
                status: null,
                lastUpdate: 0,
                inactive: 1
              };
              createHash(record);
              updateServerResult(record, true, false);
            }
          } catch(err) {
            console.log("Error: ", err);
          }
          that();
        });
      });
      req.on('error', function(e) {
        console.log('problem with request: ' + e.message);
        that();
      });
    })
    .seq(callback)
    .catch(function (err) {
      console.log("Error: " + err);
    });
  };
  
  var createHash = function(record) {
    if(!record.port || record.port <= 0 || record.port >= 65535) record.port = 25565;
    return record.hash = crypto.createHash("md5").update(record.host.toLowerCase().trim()+record.port).digest("hex");
  };
  
  var findServerByHash = function(hash) {
    var f = serverstatus.filter(function(o) {
      return o.hash == hash;
    });
    if(f.length > 0) return f[0];
    return null;
  };
  
  var updateServerResult = function(result, addIfNotExists, overrideStatus) {
    var f = findServerByHash(result.hash);
    if(f) {
      f.host = result.host;
      f.port = result.port;
      if(result.url)
        f.url = result.url;
      f.hash = result.hash;
      if(overrideStatus) {
        f.lastUpdate = result.lastUpdate;
        f.status = result.status;
      }
    } else if(addIfNotExists) {
      serverstatus.push(result);
    }
  };
  
  var saveCacheFile = function() {
    jsonfile.writeFile("./cache.json", serverstatus, function(e) {
      if(e) console.log(e.toString());
    });
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
          d.icon = "/images/mc.png";
          for(var v in vendors) {
            var r = new RegExp(v, "i");
            if(r.test(d.version)) {
              d.icon = "/images/" + vendors[v] + ".png";
              break;
            }
          }
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
          if(itm.inactive >= inactiveAttempt) { setTimeout(this, 0); return; }
          break;
        case 2:
          if(itm.inactive < inactiveAttempt) { setTimeout(this, 0); return; }
          break;
      }
      console.log("Request to " + itm.host + ":" + itm.port);
      var _callback = this, called = false;
      var callback = function(err, itm) {
        if(called) return;
        called = true;
        itm = _.deepClone(itm);
        
        if(itm && itm.status && itm.status.icon)
          delete itm.status.icon;
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
  
  exports.run = function(io, config) {
    if(!config) config = {};
    if(config.inactiveAttempt)
      inactiveAttempt = config.inactiveAttempt;
    if(!config.fetchServerListPeriod)
      config.fetchServerListPeriod = 60 * 60 * 1000;
    if(!config.pingActiveServerPeriod)
      config.pingActiveServerPeriod = 5 * 60 * 1000;
    if(!config.pingInactiveServerPeriod)
      config.pingInactiveServerPeriod = 15 * 60 * 1000;
    vendors = config.serverVendors;
    jsonfile.readFile("./cache.json", function(err, result) {
      if(!err) serverstatus = result;
      else console.log("Error while reading cache: ", err.toString());
      fetchServerList(config.sourceList, function() {
        cronFetchServerList(config.fetchServerListPeriod);
        cronPingServer(serverstatus, config.pingActiveServerPeriod, 1, function(err, itm) {
          io.emit("status_update", itm);
          saveCacheFile();
        });
        cronPingServer(serverstatus, config.pingInactiveServerPeriod, 2, function(err, itm) {
          io.emit("status_update", itm);
          saveCacheFile();
        });
      });
    });
  };
  
  exports.serverstatus = function() { return serverstatus; };
  exports.updateServer = updateServerResult;
  exports.saveCache = saveCacheFile;
  exports.pingServer = pingServer;
  exports.findServer = findServerByHash;
  exports.createHash = createHash;
})(module.exports);