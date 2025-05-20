// static/js/script.js

// -- constants & state --
const DEFAULT_FILL    = "#1a9641";
const HOVER_FILL      = "#66c2a4";
const CORRECT_COLORS  = ["#ffffff", "#ffffb2", "#fed976"];
const REVEALED_COLOR  = "#d73027";

let map, districtLayer, featuresByName = {};
let names = [], remaining = [];
let correct = 0, attempts = 0;
let currentTarget = null, tries = 0;
let startTime = Date.now();
let timerInterval;

// create and style completion overlay
const overlay = document.createElement('div');
overlay.id = 'completion-overlay';
Object.assign(overlay.style, {
  position: 'absolute',
  top: '50%',
  left: '50%',
  transform: 'translate(-50%,-50%)',
  background: 'rgba(255,255,255,0.95)',
  padding: '20px 30px',
  fontSize: '2em',
  fontWeight: 'bold',
  textAlign: 'center',
  borderRadius: '8px',
  color: '#333',
  zIndex: '1002',
  display: 'none'
});
document.body.appendChild(overlay);

// -- helper functions --

function styleDefault() {
  return { color: "#ffffff", weight: 1, fillOpacity: 1.0, fillColor: DEFAULT_FILL };
}

function styleForCorrect(atts) {
  return { fillColor: CORRECT_COLORS[Math.min(atts, CORRECT_COLORS.length - 1)] };
}

function updateStatus() {
  // if quiz is done, skip updating status bar
  if (currentTarget === null) return;
  document.getElementById("left").textContent     = `Left: ${remaining.length}`;
  let acc = attempts ? ((correct / attempts) * 100).toFixed(1) : "0.0";
  document.getElementById("accuracy").textContent = `Accuracy: ${acc}%`;
  let secs = Math.floor((Date.now() - startTime) / 1000);
  document.getElementById("timer").textContent    = `Time: ${secs}s`;
  document.getElementById("prompt").textContent   = `Click on: ${currentTarget}`;
  document.getElementById("cursor-tooltip").textContent = `Click on: ${currentTarget}`;
}

function blinkRed(layer) {
  let on = false, count = 0;
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
  // if already answered, show light-green tooltip
  if (layer.answered) {
    layer.bindTooltip(feature.properties.ADM2_EN, {
      permanent: true,
      direction: "center",
      className: "revealed-tooltip"
    }).openTooltip();
    const tipEl = layer.getTooltip().getElement();
    tipEl.style.opacity = 1;
    setTimeout(() => {
      tipEl.style.opacity = 0;
      setTimeout(() => {
        layer.closeTooltip();
        layer.unbindTooltip();
      }, 200);
    }, 500);
    return;
  }

  if (!currentTarget) return;  // quiz already done

  // count this attempt
  attempts++;
  updateStatus();

  if (feature.properties.ADM2_EN === currentTarget) {
    // correct
    layer.setStyle(styleForCorrect(tries));
    layer.answered = true;
    correct++;
    setTimeout(nextQuestion, 500);

  } else {
    // wrong: fading red tooltip
    layer.bindTooltip(feature.properties.ADM2_EN, {
      permanent: true,
      direction: "center",
      className: "wrong-tooltip"
    }).openTooltip();
    const tipEl = layer.getTooltip().getElement();
    requestAnimationFrame(() => tipEl.style.opacity = 1);
    setTimeout(() => {
      tipEl.style.opacity = 0;
      setTimeout(() => {
        layer.closeTooltip();
        layer.unbindTooltip();
      }, 200);
    }, 500);

    tries++;
    if (tries >= 3) {
      // reveal after 3 wrong attempts
      const targetLayer = featuresByName[currentTarget];
      targetLayer.answered = true;
      blinkRed(targetLayer);
      setTimeout(nextQuestion, 1200);
    }
  }
}

function nextQuestion(delay = 0) {
  setTimeout(() => {
    // reset style on unanswered districts
    districtLayer.eachLayer(l => {
      if (!l.answered) l.setStyle(styleDefault());
    });

    if (remaining.length === 0) {
      // quiz done: stop timer and show overlay
      currentTarget = null;
      clearInterval(timerInterval);
      let finalAcc = attempts ? ((correct / attempts) * 100).toFixed(1) : "0.0";
      overlay.textContent = `Quiz Complete!\nAccuracy: ${finalAcc}%`;
      overlay.style.display = 'block';
      return;
    }

    // pick next target
    const idx = Math.floor(Math.random() * remaining.length);
    currentTarget = remaining.splice(idx, 1)[0];
    tries = 0;
    updateStatus();
  }, delay);
}

// -- initialize map --
map = L.map("map", {
  center: [23.7, 90.4],
  zoom: 7,
  maxZoom: 12,
  zoomControl: false,
  zoomAnimation: false,
  wheelDebounceTime: 0,
  zoomDelta: 1,
  zoomSnap: 0
});

// only zoom on Ctrl key
map.scrollWheelZoom.disable();
document.addEventListener("keydown", e => {
  if (e.key === "Control") map.scrollWheelZoom.enable();
});
document.addEventListener("keyup", e => {
  if (e.key === "Control") map.scrollWheelZoom.disable();
});

// middle-button panning cursor
map.getContainer().addEventListener("mousedown", e => {
  if (e.button === 1) map.getContainer().style.cursor = "grabbing";
});
map.getContainer().addEventListener("mouseup", e => {
  if (e.button === 1) map.getContainer().style.cursor = "";
});

// custom cursor tooltip
map.getContainer().addEventListener("mousemove", e => {
  const tt = document.getElementById("cursor-tooltip");
  tt.style.left = (e.clientX + 12) + "px";
  tt.style.top  = (e.clientY + 12) + "px";
});

// load GeoJSON and set up quiz
fetch("data/bangladesh_districts.geojson")
  .then(res => res.json())
  .then(geojson => {
    geojson.features.forEach(f => names.push(f.properties.ADM2_EN));
    remaining = names.slice();

    districtLayer = L.geoJSON(geojson, {
      style: styleDefault,
      onEachFeature: (feature, layer) => {
        const name = feature.properties.ADM2_EN;
        featuresByName[name] = layer;
        layer.answered = false;

        layer.on("click", () => handleClick(feature, layer));
        layer.on("mouseover", () => {
          if (!layer.answered) layer.setStyle({ fillColor: HOVER_FILL });
        });
        layer.on("mouseout", () => {
          if (!layer.answered) layer.setStyle(styleDefault());
        });
      }
    }).addTo(map);

    // constrain map to Bangladesh bounds
    const bounds = districtLayer.getBounds();
    map.fitBounds(bounds);
    const initialZoom = map.getZoom();
    map.setMinZoom(initialZoom);
    map.setMaxBounds(bounds.pad(0.05));
    map.options.maxBoundsViscosity = 1.0;

    // start quiz and timer
    nextQuestion();
    timerInterval = setInterval(updateStatus, 1000);
  });
