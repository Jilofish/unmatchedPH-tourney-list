// Global state
let tournamentData = [];

// DOM Elements
const provinceSelect = document.getElementById('provinceSelect');
const dateSelect = document.getElementById('dateSelect');
const clearFiltersBtn = document.getElementById('clearFilters');
const resultsContainer = document.getElementById('results');
const loadingSpinner = document.getElementById('loadingSpinner');
const noResults = document.getElementById('noResults');
const resultCount = document.getElementById('resultCount');

// Initialize
document.addEventListener('DOMContentLoaded', init);

function init() {
  loadData();
  clearFiltersBtn.addEventListener('click', clearFilters);
  provinceSelect.addEventListener('change', filterTournaments);
  dateSelect.addEventListener('change', filterTournaments);
}

// Check if value represents "completed"
function isCompletedValue(v) {
  if (v === true || v === 1 || v === '1') return true;
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    return s === 'true' || s === 'yes' || s === 'y';
  }
  return false;
}

// Parse Google Sheets date format
function parseGvizDate(val) {
  if (!val) return '';
  const match = /Date\((\d+),(\d+),(\d+)(?:,(\d+),(\d+),(\d+))?\)/.exec(val);
  if (match) {
    const year = +match[1];
    const month = +match[2];
    const day = +match[3];
    const hour = +match[4] || 0;
    const minute = +match[5] || 0;
    return new Date(year, month, day, hour, minute);
  }
  const d = new Date(val);
  return isNaN(d) ? '' : d;
}

// Format date for display (e.g., "October 28, 2025")
function formatDateDisplay(dateObj) {
  if (!(dateObj instanceof Date) || isNaN(dateObj)) return '';
  const options = { month: 'long', day: 'numeric', year: 'numeric' };
  return dateObj.toLocaleDateString('en-US', options);
}

// Format date for dropdown (e.g., "October 28, 2025 - Tuesday")
function formatDateWithDay(dateObj, day) {
  if (!(dateObj instanceof Date) || isNaN(dateObj)) return '';
  const dateStr = formatDateDisplay(dateObj);
  return day ? `${dateStr} - ${day}` : dateStr;
}

// Get day name from date
function getDayName(dateObj) {
  if (!(dateObj instanceof Date) || isNaN(dateObj)) return '';
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  return days[dateObj.getDay()];
}

// Format time for display
function formatTimeDisplay(dateObj, raw) {
  if (dateObj instanceof Date && !isNaN(dateObj.getTime())) {
    const hr = dateObj.getHours();
    const min = dateObj.getMinutes().toString().padStart(2, '0');
    const ampm = hr >= 12 ? 'PM' : 'AM';
    const displayHr = hr % 12 || 12;
    return `${displayHr}:${min} ${ampm}`;
  }
  return raw || '';
}

