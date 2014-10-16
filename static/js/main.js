jQuery(function($) {
  var socket = io(), firstConnect = true, lastUpdate = 0, timeOffest = 0;
  function $create(elm) {
    return $(document.createElement(elm));
  }
  function calcTime() {
    $("div:visible .add-time").each(function() {
      var t = parseInt($(this).attr("data-timestamp"));
      $(this).text(t ? moment(t + timeOffest).locale("zh-tw").fromNow() : "-");
    });
  }
  $.ajax("/templates/other_info.mustache").done(function(d) {
    $.Mustache.add("other_info", d);
  });
  $.ajax("/templates/status.mustache").done(function(d) {
    $.Mustache.add("status", d);
  });
  socket.on("connect", function() {
    if(firstConnect) {
      firstConnect = false;
      return;
    }
    socket.emit("reconnected", {
      timeStamp: lastUpdate
    });
    $("#disconnected").fadeOut("fast");
  });
  socket.on("reconnect_attempt", function(times) {
    $("#disconnected").fadeIn("fast");
  });
  socket.on("init", function(data) {
    timeOffset = (new Date().getTime()) - data.timeStamp;
    $("#querybutton").button("reset");
  });
  socket.on("status_update", function(data) {
    if(data) {
      var dname = "#d" + data.hash, $dname = $(dname);
      if($dname.length >= 0) {
        $(dname + " .media-object").attr("src", data.status.icon);
        $(dname + " .motd").empty().append(
          $create("span").addClass("mccolor").text(data.status.motd)
        );
        $(dname + " .playerinfo").text(data.status.currentPlayers + " / " + data.status.maxPlayers);
        $(dname + " .add-info").mustache("other_info", data, { method: "html" });
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
  socket.on("single_use_status_update", function(data) {
    if(data.status) {
      $("#dresult").mustache("status", data, { method: "html" });
      $("#dresult .mccolor").minecraftFormat();
      calcTime();
    } else {
      $("#noresult").fadeIn("fast");
      $("#dresult").empty();
    }
    $("#querybutton").button("reset");
  });
  socket.on("single_use_limit_exceeds", function() {
    $("#limitexceeds").stop().fadeIn("fast").delay(5000).fadeOut("fast");
    $("#querybutton").button("reset");
  });
  $("#requestform").submit(function(e) {
    e.preventDefault();
    $("#querybutton").button("loading");
    $("#noresult").fadeOut("fast");
    socket.emit("request", {
      host: $("#id_host").val(),
      port: parseInt($("#id_port").val(), 10),
      addResult: $("#id_addsuccess").prop("checked")
    });
  });
  $("div:visible .mccolor").minecraftFormat();
  calcTime();
});