(function(exports) {
  var net = require("net");
  var pack = require("bufferpack");
  var encoding = require("encoding");
  var varint = require("varint");
  
  var packData = function(raw) {
    if(raw instanceof Array)
      raw = Buffer.concat(raw);
    return Buffer.concat([
      new Buffer(varint.encode(raw.length)),
      raw
    ]);
  };
  
  exports.ping = function(mode, host, port, callback) {
    try {
      if(!mode) mode = 2;
      if(!host) return;
      if(!port || port < 1 || port > 65535) port = 25565;
      if(!callback || typeof callback != "function") callback = function() {};
      
      var request, response = null;
      var onData = function() {};
      
      var client = new net.Socket();
      
      switch(mode) {
        case 0: case 1: case 2: // Legacy ping, for versions before 1.7
          switch(mode) {
            case 0: request = new Buffer([0xFE]); break; // Mode 0: for Before 1.4
            case 1: request = new Buffer([0xFE, 0x01]); break; // Mode 1: Before 1.6
            case 2: request = Buffer.concat([ // Mode 2: Before 1.7
                new Buffer([ // Hardcoded payload
                  0xFE, 0x01, 0xFA, 0x00, 0x0B, 0x00, 0x4D, 0x00,
                  0x43, 0x00, 0x7C, 0x00, 0x50, 0x00, 0x69, 0x00,
                  0x6E, 0x00, 0x67, 0x00, 0x48, 0x00, 0x6F, 0x00,
                  0x73, 0x00, 0x74]),
                pack.pack("h", 7 + 2 * host.length),
                encoding.convert(host, "UTF-16BE"),
                pack.pack("i", port)
              ]); break;
          }
          onData = function(data) {
            try {
              var resp = "", is1_6 = false;
              if(data[0] != 0xFF) {
                callback(new Error("Invalid handshake."));
                client.destroy();
                return;
              }
              resp = encoding.convert(data.slice(3), "UTF-8", "UTF-16BE").toString();
              is1_6 = resp[0] == "\u00a7" && resp[1] == "1";
              resp = resp.split(is1_6 ? "\u0000" : "\u00a7");
              response = {};
              response.protocolVersion = is1_6 ? parseInt(resp[1]) : 71; // 71 is just a guess
              response.version = is1_6 ? resp[2] : "<= 1.5.x";
              response.motd = resp[is1_6 ? 3 : 0];
              response.currentPlayers = parseInt(resp[is1_6 ? 4 : 1]);
              response.maxPlayers = parseInt(resp[is1_6 ? 5 : 2]);
            } catch(err) {
              callback(err);
            }
            client.destroy();
          };
          break;
        
       case 3: // New ping method, for 1.7 and versions above
        request = [
          packData([
            new Buffer([0x00]),
            new Buffer(varint.encode(4)),
            new Buffer(varint.encode(host.length)),
            new Buffer(host, "utf8"),
            pack.pack("H", port),
            new Buffer(varint.encode(1))
          ]),
          packData(new Buffer([0x00]))
        ];
        var dataLength = -1, currentLength = 0, chunks = [];
        onData = function(data) {
          try {
            if(dataLength < 0) {
              dataLength = varint.decode(data);
              data = data.slice(varint.decode.bytes);
              if(data[0] != 0x00) {
                callback(new Error("Invalid handshake."));
                client.destroy();
                return;
              }
              data = data.slice(1);
              currentLength++;
            }
            currentLength += data.length;
            chunks.push(data);
            
            if(currentLength >= dataLength) {
              data = Buffer.concat(chunks);
              var strLen = varint.decode(data);
              var strLenOffset = varint.decode.bytes;
              var resp = JSON.parse(data.toString("utf8", strLenOffset));
              response = {};
              response.protocolVersion = resp.version.protocol;
              response.version = resp.version.name;
              response.motd = resp.description;
              response.currentPlayers = resp.players.online;
              response.maxPlayers = resp.players.max;
              if(resp.players.sample)
                response.players = resp.players.sample;
              if(resp.favicon)
                response.icon = resp.favicon;
              client.destroy();
            }
          } catch(err) {
            callback(err);
            client.destroy();
          }
        };
        break;
      }
      
      client.connect(port, host, function() {
        if(!request) return;
        if(!(request instanceof Array))
          request = [request];
        for(var i = 0; i < request.length; i++)
          client.write(request[i]);
      });
      client.on("data", onData);
      client.on("close", function() {
        callback(null, response);
      });
      client.setTimeout(5000);
      client.on("timeout", function() {
        client.destroy();
      });
      client.on("error", function(err) {
        callback(err);
      });
    } catch(err) {
      callback(err);
    }
    return client;
  };
})(module.exports);