// Load tournament data from Google Sheets
async function loadData() {
  const sheetId = '1FD24EVlWx1oB3BLXLHo-dcznxYqNafbf5xHEFjgnvow';
  const sheetName = 'UPDATED MONTH';
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json&sheet=${sheetName}`;

  try {
    showLoading(true);
    const res = await fetch(url);
    const text = await res.text();
    const json = JSON.parse(text.substr(47).slice(0, -2));
    const rows = json.table.rows || [];

    const data = rows.map(r => {
      const rawDate = r.c[2]?.v ?? '';
      const rawTime = r.c[3]?.v ?? '';
      const dateObj = parseGvizDate(rawDate);
      const timeObj = parseGvizDate(rawTime);
      const dayFromSheet = r.c[1]?.v ?? '';
      const dayFromDate = getDayName(dateObj);

      return {
        day: dayFromSheet || dayFromDate,
        date: dateObj,
        dateString: dateObj ? dateObj.toISOString() : '',
        time: formatTimeDisplay(timeObj, r.c[3]?.f ?? r.c[3]?.v),
        isCompleted: isCompletedValue(r.c[4]?.v),
        tournamentName: (r.c[5]?.v ?? '').toString(),
        organizer: (r.c[6]?.v ?? '').toString(),
        location: (r.c[7]?.v ?? '').toString(),
        province: (r.c[8]?.v ?? '').toString(),
        remarks: (r.c[9]?.v ?? '').toString(),
        fbLink: (r.c[10]?.v ?? '').toString()
      };
    });

    // Filter tournaments: not completed, has date, has organizer
    tournamentData = data
      .filter(d =>
        !d.isCompleted &&
        d.date !== '' &&
        d.organizer.trim() !== ''
      )
      .sort((a, b) => new Date(a.date) - new Date(b.date));

    populateFilters();
    filterTournaments();
    showLoading(false);
  } catch (err) {
    console.error('Error loading data:', err);
    showError('Failed to load tournaments. Please refresh the page.');
    showLoading(false);
  }
}

// Populate filter dropdowns
function populateFilters() {
  // Populate provinces
  const provinces = [...new Set(tournamentData.map(d => d.province).filter(Boolean))].sort();
  provinceSelect.innerHTML = '<option value="">All Provinces</option>';
  provinces.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p;
    opt.textContent = p;
    provinceSelect.appendChild(opt);
  });

  // Populate dates with day names
  const uniqueDates = [];
  const seenDates = new Set();
  
  tournamentData.forEach(t => {
    if (t.dateString && !seenDates.has(t.dateString)) {
      seenDates.add(t.dateString);
      uniqueDates.push({
        dateObj: t.date,
        dateString: t.dateString,
        day: t.day,
        displayText: formatDateWithDay(t.date, t.day)
      });
    }
  });

  // Sort by date
  uniqueDates.sort((a, b) => new Date(a.dateString) - new Date(b.dateString));

  dateSelect.innerHTML = '<option value="">All Dates</option>';
  uniqueDates.forEach(d => {
    const opt = document.createElement('option');
    opt.value = d.dateString;
    opt.textContent = d.displayText;
    dateSelect.appendChild(opt);
  });
}

// Filter and display tournaments
function filterTournaments() {
  const province = provinceSelect.value;
  const selectedDate = dateSelect.value;

  let filtered = tournamentData;

  if (province) {
    filtered = filtered.filter(t => t.province === province);
  }

  if (selectedDate) {
    filtered = filtered.filter(t => t.dateString === selectedDate);
  }

  displayTournaments(filtered);
  updateResultCount(filtered.length);
}

// Display tournaments in grid
function displayTournaments(tournaments) {
  resultsContainer.innerHTML = '';

  if (tournaments.length === 0) {
    noResults.style.display = 'block';
    return;
  }

  noResults.style.display = 'none';

  tournaments.forEach((t, index) => {
    const name = t.tournamentName?.trim() || 'No Tournament Name';
    const formattedDate = formatDateDisplay(t.date);
    
    const card = document.createElement('div');
    card.className = 'tournament-card';
    card.style.animationDelay = `${index * 0.05}s`;
    
    card.innerHTML = `
      <h3>${escapeHtml(name)}</h3>
      <p class="date">${escapeHtml(formattedDate)}</p>
      <p class="day">${escapeHtml(t.day)}</p>
      <div><p class="time" style="color: black;">${escapeHtml(t.time)}</p></div>
      <p><strong style="color: black;">Organizer: ${escapeHtml(t.organizer)}</strong></p>
      <p><strong style="color: black;">Location:</strong> </p>
      <p><div style="color: black;"> &#128204; ${escapeHtml(t.location)}</div></p>
      ${t.remarks ? `<p style="color: black;"><strong style="color: black;">Remarks:</strong> <br>${escapeHtml(t.remarks)} </p>` : ''}
      ${t.fbLink ? `<a href="${escapeAttr(t.fbLink)}" target="_blank" rel="noopener noreferrer">View Event</a>` : ''}
    `;
    
    resultsContainer.appendChild(card);
  });
}

// Clear all filters
function clearFilters() {
  provinceSelect.value = '';
  dateSelect.value = '';
  filterTournaments();
}

// Update result count display
function updateResultCount(count) {
  if (count === 0) {
    resultCount.textContent = '';
  } else if (count === tournamentData.length) {
    resultCount.textContent = `Showing all ${count} tournament${count !== 1 ? 's' : ''}`;
  } else {
    resultCount.textContent = `Showing ${count} of ${tournamentData.length} tournament${count !== 1 ? 's' : ''}`;
  }
}

// Show/hide loading spinner
function showLoading(show) {
  loadingSpinner.style.display = show ? 'flex' : 'none';
  resultsContainer.style.display = show ? 'none' : 'grid';
}

// Show error message
function showError(message) {
  resultsContainer.innerHTML = `
    <div style="grid-column: 1/-1; text-align: center; color: white; padding: 40px;">
      <h3>⚠️ ${message}</h3>
    </div>
  `;
}

// Escape HTML to prevent XSS
function escapeHtml(s) {
  if (!s) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Escape HTML attributes
function escapeAttr(s) {
  return escapeHtml(s).replace(/"/g, '&quot;');
}