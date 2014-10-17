var ssd = require("start-stop-daemon");
var http = require("http");
var argv = require("argv");
var jsonfile = require("jsonfile");
var express = require("express");
var mustacheExpress = require("mustache-express");
var socketio = require("socket.io");
var minify = require("express-minify");
var compression = require("compression");

var cron = require("./lib/cron");
var singlerequest = require("./lib/singlerequest");

ssd(function() {
  var app = express();
  var httpserv = http.Server(app);
  var io = socketio(httpserv);
  var singlereq;
  
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
  
  app.engine("mustache", mustacheExpress());
  app.set("view engine", "mustache");
  app.set("views", __dirname + "/static/templates");
  
  app.get("/", function(req, res) {
    res.render("index", { status: cron.serverstatus() });
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
    if(singlereq)
      singlereq.registerSocket(io, socket);
  });
  
  jsonfile.readFile("./config.json", function(err, cfg) {
    if(!cfg) cfg = {};
    var runPort = args.options.port || cfg.port || 3838;
    var runIP = args.options.ip || cfg.ip || "0.0.0.0";
    httpserv.listen(runPort, runIP, function() {
      console.log("Server listening on " + runIP + ":" + runPort);
    });
    cron.run(io, cfg);
    singlereq = singlerequest(cron, cfg);
  });

});