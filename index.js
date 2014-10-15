var ssd = require("start-stop-daemon");
var http = require("http");
var argv = require("argv");
var jsonfile = require("jsonfile");
var express = require("express");
var mustacheExpress = require("mustache-express");
var socketio = require("socket.io");

var cron = require("./lib/cron");

ssd(function() {
  var app = express();
  var httpserv = http.Server(app);
  var io = socketio(httpserv);
  
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
  
  app.use(express.static("./static"));
  
  io.on("connection", function(socket) {
    socket.on("RECONNECTED", function(data) {
      var status = cron.serverstatus();
      for(var i = 0; i < status.length; i++)
        if(status[i].lastUpdate >= data.timeStamp)
          socket.emit("STATUS_UPDATE", status[i]);
    });
  });
  
  jsonfile.readFile("./config.json", function(err, cfg) {
    if(!cfg) cfg = {};
    var runPort = args.options.port || cfg.port || 3838;
    var runIP = args.options.ip || cfg.ip || "0.0.0.0";
    httpserv.listen(runPort, runIP, function() {
      console.log("Server listening on " + runIP + ":" + runPort);
    });
    cron.run(io);
  });

});