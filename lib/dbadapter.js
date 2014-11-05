(function(root) {
  var mongo = require("mongoose");
  var db, opts = {};
  var Record = mongo.model("Record", new mongo.Schema({
    id: {
      type: String,
      default: "0000000000000000000000000000000"
    },
    time: {
      type: Date,
      default: Date.now
    },
    playerCount: Number
  }));
  var removeOutdated = function() {
    Record.remove({
      time: {
        $lte: Date.now() - opts.keepTimespan
      }
    }, function(err) {
      if(err) console.log(err);
    });
  };
  root.exports = function(options, callback) {
    if(typeof options == "object")
      opts = options;
    mongo.connect(opts.db);
    mongo.connection.on("error", callback);
    mongo.connection.once("connect", callback);
    this.saveRecord = function(content, cb) {
      var snapshot = new Record(content);
      snapshot.save(function(e, d) {
        console.log(e ? e : "Record saved with no errors.");
        cb(e);
      });
      removeOutdated();
    };
    this.getRecords = function(id, amount, cb) {
      var endTime = Date.now(), startTime = endTime - amount;
      Record.find({
        id: id,
        time: {
          $lte: endTime,
          $gt: startTime
        }
      }, cb);
      removeOutdated();
    };
  };
  if(exports) exports = root.exports;
})(module || {});