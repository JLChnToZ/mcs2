module.exports = function(cron, config) {
  if(!config.singleUseLimit) config.singleUseLimit = 10 * 1000;
  
  var singleRequest = function(data, callback) {
    if(!data) data = {};
    if(!data.host) data.host = "127.0.0.1";
    if(!data.lastUpdate) data.lastUpdate = 0;
    cron.createHash(data);
    var record = cron.findServer(data.hash);
    if(record && (new Date().getTime() - record.lastUpdate) < config.singleUseLimit)
      return callback(record, record.status);
    cron.pingServer(data, 3, function(e, d) {
      if(e)
        cron.pingServer(data, 2, function(e2, d2) {
          callback(data, e2 ? null : d);
        });
      else
        callback(data, d);
    });
  };
  
  return {
    registerSocket: function(socket) {
      var useLimits = 0;
      socket.on("request", function(data) {
        var t = new Date().getTime();
        if((t - useLimits) < config.singleUseLimit) {
          socket.emit("single_use_limit_exceeds", {});
          return;
        }
        singleRequest(data, function(original, result) {
          var addResult = false;
          original.status = result;
          original.lastUpdate = useLimits = new Date().getTime();
          if(original.addResult) {
            addResult = original.addResult;
            delete original.addResult;
          }
          socket.emit("single_use_status_update", original);
          cron.updateServer(original, !!(result && addResult), true);
        });
      });
    }
  };
};