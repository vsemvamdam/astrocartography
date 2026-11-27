/* The Ascendant and Moon sign from the same birth chart used across AstroSky. */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  let app, place;

  function setPosition(signId, degreeId, longitude) {
    const sign = ACG.formatZodiac(longitude);
    $(signId).textContent = sign.name;
    $(degreeId).textContent = `${sign.deg}°${String(sign.min).padStart(2, '0')}′`;
  }

  function update() {
    if (!app || $('ascendentView').hidden || app.state.example || !app.chart) return;
    const birth = app.current(), chart = app.chart;
    place = birth.place;
    $('ascDate').value = birth.date;
    $('ascTime').value = birth.time;
    $('ascPlace').value = app.placeLabel(place);
    $('ascPlace').setCustomValidity('');

    const house = app.state.natal?.house || 'P';
    const meridian = ACG.norm360(chart.gast + place.lon);
    const asc = NATAL.computeHouses(house, meridian, chart.eps, place.lat).asc;
    const moon = chart.bodies.find((body) => body.id === 'Moon');
    setPosition('ascSign', 'ascDegree', asc);
    setPosition('ascMoonSign', 'ascMoonDegree', moon.elon);

    const manual = birth.manualOffset == null ? '' : ' (задано вручную)';
    $('ascZone').textContent = `Смещение на дату рождения: ${app.fmtOffset(app.conv.offset)}${manual}.`;
    const note = app.timeZoneNote;
    $('ascZoneNote').textContent = note;
    $('ascZoneNote').hidden = !note;
    $('ascError').hidden = true;
    $('ascResult').hidden = false;
  }

  function init(api) {
    app = api;
    const form = $('ascBirthForm'), city = $('ascPlace'), result = $('ascResult'), error = $('ascError');
    app.makePlaceSearch(city, $('ascSuggest'), () => place, (selected) => {
      place = selected;
      city.setCustomValidity('');
      result.hidden = true;
      error.hidden = true;
    }, { autoPick: false });
    form.addEventListener('input', () => {
      city.setCustomValidity('');
      result.hidden = true;
      error.hidden = true;
    });
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (!place || city.value.trim() !== app.placeLabel(place)) {
        city.setCustomValidity('Выберите место рождения из списка.');
        city.reportValidity();
        return;
      }
      const date = $('ascDate').value, time = $('ascTime').value;
      const previous = app.current();
      const manualOffset = place === previous.place && date === previous.date && time === previous.time ? previous.manualOffset : null;
      try {
        if (!window.Astronomy) throw new Error('Astronomy Engine unavailable');
        app.loadChart({ date, time, place, manualOffset });
        result.focus();
      } catch (err) {
        result.hidden = true;
        error.textContent = 'Не получилось рассчитать карту. Проверьте данные рождения или обновите страницу.';
        error.hidden = false;
        console.error(err);
      }
    });
    $('ascFields').disabled = false;
  }

  window.AscendentView = { init, update };
})();
