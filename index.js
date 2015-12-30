var ssd = require("start-stop-daemon");
var http = require("http");
var argv = require("argv");
var jsonfile = require("jsonfile");
var express = require("express");
var mustacheExpress = require("mustache-express");
var socketio = require("socket.io");
var minify = require("express-minify");
var params = require("express-params");
var compression = require("compression");
var _ = require("underscore-plus");

var dataURL = require("./lib/dataurl");
var cron = require("./lib/cron");
var singlerequest = require("./lib/singlerequest");
var dbadapter = require("./lib/dbadapter");

ssd(function() {
  var app = express();
  var httpserv = http.Server(app);
  var io = socketio(httpserv);
  var singlereq;
  var iplist = {};
  var config = {};
  var onlineCount = 0;
  var stats;

  var args = argv.option([
    {
      name: "port",
      short: "p",
      type: "int",
      description: "(Optional) which port will the server runs on."
    }, {
      name: "ip",
      short: "ip",
      type: "string",
      description: "(Optional) which ip will the server runs on."
    }
  ]).run();

  params.extend(app);
  app.engine("mustache", mustacheExpress());
  app.set("view engine", "mustache");
  app.set("views", __dirname + "/static/templates");

  app.get("/", function(req, res) {
    var cfg = _.deepClone(config);
    cfg.singleUseLimit /= 1000;
    cfg.fetchServerListPeriod /= 60 * 1000;
    cfg.pingActiveServerPeriod /= 60 * 1000;
    cfg.pingInactiveServerPeriod /= 60 * 1000;
    res.render("index", {
      status: _.reduce(cron.serverstatus(), function(arr, item) {
        if(item && item.status && item.status.maxPlayers) arr.push(item);
        return arr;
      }, []),
      config: cfg
    });
  });

  app.get("/headers", function(req, res) {
    res.json(req.headers);
  });

  app.param("hash", /^([a-f0-9]{32})(?:_)?(?:\.png)?$/i);
  app.get("/icons/:hash", function(req, res) {
    var record = cron.findServer(req.params.hash[1]);
    if(record && record.status && record.status.icon) {
      var data = dataURL(record.status.icon);
      if(!data) {
        res.redirect(record.status.icon);
      } else {
        res.type(data.type);
        res.header("Access-Control-Allow-Origin", "*")
        res.header("Access-Control-Allow-Headers", "X-Requested-With");
        res.send(data.buffer);
      }
    } else if(record) {
      res.redirect("/images/mc.png");
    } else {
      res.status(404);
    }
  });

  app.param("ipaddr", /^((?:(?:[0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])\.){3}(?:[0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])|(?:(?:\w|\w[\w\-]*\w)\.)*(?:\w|\w[\w\-]*\w))(?::(0*(?:[1-9][0-9]{0,3}|[1-5][0-9]{4}|6[0-4][0-9]{3}|65[0-4][0-9]{2}|655[0-2][0-9]|6553[0-5])))?(?:\.json)?$/i);
  app.get("/api/:ipaddr", function(req, res) {
    var clientIP = req.get("x-forwarded-for") || req.connection.remoteAddress;
    if(!(clientIP in iplist)) iplist[clientIP] = {};
    singlereq.exposeAPI(iplist[clientIP])({
      host: req.params.ipaddr[1],
      port: req.params.ipaddr.length > 2 ? parseInt(req.params.ipaddr[2]) : 25565,
      addResult: ("addresult" in req.query) ? req.query.addresult == "true" : true,
      url: req.query.ref || req.get("referer") || "",
    }, function(err, data) {
      res.type("application/json");
      res.header("Access-Control-Allow-Origin", "*")
      res.header("Access-Control-Allow-Headers", "X-Requested-With");
      res.header("Cache-Control", "no-cache, must-revalidate");
      if(err && err.message == "Single use limit exceeds") {
        res.header("Expires", new Date().toUTCString());
        res.json({ error: err.message });
      } else {
        res.header("Expires", new Date(Date.now() + ("singleUseLimit" in config ? config.singleUseLimit : 0)).toUTCString());
        res.json(data);
      }
    });
  });

  app.use(function(req, res, next) {
    if (/\.min\.(css|js)$/.test(req.url))
      res._no_minify = true;
    next();
  });
  app.use(compression());
  app.use(minify());
  app.use(express.static(__dirname + "/static"));

  io.on("connection", function(socket) {
   onlineCount++;
    socket.emit("init", {
      timeStamp: new Date().getTime()
    });
    io.emit("online_count", {
      count: onlineCount
    });
    socket.on("disconnect", function() {
      onlineCount--;
      io.emit("online_count", {
        count: onlineCount
      });
    });
    socket.on("reconnected", function(data) {
      var status = cron.serverstatus();
      for(var i = 0; i < status.length; i++)
        if(status[i].lastUpdate >= data.timeStamp)
          socket.emit("status_update", status[i]);
    });
    socket.on("request_stats", function(data) {
      var result = [], amount = 0;
      var eachData = function(hash) {
        var servData = cron.findServer(hash);
        stats.getRecords(hash, config.stats.keepTimespan, function(err, d) {
          if(err)
            console.log(err);
          else {
            var r = {
              name: servData.host + ":" + servData.port,
              dataPoints: []
            };
            for(var j = 0; j < d.length; j++)
              r.dataPoints.push({ x: d[j].time.getTime(), y: d[j].playerCount });
            result.push(r);
          }
          amount++;
          if(amount >= data.length)
            socket.emit("stats_data", result);
        });
      };
      for(var i = 0; i < data.length; i++)
        eachData(data[i]);
    });
    if(singlereq) {
      var _api = singlereq.exposeAPI();
      socket.on("request", function(req) {
        return _api(req, function(err, res) {
          if(err && err.message == "Single use limit exceeds")
            socket.emit("single_use_limit_exceeds", {});
          else
            socket.emit("single_use_status_update", res || req);
        });
      });
    }
  });

  setInterval(function() {
    io.emit("time_update", Date.now());
  }, 10000);

  var broadcastUpdate = function(data) {
    io.emit("status_update", data);
    if(stats)
      stats.saveRecord({
        id: data.hash,
        time: new Date(data.lastUpdate),
        playerCount: data.status ? data.status.currentPlayers : 0
      }, function(err) {
        if(err) console.log(err);
      });
  };

  jsonfile.readFile("./config.json", function(err, cfg) {
    if(cfg) config = cfg;
    var runPort = args.options.port || config.port || process.env.PORT || 3838;
    var runIP = args.options.ip || config.ip || process.env.IP || "0.0.0.0";
    httpserv.listen(runPort, runIP, function() {
      console.log("Server listening on " + runIP + ":" + runPort);
    });
    if(config.stats && config.stats.enabled)
      stats = new dbadapter(config.stats, function(err) {
        if(err) {
          console.log(err);
          stats = null;
        }
      });
    cron.run(broadcastUpdate, config);
    singlereq = singlerequest(broadcastUpdate, cron, config);
  });

});
