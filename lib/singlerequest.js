module.exports = function(io, cron, config) {
  if(!config.singleUseLimit) config.singleUseLimit = 10 * 1000;
  
  var singleRequest = function(data, callback) {
    if(!data) data = {};
    if(!data.host) data.host = "127.0.0.1";
    if(!data.lastUpdate) data.lastUpdate = 0;
    cron.createHash(data);
    cron.pingServer(data, 3, function(e, d) {
      if(e)
        cron.pingServer(data, 2, function(e2, d2) {
          callback(data, e2 ? null : d);
        });
      else
        callback(data, d);
    });
  };

  var getTimeStamp = function() {
    return new Date().getTime();
  };
  
  var exposeAPI = function(limitContainer) {
    if(!limitContainer)
      limitContainer = {};
    if(!("useLimits" in limitContainer))
      limitContainer.useLimits = 0;
    return function(data, callback) {
      var t = getTimeStamp(), record = cron.findServer(data.hash);
      if(record && (t - record.lastUpdate) < config.singleUseLimit) {
        process.nextTick(function() {
          callback(null, original);
        });
        return;
      } else if((t - limitContainer.useLimits) < config.singleUseLimit) {
        process.nextTick(function() {
          callback(new Error("Single use limit exceeds"), data);
        });
        return;
      }
      singleRequest(data, function(original, result) {
        var addResult = false;
        original.status = result;
        original.lastUpdate = limitContainer.useLimits = getTimeStamp();
        if(original.addResult) {
          addResult = original.addResult;
          delete original.addResult;
          io.emit("status_update", original); 
        }
        callback(null, original);
        cron.updateServer(original, !!(result && addResult), true);
      });
    }
  };
  
  return {
    exposeAPI: exposeAPI
  };
};