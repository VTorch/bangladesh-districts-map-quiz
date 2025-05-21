// js/script.js

// -- loading bar logic --
const bar  = document.getElementById("loading-bar");
const cont = document.getElementById("loading-container");
let loadInt;
function startLoading() {
  cont.style.display = "block";
  bar.style.width    = "0%";
  let pct = 0;
  loadInt = setInterval(() => {
    pct = Math.min(80, pct + Math.random() * 5);
    bar.style.width = pct + "%";
  }, 200);
}
function finishLoading() {
  clearInterval(loadInt);
  bar.style.width = "100%";
  setTimeout(() => (cont.style.display = "none"), 300);
}

// -- constants & state --
const DEFAULT_FILL   = "#1a9641",
      HOVER_FILL     = "#66c2a4",
      CORRECT_COLORS = ["#ffffff","#ffffb2","#fed976"],
      REVEALED_COLOR = "#d73027";

let map,
    districtLayer,
    featuresByName = {},
    names    = [],
    remaining= [],
    correct  = 0,
    attempts = 0,
    tries    = 0,
    currentTarget = null,
    startTime     = Date.now(),
    timerInterval;

const overlay = document.getElementById("completion-overlay");
const wrapper = document.querySelector(".map-wrapper");

// -- helper functions --
function styleDefault() {
  return { color:"#ffffff", weight:1, fillOpacity:1, fillColor:DEFAULT_FILL };
}
function styleForCorrect(atts) {
  return { fillColor: CORRECT_COLORS[Math.min(atts,2)] };
}
function updateStatus() {
  if (currentTarget === null) return;
  document.getElementById("left").textContent     = `Left: ${remaining.length}`;
  let acc = attempts ? ((correct/attempts*100).toFixed(1)) : "0.0";
  document.getElementById("accuracy").textContent = `Accuracy: ${acc}%`;
  let secs = Math.floor((Date.now() - startTime)/1000);
  document.getElementById("timer").textContent    = `Time: ${secs}s`;
  document.getElementById("prompt").textContent   = `Click on: ${currentTarget}`;
  document.getElementById("cursor-tooltip").textContent = `Click on: ${currentTarget}`;
}
function blinkRed(layer) {
  let on=false, count=0;
  const iv = setInterval(() => {
    layer.setStyle({ fillColor: on ? REVEALED_COLOR : DEFAULT_FILL });
    on = !on;
    if (++count >= 6) {
      clearInterval(iv);
      layer.setStyle({ fillColor: REVEALED_COLOR });
    }
  }, 200);
}

// -- click logic --
function handleClick(feature, layer) {
  // already answered? show green tooltip
  if (layer.answered) {
    layer.bindTooltip(feature.properties.ADM2_EN, {
      permanent: true, direction: "center", className: "revealed-tooltip"
    }).openTooltip();
    const el = layer.getTooltip().getElement();
    el.style.opacity = 1;
    setTimeout(() => {
      el.style.opacity = 0;
      setTimeout(() => {
        layer.closeTooltip(); layer.unbindTooltip();
      }, 200);
    }, 500);
    return;
  }
  if (!currentTarget) return;

  attempts++; updateStatus();

  if (feature.properties.ADM2_EN === currentTarget) {
    // correct!
    layer.setStyle(styleForCorrect(tries));
    layer.answered = true;
    correct++;
    setTimeout(nextQuestion, 500);

  } else {
    // wrong: fade red tooltip
    layer.bindTooltip(feature.properties.ADM2_EN, {
      permanent: true, direction: "center", className: "wrong-tooltip"
    }).openTooltip();
    const el = layer.getTooltip().getElement();
    requestAnimationFrame(() => (el.style.opacity = 1));
    setTimeout(() => {
      el.style.opacity = 0;
      setTimeout(() => {
        layer.closeTooltip(); layer.unbindTooltip();
      }, 200);
    }, 500);

    tries++;
    if (tries >= 3) {
      const tgt = featuresByName[currentTarget];
      tgt.answered = true;
      blinkRed(tgt);
      setTimeout(nextQuestion, 1200);
    }
  }
}

// -- next question --
function nextQuestion(delay = 0) {
  setTimeout(() => {
    districtLayer.eachLayer(l => {
      if (!l.answered) l.setStyle(styleDefault());
    });

    if (!remaining.length) {
      currentTarget = null;
      clearInterval(timerInterval);
      finishLoading();
      let acc = attempts ? ((correct/attempts*100).toFixed(1)) : "0.0";
      overlay.textContent = `Quiz Complete!\nAccuracy: ${acc}%`;
      overlay.style.display = "block";
      return;
    }
    const idx = Math.floor(Math.random()*remaining.length);
    currentTarget = remaining.splice(idx,1)[0];
    tries = 0;
    updateStatus();
  }, delay);
}

// -- initialize map --
startLoading();

map = L.map("map", {
  center:[23.7,90.4], zoom:7, maxZoom:12, zoomControl:false,
  zoomAnimation:false, wheelDebounceTime:0, zoomDelta:1, zoomSnap:0
});

// ctrl+wheel for zoom
map.scrollWheelZoom.disable();
document.addEventListener("keydown", e => { if (e.key==="Control") map.scrollWheelZoom.enable(); });
document.addEventListener("keyup",   e => { if (e.key==="Control") map.scrollWheelZoom.disable(); });

// middle-button pan cursor
map.getContainer().addEventListener("mousedown", e => {
  if (e.button===1) map.getContainer().style.cursor="grabbing";
});
map.getContainer().addEventListener("mouseup", e => {
  if (e.button===1) map.getContainer().style.cursor="";
});

// cursor tooltip follows pointer within wrapper
wrapper.addEventListener("mousemove", e => {
  const tt = document.getElementById("cursor-tooltip");
  const rect = wrapper.getBoundingClientRect();
  const x = e.clientX - rect.left, y = e.clientY - rect.top;
  tt.style.left = (x + 12) + "px";
  tt.style.top  = (y + 12) + "px";
});

// load GeoJSON and start quiz
fetch("data/bangladesh_districts.geojson")
  .then(r => r.json())
  .then(geojson => {
    geojson.features.forEach(f => names.push(f.properties.ADM2_EN));
    remaining = names.slice();

    districtLayer = L.geoJSON(geojson, {
      style: styleDefault,
      onEachFeature: (f,l) => {
        const name = f.properties.ADM2_EN;
        featuresByName[name] = l;
        l.answered = false;
        l.on("click", () => handleClick(f,l));
        l.on("mouseover", () => { if (!l.answered) l.setStyle({ fillColor:HOVER_FILL }); });
        l.on("mouseout",  () => { if (!l.answered) l.setStyle(styleDefault()); });
      }
    }).addTo(map);

    const bounds = districtLayer.getBounds();
    map.fitBounds(bounds);
    const initZ = map.getZoom();
    map.setMinZoom(initZ);
    map.setMaxBounds(bounds.pad(0.05));
    map.options.maxBoundsViscosity = 1.0;

    nextQuestion();
    timerInterval = setInterval(updateStatus,1000);
    finishLoading();
  });
