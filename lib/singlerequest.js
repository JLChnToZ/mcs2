var _ = require("underscore-plus");

module.exports = function(broadcastUpdate, cron, config) {
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
        var result2 = _.deepClone(original);
        if(result2 && result2.status && result2.status.icon)
          delete result2.status.icon;
        if(result2.addResult) {
          addResult = original.addResult;
          delete result2.addResult;
          broadcastUpdate(result2);
        }
        callback(null, result2);
        cron.updateServer(original, !!(result && addResult), true, !addResult);
      });
    }
  };

  return {
    exposeAPI: exposeAPI
  };
};
