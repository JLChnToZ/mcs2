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
var _ = require("underscore");

var cron = require("./lib/cron");
var singlerequest = require("./lib/singlerequest");

ssd(function() {
  var app = express();
  var httpserv = http.Server(app);
  var io = socketio(httpserv);
  var singlereq;
  var iplist = {};
  var config = {};
  
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
    var cfg = _.clone(config);
    cfg.singleUseLimit /= 1000;
    cfg.fetchServerListPeriod /= 60 * 1000;
    cfg.pingActiveServerPeriod /= 60 * 1000;
    cfg.pingInactiveServerPeriod /= 60 * 1000;
    res.render("index", {
      status: cron.serverstatus(),
      config: cfg
    });
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
    socket.emit("init", {
      timeStamp: new Date().getTime()
    });
    socket.on("reconnected", function(data) {
      var status = cron.serverstatus();
      for(var i = 0; i < status.length; i++)
        if(status[i].lastUpdate >= data.timeStamp)
          socket.emit("status_update", status[i]);
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
  
  jsonfile.readFile("./config.json", function(err, cfg) {
    if(cfg) config = cfg;
    var runPort = args.options.port || config.port || 3838;
    var runIP = args.options.ip || config.ip || "0.0.0.0";
    httpserv.listen(runPort, runIP, function() {
      console.log("Server listening on " + runIP + ":" + runPort);
    });
    cron.run(io, config);
    singlereq = singlerequest(io, cron, config);
  });

});