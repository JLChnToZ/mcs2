// # Minecraft server pingger
// (C) Jeremy Lam, JLChnToZ 2014.
// 
// Reference:
// [Minecraft Protocol](http://wiki.vg/Protocol),
// [Minecraft Server List Ping](http://wiki.vg/Server_List_Ping)
(function(exports) {
  var net = require("net");
  var pack = require("bufferpack");
  var encoding = require("encoding");
  var varint = require("varint");

  // ## Helper function for packing data.
  // Used for generate package describe below [(reference)](http://wiki.vg/Server_List_Ping#1.7)
  // > The packets have a length prefix which is a [VarInt](https://developers.google.com/protocol-buffers/docs/encoding#varints). The data contained in the next length bytes is as followed:
  // 
  // > | Field Name | Field Type | Notes |
  // > |------------|------------|-------|
  // > | Packet ID | VarInt |  |
  // > | Data |  |  |
  // > Where data depends on the packet.
  var packData = function(raw) {
    if(raw instanceof Array)
      raw = Buffer.concat(raw);
    return Buffer.concat([
      new Buffer(varint.encode(raw.length)),
      raw
    ]);
  };

  // Main function, ping the Minecraft server and bring callback
  exports.ping = function(mode, host, port, callback) {
    try {
      if(typeof mode != "number" || mode < 0 || mode > 3) mode = 2;
      if(!host) return;
      if(!port || port < 1 || port > 65535) port = 25565;
      if(!callback || typeof callback != "function") callback = function() {};

      var request, response = null;
      var onData = function() {};

      var client = new net.Socket();

      switch(mode) {
        // ## Legacy ping, for versions before 1.7
        case 0: case 1: case 2:
          switch(mode) {
            // ### Mode 0: for Before 1.4
            // [(reference)](http://wiki.vg/Server_List_Ping#Beta_1.8_-_1.3)
            // > Prior to Minecraft 1.4, the client only sends `FE`.
            case 0: request = new Buffer([0xFE]); break;
            // ### Mode 1: Before 1.6
            // [(reference)](http://wiki.vg/Server_List_Ping#1.4_-_1.5)
            // > Prior to the Minecraft 1.6, the client -> server operation is much simpler, and only sends `FE 01`, with none of the following data beginning `FA ...`
            case 1: request = new Buffer([0xFE, 0x01]); break;
            // ### Mode 2: Before 1.7
            // [(reference)](http://wiki.vg/Server_List_Ping#Client_-.3E_Server).
            // > The client initiates a TCP connection to the minecraft server on the standard port. Instead of doing auth and logging in (as detailed in Protocol Encryption), it sends the following data, expressed in hexadecimal:
            // > 1. `FE` - packet identifier for a server list ping
            // > 2. `01` - server list ping's payload (always 1)
            // > 3. `FA` - packet identifier for a plugin message
            // > 4. `00 0B` - length of following string, in characters, as a short (always 11)
            // > 5. `00 4D 00 43 00 7C 00 50 00 69 00 6E 00 67 00 48 00 6F 00 73 00 74` - the string `"MC|PingHost"` encoded as a [UTF-16BE](http://en.wikipedia.org/wiki/UTF-16) string
            // > 6. `XX XX` - length of the rest of the data, as a short. Compute as `7 + 2*len(hostname)`
            // > 7. `XX` - protocol version - currently 74 (decimal)
            // > 8. `XX XX` - length of following string, in characters, as a short
            // > 9. `...` - hostname the client is connecting to, encoded the same way as `"MC|PingHost"`
            // > 10. `XX XX XX XX` - port the client is connecting to, as an int.
            case 2: request = Buffer.concat([
                new Buffer([
                  0xFE, 0x01, 0xFA, 0x00, 0x0B, 0x00, 0x4D, 0x00,
                  0x43, 0x00, 0x7C, 0x00, 0x50, 0x00, 0x69, 0x00,
                  0x6E, 0x00, 0x67, 0x00, 0x48, 0x00, 0x6F, 0x00,
                  0x73, 0x00, 0x74]),
                pack.pack("hbh", 7 + 2 * host.length, 74, host.length),
                encoding.convert(host, "UTF-16BE"),
                pack.pack("i", port)
              ]); break;
          }
          // ### Response handler
          // We mixed up handler for the 1.6 and versions before here.
          //
          // [(reference)](http://wiki.vg/Server_List_Ping#Server_-.3E_Client)
          // > The server responds with a [`0xFF` kick](http://wiki.vg/Protocol#Disconnect.2FKick_.280xFF.29) packet. The packet begins with a single byte identifier ff, then a two-byte big endian short giving the length of the proceeding string in characters. You can actually ignore the length because the server closes the connection after the response is sent.
          // > After the first 3 bytes, the packet is a UTF-16BE string.
          // > It begins with two characters: `§1`, followed by a null character. On the wire these look like `00 a7 00 31 00 00`.
          // Therefore we can check the first 2 characters
          // > The remainder is null character (that is `00 00`) delimited fields:
          // > 1. Protocol version (e.g. 47)
          // > 2. Minecraft server version (e.g. 1.4.2)
          // > 3. Message of the day (e.g. A Minecraft Server)
          // > 4. Current player count
          // > 5. Max players
          //
          // Prior to Minecraft 1.4:
          // [(reference)](http://wiki.vg/Server_List_Ping#Beta_1.8_-_1.3)
          // > Additionally, the response from the server only contains 3 fields delimited by `§`:
          // > 1. Message of the day (e.g. A Minecraft Server)
          // > 2. Current player count
          // > 3. Max players
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
              response.protocolVersion = is1_6 ? parseInt(resp[1]) : 71;
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

       // ## New ping method for 1.7 and versions above
       case 3:
        // [(reference)](http://wiki.vg/Server_List_Ping#Ping_Process)
        // > The server ping process changed in 1.7 in a non-backwards compatible way but the 1.7 server does support both (see below)
        // >
        // > ### Ping Process
        // > Firstly a [Handshake](http://wiki.vg/Protocol#Handshake) packet must be sent with its state set to 1. The layout of the handshake packet is as followed:
        // > Packet ID: `0x00`
        // >
        // > | Field Name | Field Type | Notes |
        // > |---|---|---|
        // > | Protocol Version | VarInt | (4 as of 1.7.2) |
        // > | Server Address (hostname or IP) | String | A string is a VarInt length followed length bytes which make an UTF-8 string |
        // > | Server Port | Unsigned Short | A short has 2 byte size. It should be read in Big-endian order |
        // > | Next state | VarInt | 1 for status |
        // > Followed by a [Status Request](http://wiki.vg/Protocol#Request) packet. The request packet has no fields
        // > Packet ID: `0x00`
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
        // ### Response Handler
        // > The server should respond with a [Status Response](http://wiki.vg/Protocol#Response) packet
        // >
        // > | Field Name | Field Type | Notes |
        // > |---|---|---|
        // > | JSON Response | String | A string is a VarInt length followed length bytes which make an UTF-8 string |
        // > The description field has the same format as [Chat](http://wiki.vg/Chat)
        // > The sample and favicon sections are optional.
        // > The favicon should be a png image that is [Base64](http://en.wikipedia.org/wiki/Base64) encoded and prepended with `'data:image/png;base64,'`
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

      // ## Now we are going to connect to the server here.
      // These are the function calls and callbacks.
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
