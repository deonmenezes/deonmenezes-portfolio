/* globe.js · dotted 3D world for the "worldwide" section
   Landmass dots on a fibonacci sphere, accent pins on client cities,
   drag to spin. Renders one static frame under reduced motion. */
(function () {
  "use strict";
  var cv = document.getElementById("globe");
  if (!cv || !cv.getContext) return;
  var ctx = cv.getContext("2d");
  var reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* 192x96 equirectangular land bitmask (1 bit per cell, row-major from 90N) */
  var MW = 192, MH = 96;
  var MASK = atob(
    "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAH8AAAAAAAAAAAAAAAAAAAAAAAAAB//H///eAAAAAAAAAAAAAAAAAAAAAAAAH/4f///wAAtwAAAAAOAAAAAAAAAAAAAgEfD////wAANgAAAAAAAAAAAAAAAAAADVzAAD///gAAAAAAOAAP/gAcAAAAAAAA8AGAAA///gAAAAABgAD/+AAAAAAAAAAB300/wAf/+AAAAAADAZ////4PwAAAD+AAA/Gf/Af/8AAAA8AAA7///////gAgf///+MDuPAP/4AAAH/5C/b/////////+P//////8H4P/AAAAf/c//3/////////Ef//////s/gPwA8AA+fv////////////AP/////+ADAHgAAAH9//////////////AP7////8AeADgAAAH5///////////+XwADwD///8A+QAAAAAG8//////////8EYAABgAf///Af4AAAAGB5f/////////wB4AAEAAP///4/8AAAAGCh//////////gBwAAAAAX///8//AAAAbH///////////4BgAAAAAD///+//AAAAHv///////////4BAAAAAAC/////JAAAAA////////////6AAAAAAAAf////jwAAAD////////////wAAAAAAAA/////0AAAAB//8vz///////gAAAAAAAA////+QAAAAB9v4Hn///////HAAAAAAAA////8AAAAAfwz4Dz//////4AAAAAAAAA////4AAAAAfCPv/7/////94EAAAAAAAA////wAAAAAfAJv/x/////4YIAAAAAAAAf///wAAAAAEfAFf//////+YYAAAAAAAAP///gAAAAAH/ABf//////8TwAAAAAAAAH//+AAAAAAf/hAf//////+EAAAAAAAAAC//+AAAAAAf/57///////+AAAAAAAAAAA/4CAAAAAA///+f3/////+AAAAAAAAAABfwCAAAAAB////fz/////8AAAAAAAAAAAvwAAAAAAD////P9P////8AAAAAAAAAAAXwAAAAAAH////n/gf///yAAAAAAAAAAADwAgAAAAH////3/wf+f/AAAAAAAAAAAAD4gEAAAAH////z/gH8PyAAAAAAAAAAAAA/gAAAAAH////7/AHwP4CAAAAAAAAAAAALgAAAAAH////58AHgL8CAAAAAAAAAAAAB8AAAAAH////9wADgD8DAAAAAAAAAAAAAIAAAAAH////+AADgAcAgAAAAAAAAAAAAMPsAAAD/////4ABAAIEAAAAAAAAAAAAAG/8AAAB/////4ABACAAgAAAAAAAAAAAAAf+AAAA/////wAAQBAIgAAAAAAAAAAAAAf/wAAAQF///wAAAEgYAAAAAAAAAAAAAA//4AAAAB///gAAACg4AAAAAAAAAAAAAA//4AAAAB//+AAAABj6oAAAAAAAAAAAAB//+AAAAB//8AAAABj5CAAAAAAAAAAAAB///wAAAB//4AAAAAx0D4IAAAAAAAAAAB///8AAAA//4AAAAAQBAfEAAAAAAAAAAB///+AAAAf/4AAAAAMAAPgAAAAAAAAAAA///+AAAAf/4AAAAAATQEgAAAAAAAAAAA///+AAAAf/4AAAAAAAAAAAAAAAAAAAAAf//8AAAAf/8AAAAAAABgAAAAAAAAAAAAf//4AAAAf/8IAAAAAAXCAAAAAAAAAAAAP//4AAAA//44AAAAAA/nAAAAAAAAAAAAD//4AAAA//xwAAAAAB//AAAAAAAAAAAAB//4AAAAf/gwAAAAAD//gAAAAAAAAAAAB//wAAAAf/hwAAAAAf//wCAAAAAAAAAAD//AAAAAP/hgAAAAAf//wAAAAAAAAAAAD/8AAAAAP/AgAAAAAf//8AAAAAAAAAAAD/8AAAAAP+AAAAAAAf//8AAAAAAAAAAAD/8AAAAAH+AAAAAAAf//8AAAAAAAAAAAD/4AAAAAH8AAAAAAAP//8AAAAAAAAAAAD/wAAAAAD4AAAAAAAPg/4AAAAAAAAAAAH+gAAAAACAAAAAAAAIA/wAAAAAAAAAAAH/AAAAAAAAAAAAAAAAAHwAAAAAAAAAAAH+AAAAAAAAAAAAAAAAADAAGAAAAAAAAAH4AAAAAAAAAAAAAAAAAAAAEAAAAAAAAAPgAAAAAAAAAAAAAAAAAAgAYAAAAAAAAAHgAAAAAAAAAAAAAAAAAAAAwAAAAAAAAAPAAAAAAAAAAAAAAAAAAAABgAAAAAAAAAPgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAOCAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwAAAAAAAAAHgAAAxhHgAAAAAAAAAAAAAgAAAAAAAAB//g//////wAAAAAAAAAAAC4AAAAACfH///H///////wAAAAAAAA4AK4AAAA///////v////////gAAAAABB///4AAAD///////////////+AAAA///////AAAAf///////////////4AAA///////4AAA/////////////////8AAAB//////gAHgP////////////////wAAAf///////gAP/////////////////wAAAP////////////////////////////AABDAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
  );
  function land(lat, lon) {
    var x = Math.min(MW - 1, Math.max(0, Math.floor((lon + 180) / 360 * MW)));
    var y = Math.min(MH - 1, Math.max(0, Math.floor((90 - lat) / 180 * MH)));
    var i = y * MW + x;
    return (MASK.charCodeAt(i >> 3) & (1 << (7 - (i & 7)))) !== 0;
  }

  /* land dots on a fibonacci sphere (skip Antarctica: it hogs the south pole) */
  var dots = [];
  var N = 3600, GA = Math.PI * (3 - Math.sqrt(5));
  for (var i = 0; i < N; i++) {
    var y = 1 - 2 * (i + 0.5) / N;
    var lat = Math.asin(y) * 180 / Math.PI;
    var lon = ((GA * i) % (2 * Math.PI)) * 180 / Math.PI - 180;
    if (lat > -60 && land(lat, lon)) {
      var la = lat * Math.PI / 180, lo = lon * Math.PI / 180;
      dots.push([Math.cos(la), Math.sin(la), lo]);
    }
  }

  /* client cities · [lat, lon] */
  var CITIES = [
    [37.77, -122.42], /* san francisco */
    [19.08, 72.88],   /* mumbai */
    [25.20, 55.27],   /* dubai */
    [40.71, -74.01],  /* new york */
    [51.51, -0.13],   /* london */
    [52.52, 13.40],   /* berlin */
    [1.35, 103.82],   /* singapore */
    [35.68, 139.69],  /* tokyo */
    [-33.87, 151.21], /* sydney */
    [43.65, -79.38]   /* toronto */
  ].map(function (c, k) {
    var la = c[0] * Math.PI / 180, lo = c[1] * Math.PI / 180;
    return [Math.cos(la), Math.sin(la), lo, k * 1.7];
  });

  var TILT = 0.42, cosT = Math.cos(TILT), sinT = Math.sin(TILT);
  var INK = "33,29,24", ACCENT = "224,80,45";
  var rot = 2.2, vel = 0, dragging = false, lastX = 0, size = 0, dpr = 1;

  function fit() {
    dpr = Math.min(2, devicePixelRatio || 1);
    size = cv.clientWidth || cv.parentElement.clientWidth;
    cv.width = cv.height = Math.round(size * dpr);
  }

  function draw(t) {
    var s = cv.width, c = s / 2, R = s * 0.42;
    ctx.clearRect(0, 0, s, s);

    /* soft sphere wash + rim */
    var g = ctx.createRadialGradient(c - R * 0.35, c - R * 0.4, R * 0.1, c, c, R);
    g.addColorStop(0, "rgba(255,253,247,0.9)");
    g.addColorStop(1, "rgba(222,214,198,0.55)");
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(c, c, R, 0, 7); ctx.fill();
    ctx.strokeStyle = "rgba(" + INK + ",0.35)";
    ctx.lineWidth = Math.max(1, s * 0.004);
    ctx.stroke();

    function project(cl, sl, lo) {
      var x = cl * Math.sin(lo + rot);
      var y1 = sl;
      var z1 = cl * Math.cos(lo + rot);
      return [c + R * x, c - R * (y1 * cosT - z1 * sinT), y1 * sinT + z1 * cosT];
    }

    /* batch dots into a few alpha buckets: 5 fills instead of ~1300 */
    var i, p, r, b, buckets = [[], [], [], [], []];
    for (i = 0; i < dots.length; i++) {
      p = project(dots[i][0], dots[i][1], dots[i][2]);
      if (p[2] <= 0.02) continue;
      buckets[Math.min(4, (p[2] * 5) | 0)].push(p);
    }
    for (b = 0; b < 5; b++) {
      var bk = buckets[b], z = (b + 0.5) / 5;
      if (!bk.length) continue;
      r = R * 0.0115 * (0.62 + 0.5 * z);
      ctx.fillStyle = "rgba(" + INK + "," + (0.16 + 0.6 * z).toFixed(3) + ")";
      ctx.beginPath();
      for (i = 0; i < bk.length; i++) {
        ctx.moveTo(bk[i][0] + r, bk[i][1]);
        ctx.arc(bk[i][0], bk[i][1], r, 0, 7);
      }
      ctx.fill();
    }
    for (i = 0; i < CITIES.length; i++) {
      p = project(CITIES[i][0], CITIES[i][1], CITIES[i][2]);
      if (p[2] <= 0.04) continue;
      var pulse = reduced ? 0.5 : (Math.sin(t / 700 + CITIES[i][3]) + 1) / 2;
      ctx.strokeStyle = "rgba(" + ACCENT + "," + (0.55 * (1 - pulse) * p[2]).toFixed(3) + ")";
      ctx.lineWidth = Math.max(1, s * 0.003);
      ctx.beginPath(); ctx.arc(p[0], p[1], R * (0.022 + 0.05 * pulse), 0, 7); ctx.stroke();
      ctx.fillStyle = "rgba(" + ACCENT + "," + (0.5 + 0.5 * p[2]).toFixed(3) + ")";
      ctx.beginPath(); ctx.arc(p[0], p[1], R * 0.021, 0, 7); ctx.fill();
    }
  }

  fit();
  addEventListener("resize", fit, { passive: true });

  if (reduced) { draw(0); addEventListener("resize", function () { draw(0); }, { passive: true }); return; }

  /* drag to spin, with inertia back to a lazy cruise */
  cv.addEventListener("pointerdown", function (e) {
    dragging = true; lastX = e.clientX; cv.setPointerCapture(e.pointerId);
  });
  cv.addEventListener("pointermove", function (e) {
    if (!dragging) return;
    var d = (e.clientX - lastX) / (size || 1) * 3.2;
    lastX = e.clientX; rot += d; vel = d;
  });
  ["pointerup", "pointercancel"].forEach(function (ev) {
    cv.addEventListener(ev, function () { dragging = false; });
  });

  /* stay idle until scrolled into view so page load pays nothing for the globe */
  var visible = !("IntersectionObserver" in window);
  if (!visible) {
    new IntersectionObserver(function (en) { visible = en[0].isIntersecting; }, { rootMargin: "80px" })
      .observe(cv);
  }
  var BASE = 0.0044, last = 0;
  (function loop(t) {
    if (visible && t - last >= 30) { /* ~30fps is plenty for a slow spin */
      last = t;
      if (!dragging) {
        vel += (BASE - vel) * 0.04;
        rot += vel;
      }
      draw(t);
    }
    requestAnimationFrame(loop);
  })(0);
})();
