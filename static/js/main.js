jQuery(function($) {
  var socket = io(), firstConnect = true, lastUpdate = 0, timeOffest = 0, isTraditional = true;
  var indeces = lunr(function() {
    this.field("motd", { boost: 10 });
    this.field("players", { boost: 8 });
    this.field("url", { boost: 6 });
    this.ref("id");
  });
  function $create(elm) {
    return $(document.createElement(elm));
  }
  function calcTime() {
    $("div:visible .add-time").each(function() {
      var t = parseInt($(this).attr("data-timestamp"));
      $(this).text(t ? moment(t + timeOffest).locale(isTraditional ? "zh-tw" : "zh-cn").fromNow() : "-");
    });
  }
  function indexItem(e) {
    indeces.add({
      id: e.attr("id"),
      motd: e.find(".motd").text(),
      players: e.find(".players").text(),
      url: e.find(".host").text()
    });
  }
  function doSearch() {
    var val = $("#searchtext").val();
    if(val.length > 0) {
      $("#slist .media").hide();
      $.each(indeces.search(val), function(i, e) {
        var $e = $("#" + e.ref);
        if($e.attr("data-hidden") != "true") $e.show();
      });
    } else {
      $("#slist .media").each(function(i, e) {
        var $e = $(e);
        $e.toggle($e.attr("data-hidden") != "true");
      });
    }
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
  socket.on("online_count", function(data) {
    $("#onlinecount").text(data.count);
  });
  socket.on("status_update", function(data) {
    if(data) {
      var dname = "#d" + data.hash, $dname = $(dname), hasData;
      if($dname.length >= 0) {
        $(dname + " .media-object").attr("src", "/icons/" + data.hash + ".png?t=" + data.lastUpdate);
        $(dname + " .motd").empty().append(
          $create("span").addClass("mccolor").text(data.status.motd)
        );
        $(dname + " .playerinfo").text(data.status.currentPlayers + " / " + data.status.maxPlayers);
        $(dname + " .add-info").mustache("other_info", data, { method: "html" });
        hasData = data.status && data.status.maxPlayers;
        if($("#searchtext").val().length <= 0) {
          if(hasData)
            $dname.fadeIn("medium");
          else
            $dname.fadeOut("medium");
        }
        $dname.attr("data-hidden", hasData ? "false" : "true");
      } else
        $("#slist").mustache("status", data, { method: "append" });
      $(dname + " .mccolor").minecraftFormat();
      lastUpdate = Math.max(lastUpdate, data.lastUpdate);
      if(!isTraditional) $dname.t2s();
      indexItem($dname);
    }
    calcTime();
  });
  socket.on("single_use_status_update", function(data) {
    if(data.status) {
      data.hash += "_"; // The hash must be unique, and it will duplicate with the one in the list.
      $("#dresult").mustache("status", data, { method: "html" });
      $("#dresult .mccolor").minecraftFormat();
      if(!isTraditional) $("#dresult").t2s();
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
  socket.on("stats_data", function(data) {
    for(var i = 0; i < data.length; i++) {
      data[i].type = "line";
      data[i].showInLegend = true;
      data[i].markerSize = 0;
      for(var j = 0; j < data[i].dataPoints.length; j++)
        data[i].dataPoints[j].x = new Date(data[i].dataPoints[j].x);
    }
    $("#chart").CanvasJSChart({
      zoomEnabled: true,
      title: {
        text: "伺服器人數統計"
      },
      toolTip: {
        shared: "true"
      },
      axisX: {
        title: "時間"
      },
      axisY: {
        title: "人數"
      },
      data: data
    });
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
  $("body").on("click", ".navbar-collapse ul li a:not(.dropdown-toggle)", function() {
    $(".navbar-toggle:visible").click();
  }).popover({
    html: true,
    placement: "bottom",
    selector: ".showplayers",
    trigger: "focus",
    container: "body",
    content: function() {
      return $(this).closest(".media").find(".playerdetails").html();
    }
  }).tooltip({
    selector: ".navbar-nav li a",
    container: "body",
    placement: "bottom"
  });
  $("#t2s").click(function(e) {
    e.preventDefault();
    isTraditional = !isTraditional;
    if(isTraditional)
      $("body").s2t();
    else
      $("body").t2s();
    $(this).text(isTraditional ? "简" : "繁");
    calcTime();
  });
  $("#showstats").click(function(e) {
    e.preventDefault();
    var arr = [];
    $(".media:visible .selectserver:checked").each(function() {
      arr.push($(this).val());
    });
    $("#statsmodal").modal("show");
    $("#chart").toggle(arr.length > 0);
    if(arr.length > 0) {
      $("#noresult2").hide();
      setTimeout(function() {
        socket.emit("request_stats", arr);
      }, 800); // Delay a bit.
    } else
      $("#noresult2").fadeIn("fast");
  });
  $("#search").submit(function(e) {
    e.preventDefault();
    doSearch();
  });
  $("#searchtext").keyup(doSearch);
  $("div:visible .mccolor").minecraftFormat();
  $("#slist .media").each(function(i, e) {
    indexItem($(e));
  });
  calcTime();
});