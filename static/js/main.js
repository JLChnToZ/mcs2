jQuery(function($) {
  function $create(elm) {
    return $(document.createElement(elm));
  }
  function calcTime() {
    $("div:visible .add-time").each(function() {
      var t = parseInt($(this).attr("data-timestamp"));
      var d, m;
      if(t) {
        d = new Date();
        d.setTime(t);
        m = moment(d).locale("zh-tw");
      }
      $(this).text(t ? m.fromNow() : "N/A");
    });
  }
  $.ajax("/templates/other_info.mustache").done(function(d) {
    $.Mustache.add("other_info", d);
  });
  $.ajax("/templates/status.mustache").done(function(d) {
    $.Mustache.add("status", d);
  });
  var socket = io(), firstConnect = true, lastUpdate = 0;
  socket.on("connect", function() {
    if(firstConnect) {
      firstConnect = false;
      return;
    }
    socket.emit("RECONNECT", { timeStamp: lastUpdate });
    $("#disconnected").fadeOut("fast");
  });
  socket.on("reconnect_attempt", function(times) {
    $("#disconnected").fadeIn("fast");
  });
  socket.on("STATUS_UPDATE", function(data) {
    if(data) {
      var dname = "#d" + data.hash, $dname = $(dname);
      if($dname.length >= 0) {
        $(dname + " .media-object").attr("src", data.status.icon);
        $(dname + " .motd").empty().append(
          $create("span").addClass("mccolor").text(data.status.motd)
        );
        $(dname + " .playerinfo").text(data.status.currentPlayers + " / " + data.status.maxPlayers);
        $(dname + " .add-info").empty().mustache("other_info", data);
        if(data.status && data.status.maxPlayers)
          $dname.fadeIn("medium");
        else
          $dname.fadeOut("medium");
      } else
        $("#slist").mustache("status", data, { method: "append" });
      $(dname + " .mccolor").minecraftFormat();
      lastUpdate = Math.max(lastUpdate, data.lastUpdate);
    }
    calcTime();
  });
  $("div:visible .mccolor").minecraftFormat();
  calcTime();
});